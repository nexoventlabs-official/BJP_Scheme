/**
 * WhatsApp Flow Endpoint — RSA-OAEP + AES-128-GCM encrypted data exchange.
 * Drives the Register flow and the Service flow with dynamic, bilingual data.
 */
const express = require('express');
const crypto = require('crypto');

const flowImages = require('../services/waFlowImages');
const { urlToBase64 } = require('../services/waImageBase64');
const { last10, SERVICES } = require('../services/waHelpers');
const { findVoterByEpic } = require('../services/voterSearchService');
const { getSchemesCatalog } = require('../controllers/schemeController');
const { getAssemblyMetadata, getBoothCredentialsForAssembly } = require('../services/jurisdictionService');

const User = require('../models/User');
const Scheme = require('../models/Scheme');
const SchemeApplication = require('../models/SchemeApplication');
const BoothPresidentRequest = require('../models/BoothPresidentRequest');
const WhatsAppContact = require('../models/WhatsAppContact');

const router = express.Router();

/* ───────── Encryption ───────── */
const FLOW_PRIVATE_KEY = (process.env.FLOW_PRIVATE_KEY || '').split('\\n').join('\n');

function decryptRequest(body) {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body || {};
  if (!FLOW_PRIVATE_KEY) return { decryptedBody: body, aesKeyBuffer: null, ivBuffer: null };
  if (!encrypted_aes_key || !encrypted_flow_data || !initial_vector) throw new Error('Missing encryption fields');

  const privateKey = crypto.createPrivateKey({ key: FLOW_PRIVATE_KEY, format: 'pem' });
  const aesKeyBuffer = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(encrypted_aes_key, 'base64')
  );
  const ivBuffer = Buffer.from(initial_vector, 'base64');
  const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
  const authTag = flowDataBuffer.slice(-16);
  const ciphertext = flowDataBuffer.slice(0, -16);
  const decipher = crypto.createDecipheriv('aes-128-gcm', aesKeyBuffer, ivBuffer);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return { decryptedBody: JSON.parse(plain.toString('utf-8')), aesKeyBuffer, ivBuffer };
}

function encryptResponse(obj, aesKeyBuffer, ivBuffer) {
  if (!aesKeyBuffer || !ivBuffer) return obj;
  const flipped = Buffer.alloc(ivBuffer.length);
  for (let i = 0; i < ivBuffer.length; i++) flipped[i] = ~ivBuffer[i] & 0xff;
  const cipher = crypto.createCipheriv('aes-128-gcm', aesKeyBuffer, flipped);
  const out = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf-8'), cipher.final(), cipher.getAuthTag()]);
  return out.toString('base64');
}

/* ───────── i18n labels ───────── */
const L = (lang, en, ta) => (lang === 'ta' && ta ? ta : en);
const UI = {
  reg_title: (l) => L(l, 'Voter Registration', 'வாக்காளர் பதிவு'),
  reg_body: (l) => L(l, 'Enter your EPIC (Voter ID) number to register. Your WhatsApp number is pre-filled.', 'பதிவு செய்ய உங்கள் வாக்காளர் அடையாள (EPIC) எண்ணை உள்ளிடவும். உங்கள் வாட்ஸ்அப் எண் ஏற்கனவே நிரப்பப்பட்டுள்ளது.'),
  mobile_label: (l) => L(l, 'WhatsApp Number', 'வாட்ஸ்அப் எண்'),
  epic_label: (l) => L(l, 'EPIC (Voter ID) Number', 'வாக்காளர் அடையாள (EPIC) எண்'),
  cont: (l) => L(l, 'Continue', 'தொடரவும்'),
  confirm_reg: (l) => L(l, 'Confirm & Continue', 'உறுதிசெய்து தொடரவும்'),
  choose_scheme: (l) => L(l, 'Choose a Scheme', 'ஒரு திட்டத்தைத் தேர்ந்தெடுக்கவும்'),
  choose_scheme_body: (l) => L(l, 'Select a scheme you want to apply for.', 'நீங்கள் விண்ணப்பிக்க விரும்பும் திட்டத்தைத் தேர்ந்தெடுக்கவும்.'),
  confirm_apply: (l) => L(l, 'Confirm & Apply', 'உறுதிசெய்து விண்ணப்பிக்கவும்'),
  done: (l) => L(l, 'Done', 'முடிந்தது'),
  close: (l) => L(l, 'Close', 'மூடு'),
  reg_done_title: (l) => L(l, '🙏 Registration Complete', '🙏 பதிவு முடிந்தது'),
  select_service: (l) => L(l, 'Select a Service', 'ஒரு சேவையைத் தேர்ந்தெடுக்கவும்'),
  select_service_body: (l) => L(l, 'Choose an option below.', 'கீழே ஒரு விருப்பத்தைத் தேர்ந்தெடுக்கவும்.'),
  my_schemes: (l) => L(l, 'My Schemes', 'எனது திட்டங்கள்'),
  my_schemes_body: (l) => L(l, 'Select a scheme to view its status.', 'நிலையைக் காண ஒரு திட்டத்தைத் தேர்ந்தெடுக்கவும்.'),
  view_status: (l) => L(l, 'View Status', 'நிலையைக் காண்க'),
  apply_title: (l) => L(l, 'Apply for Schemes', 'திட்டங்களுக்கு விண்ணப்பிக்க'),
  apply_body: (l) => L(l, 'Select a scheme to apply for.', 'விண்ணப்பிக்க ஒரு திட்டத்தைத் தேர்ந்தெடுக்கவும்.'),
  members_title: (l) => L(l, 'My Members', 'எனது உறுப்பினர்கள்'),
  members_body: (l) => L(l, 'Members you referred.', 'நீங்கள் பரிந்துரைத்த உறுப்பினர்கள்.'),
  booth_title: (l) => L(l, 'Be a Booth President', 'பூத் தலைவராகுங்கள்'),
  booth_another: (l) => L(l, 'Apply for a different booth', 'வேறு பூத்திற்கு விண்ணப்பிக்க'),
  booth_confirm_current: (l) => L(l, 'Confirm this Booth', 'இந்தப் பூத்தை உறுதிசெய்'),
  select_district: (l) => L(l, 'Select District', 'மாவட்டத்தைத் தேர்ந்தெடுக்கவும்'),
  select_assembly: (l) => L(l, 'Select Assembly', 'சட்டமன்றத் தொகுதியைத் தேர்ந்தெடுக்கவும்'),
  select_booth: (l) => L(l, 'Select Booth', 'பூத்தைத் தேர்ந்தெடுக்கவும்'),
  district: (l) => L(l, 'District', 'மாவட்டம்'),
  assembly: (l) => L(l, 'Assembly', 'சட்டமன்றத் தொகுதி'),
  booth: (l) => L(l, 'Booth', 'பூத்'),
  confirm: (l) => L(l, 'Confirm', 'உறுதிசெய்'),
  none_title: (l) => L(l, 'Nothing here yet', 'இதுவரை எதுவும் இல்லை'),
};

const schemeTitle = (s, l) => L(l, s.fullName || s.name, s.fullName_ta || s.name_ta);
const schemeBenefit = (s, l) => L(l, s.benefit, s.benefit_ta);
const schemeOverview = (s, l) => L(l, s.overview, s.overview_ta);

/* ───────── Image cache (globals, 10 min) ───────── */
let imgCache = { data: null, ts: 0 };
const IMG_TTL = 10 * 60 * 1000;
function clearImageCache() { imgCache = { data: null, ts: 0 }; }

async function loadGlobalImages() {
  if (imgCache.data && Date.now() - imgCache.ts < IMG_TTL) return imgCache.data;
  const keys = flowImages.GLOBAL_IMAGE_KEYS.map((k) => k.key);
  const map = await flowImages.getMap(keys);
  const entries = await Promise.all(
    keys.map(async (k) => {
      const url = map[k];
      if (!url) return [k, ''];
      const isBanner = k.includes('banner');
      const opts = isBanner
        ? { width: 1600, height: 200, crop: 'fill', quality: 80, format: 'jpg' }
        : { width: 200, height: 200, crop: 'fill', quality: 80, format: 'jpg' };
      return [k, await urlToBase64(url, opts)];
    })
  );
  const data = Object.fromEntries(entries);
  imgCache = { data, ts: Date.now() };
  return data;
}

const schemeIconB64 = (s) => (s.waLogo ? urlToBase64(s.waLogo, { width: 200, height: 200, crop: 'fill', quality: 80, format: 'jpg' }) : Promise.resolve(''));
// Scheme-detail banner uses the SAME ratio as the welcome/register banner (1600x200, 8:1)
const schemeBannerB64 = (s) => (s.waBanner ? urlToBase64(s.waBanner, { width: 1600, height: 200, crop: 'fill', quality: 80, format: 'jpg' }) : Promise.resolve(''));

/* ───────── Helpers ───────── */
function phoneFromToken(token) {
  return String(token || '').replace(/^reg_/, '').replace(/^svc_/, '').replace(/\D/g, '');
}
function isRegToken(t) { return typeof t === 'string' && t.startsWith('reg_'); }

async function getLang(phone) {
  try {
    const c = await WhatsAppContact.findOne({ phone: { $regex: `${last10(phone)}$` } }).lean();
    return c?.lang || 'ta';
  } catch { return 'ta'; }
}
async function saveContact(phone, patch) {
  try {
    await WhatsAppContact.updateOne({ phone: { $regex: `${last10(phone)}$` } }, { $set: patch });
  } catch { /* ignore */ }
}
async function getContactDoc(phone) {
  return WhatsAppContact.findOne({ phone: { $regex: `${last10(phone)}$` } });
}

function normalizeVoter(doc, colName = '') {
  return {
    epicNo: doc.EPIC_NO,
    name: doc.VOTER_NAME || 'BJP Member',
    relationName: doc.RELATION_NAME || doc.FATHER_NAME || '',
    gender: doc.GENDER || 'Unspecified',
    district: doc.DISTRICT || 'TAMIL NADU',
    assemblyNo: String(doc.ASSEMBLY_NO || colName.replace('ass_', '') || ''),
    assemblyName: doc.ASSEMBLY_NAME || `Assembly ${doc.ASSEMBLY_NO || ''}`,
    boothNo: String(doc.PART_NO || '1'),
  };
}

async function findUser(phone) {
  return User.findOne({ mobile: last10(phone) });
}

function statusLabel(s, l) {
  const map = {
    Pending: L(l, 'Pending', 'நிலுவையில்'),
    Submitted: L(l, 'Submitted', 'சமர்ப்பிக்கப்பட்டது'),
    Processing: L(l, 'Processing', 'செயலாக்கத்தில்'),
    Approved: L(l, 'Approved ✅', 'அங்கீகரிக்கப்பட்டது ✅'),
    Completed: L(l, 'Completed ✅', 'முடிந்தது ✅'),
    Rejected: L(l, 'Rejected', 'நிராகரிக்கப்பட்டது'),
  };
  return map[s] || s;
}

/* ───────── HTTP handler ───────── */
router.post('/', async (req, res) => {
  let aesKeyBuffer, ivBuffer, decryptedBody;
  try {
    ({ decryptedBody, aesKeyBuffer, ivBuffer } = decryptRequest(req.body));
  } catch (err) {
    console.error('[waFlow] decrypt failed:', err.message);
    return res.status(421).send();
  }

  const { action, screen, data, flow_token } = decryptedBody || {};
  if (action === 'ping') return sendResponse(res, { data: { status: 'active' } }, aesKeyBuffer, ivBuffer);
  if (data?.error) return sendResponse(res, { data: { acknowledged: true } }, aesKeyBuffer, ivBuffer);

  try {
    const isReg = isRegToken(flow_token);
    let response;
    if (action === 'INIT' || action === 'BACK') {
      response = isReg ? await regInit(flow_token) : await svcInit(flow_token);
    } else if (action === 'data_exchange') {
      response = isReg ? await regExchange({ screen, data, flow_token }) : await svcExchange({ screen, data, flow_token });
    } else {
      response = isReg ? await regInit(flow_token) : await svcInit(flow_token);
    }
    return sendResponse(res, response, aesKeyBuffer, ivBuffer);
  } catch (err) {
    console.error('[waFlow] handler error:', err.message, err.stack);
    const l = 'ta';
    return sendResponse(res, infoScreen({ flow_token, title: UI.none_title(l), body: L(l, 'Something went wrong. Please type hi and try again.', 'ஏதோ தவறு நடந்தது. hi என தட்டச்சு செய்து மீண்டும் முயற்சிக்கவும்.') }), aesKeyBuffer, ivBuffer);
  }
});

function sendResponse(res, obj, aesKeyBuffer, ivBuffer) {
  const payload = { version: '3.0', ...obj };
  const out = encryptResponse(payload, aesKeyBuffer, ivBuffer);
  if (typeof out === 'string') { res.set('Content-Type', 'text/plain'); return res.send(out); }
  return res.json(out);
}

function infoScreen({ flow_token, title, body }) {
  return { screen: 'INFO', data: { title, body_md: `# ${title}\n\n${body}`, cta: 'Done', flow_token: flow_token || '', post_action: '' } };
}

/* ═══════════ REGISTER FLOW ═══════════ */
async function regInit(flow_token) {
  const phone = phoneFromToken(flow_token);
  const l = await getLang(phone);
  const imgs = await loadGlobalImages();
  return {
    screen: 'REG_START',
    data: {
      banner: imgs.wa_register_banner || '', has_banner: !!imgs.wa_register_banner,
      title: UI.reg_title(l), body: UI.reg_body(l),
      error_text: '', has_error: false,
      init_phone: phone, init_epic: '',
      mobile_label: UI.mobile_label(l), epic_label: UI.epic_label(l),
      cta: UI.cont(l),
    },
  };
}

async function regStartError(phone, l, msg, epic = '') {
  const imgs = await loadGlobalImages();
  return {
    screen: 'REG_START',
    data: {
      banner: imgs.wa_register_banner || '', has_banner: !!imgs.wa_register_banner,
      title: UI.reg_title(l), body: UI.reg_body(l),
      error_text: msg, has_error: true,
      init_phone: phone, init_epic: epic,
      mobile_label: UI.mobile_label(l), epic_label: UI.epic_label(l),
      cta: UI.cont(l),
    },
  };
}

async function regExchange({ screen, data, flow_token }) {
  const phone = phoneFromToken(flow_token);
  const l = await getLang(phone);

  if (screen === 'REG_START') {
    const epic = String(data?.epic_no || '').trim().toUpperCase();
    if (!epic) return regStartError(phone, l, L(l, 'Please enter your EPIC number.', 'உங்கள் EPIC எண்ணை உள்ளிடவும்.'), epic);
    let result = null;
    try { result = await findVoterByEpic(epic); } catch { return regStartError(phone, l, L(l, 'Voter database is busy. Please try again.', 'வாக்காளர் தரவுத்தளம் பணிமிகுதியில் உள்ளது. மீண்டும் முயற்சிக்கவும்.'), epic); }
    if (!result || !result.doc) return regStartError(phone, l, L(l, `No voter record found for EPIC "${epic}".`, `"${epic}" EPIC-க்கு பதிவு எதுவும் கிடைக்கவில்லை.`), epic);

    const voter = normalizeVoter(result.doc, result.colName);
    await saveContact(phone, { voterSnapshot: voter });

    const relLabel = /^h/i.test(voter.relationName ? (result.doc.RELATION_TYPE || '') : '') ? L(l, 'Husband', 'கணவர்') : L(l, 'Guardian', 'பாதுகாவலர்');
    const md =
      `# ${L(l, 'Confirm Your Details', 'உங்கள் விவரங்களை உறுதிசெய்யவும்')}\n\n` +
      `${L(l, 'We found the following voter record. Please confirm.', 'பின்வரும் வாக்காளர் பதிவு கிடைத்தது. உறுதிசெய்யவும்.')}\n\n` +
      `| **${L(l, 'Field', 'விவரம்')}** | **${L(l, 'Value', 'மதிப்பு')}** |\n| :--- | :--- |\n` +
      `| ${L(l, 'Name', 'பெயர்')} | **${voter.name}** |\n` +
      `| ${L(l, 'EPIC Number', 'EPIC எண்')} | ${voter.epicNo} |\n` +
      `| ${relLabel} | ${voter.relationName || '—'} |\n` +
      `| ${L(l, 'Gender', 'பாலினம்')} | ${voter.gender} |\n` +
      `| ${L(l, 'District', 'மாவட்டம்')} | ${voter.district} |\n` +
      `| ${L(l, 'Assembly', 'தொகுதி')} | ${voter.assemblyName} |\n` +
      `| ${L(l, 'Booth', 'பூத்')} | ${voter.boothNo} |`;
    return { screen: 'REG_CONFIRM', data: { title: L(l, 'Confirm', 'உறுதிசெய்'), confirm_md: md, cta: UI.confirm_reg(l) } };
  }

  if (screen === 'REG_CONFIRM') {
    return schemeListScreen('REG_SCHEMES', phone, l, { title: UI.choose_scheme(l), body: UI.choose_scheme_body(l), banner: (await loadGlobalImages()).wa_register_banner });
  }

  if (screen === 'REG_SCHEMES') {
    const schemeId = Number(data?.scheme);
    await saveContact(phone, { pendingScheme: schemeId });
    return schemeDetailScreen('REG_SCHEME_DETAIL', schemeId, l);
  }

  if (screen === 'REG_SCHEME_DETAIL') {
    // Finalize: create/find user + application.
    const contact = await getContactDoc(phone);
    const voter = contact?.voterSnapshot;
    const pickedId = Number(contact?.pendingScheme || 0);
    if (!voter) return regStartError(phone, l, L(l, 'Session expired. Please re-enter your EPIC.', 'அமர்வு காலாவதியானது. உங்கள் EPIC-ஐ மீண்டும் உள்ளிடவும்.'));

    const user = await upsertUserFromVoter(phone, voter);
    if (pickedId) await createApplication(user, pickedId);

    return {
      screen: 'REG_DONE',
      terminal: true, success: true,
      data: {
        title: UI.done(l),
        info_title: UI.reg_done_title(l),
        info_body: L(l, `Thank you ${voter.name}! You are registered. Tap Close to choose a service.`, `நன்றி ${voter.name}! நீங்கள் பதிவு செய்யப்பட்டீர்கள். சேவையைத் தேர்வு செய்ய மூடு என தட்டவும்.`),
        cta: UI.close(l),
        flow_token,
      },
    };
  }

  return regInit(flow_token);
}

// Shared: build a scheme RadioButtonsGroup screen (for register + apply).
async function schemeListScreen(screenId, phone, l, { title, body, banner, excludeIds = [] }) {
  const catalog = (await getSchemesCatalog()).filter((s) => s.active !== false && !excludeIds.includes(Number(s.id)));
  const bannerB64 = banner ? await urlToBase64(banner, { width: 1600, height: 200, crop: 'fill', quality: 80, format: 'jpg' }) : '';
  const items = await Promise.all(
    catalog.slice(0, 30).map(async (s) => {
      const image = await schemeIconB64(s);
      const item = { id: String(s.id), title: (schemeTitle(s, l) || '').slice(0, 30), description: (schemeBenefit(s, l) || '').slice(0, 60) };
      if (image) item.image = image;
      return item;
    })
  );
  if (!items.length) return infoScreen({ flow_token: `${screenId}`, title: UI.none_title(l), body: L(l, 'No schemes available yet.', 'இதுவரை திட்டங்கள் இல்லை.') });
  return { screen: screenId, data: { banner: bannerB64, has_banner: !!bannerB64, title, body, list_label: title, schemes: items, items, cta: UI.cont(l) } };
}

async function schemeDetailScreen(screenId, schemeId, l) {
  const phoneNeeded = false; // detail is stateless
  const s = (await getSchemesCatalog()).find((x) => Number(x.id) === Number(schemeId));
  if (!s) return infoScreen({ title: UI.none_title(l), body: L(l, 'Scheme not found.', 'திட்டம் கிடைக்கவில்லை.') });
  const banner = await schemeBannerB64(s);
  const body =
    `${schemeBenefit(s, l) ? '💡 ' + schemeBenefit(s, l) + '\n\n' : ''}` +
    `${schemeOverview(s, l) || ''}` +
    `${L(l, s.eligibility, s.eligibility_ta) ? '\n\n📋 ' + L(l, 'Eligibility', 'தகுதி') + ': ' + L(l, s.eligibility, s.eligibility_ta) : ''}`;
  return {
    screen: screenId,
    data: {
      banner: banner || '', has_banner: !!banner,
      title: (schemeTitle(s, l) || '').slice(0, 80),
      body: body.slice(0, 1024),
      cta: screenId === 'APPLY_DETAIL' ? UI.confirm_apply(l) : UI.confirm_apply(l),
    },
  };
}

async function upsertUserFromVoter(phone, voter) {
  const mobile = last10(phone);
  let user = await User.findOne({ mobile });
  if (!user) {
    const ntCode = 'NT-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    user = await User.create({
      mobile,
      epicNo: voter.epicNo || ('TEMP-' + Date.now()),
      voterName: voter.name,
      district: voter.district,
      assemblyName: voter.assemblyName,
      assemblyNo: voter.assemblyNo,
      boothNo: voter.boothNo,
      gender: voter.gender,
      referralCode: ntCode,
    });
  }
  return user;
}

async function createApplication(user, schemeId) {
  const s = (await getSchemesCatalog()).find((x) => Number(x.id) === Number(schemeId));
  if (!s) return null;
  const existing = await SchemeApplication.findOne({ userId: user._id, schemeId: s.id });
  if (existing) return existing;
  return SchemeApplication.create({
    userId: user._id, epicNo: user.epicNo, voterName: user.voterName, mobile: user.mobile,
    district: user.district, assemblyName: user.assemblyName, assemblyNo: user.assemblyNo, boothNo: user.boothNo,
    schemeId: s.id, schemeName: s.name, clusterName: s.cluster, benefit: s.benefit,
    status: 'Submitted', appliedAt: new Date(),
  });
}

/* ═══════════ SERVICE FLOW ═══════════ */
async function svcInit(flow_token) {
  const phone = phoneFromToken(flow_token);
  const l = await getLang(phone);
  const imgs = await loadGlobalImages();
  const services = SERVICES.map((s) => {
    const [title, description] = l === 'ta' ? s.ta : s.en;
    const item = { id: s.id, title, description };
    if (imgs[s.iconKey]) item.image = imgs[s.iconKey];
    return item;
  });
  return {
    screen: 'SERVICE_MENU',
    data: {
      banner: imgs.wa_choose_service_banner || '', has_banner: !!imgs.wa_choose_service_banner,
      title: UI.select_service(l), body: UI.select_service_body(l), list_label: UI.select_service(l), services, cta: UI.cont(l),
    },
  };
}

function doneScreen(screen, l, body_md, flow_token, post_action = '') {
  return { screen, data: { title: UI.done(l), body_md, cta: UI.done(l), flow_token: flow_token || '', post_action } };
}

async function svcExchange({ screen, data, flow_token }) {
  const phone = phoneFromToken(flow_token);
  const l = await getLang(phone);
  const user = await findUser(phone);

  if (!user && screen !== 'SERVICE_MENU') {
    return doneScreen('INFO', l, `# ${UI.none_title(l)}\n\n${L(l, 'Please register first — type hi.', 'முதலில் பதிவு செய்யவும் — hi என தட்டச்சு செய்யவும்.')}`, flow_token);
  }

  // ─── SERVICE_MENU → branch ───
  if (screen === 'SERVICE_MENU') {
    const sel = String(data?.service || '').trim();
    if (!user) return doneScreen('INFO', l, `# ${UI.none_title(l)}\n\n${L(l, 'Please register first — type hi.', 'முதலில் பதிவு செய்யவும் — hi.')}`, flow_token);

    if (sel === 'my_profile') return doneScreen('PROFILE', l, await profileMd(user, l), flow_token);

    if (sel === 'my_schemes') {
      const items = await appliedItems(user, l);
      if (!items.length) return doneScreen('INFO', l, `# ${UI.my_schemes(l)}\n\n${L(l, 'You have not applied for any scheme yet.', 'நீங்கள் இதுவரை எந்த திட்டத்திற்கும் விண்ணப்பிக்கவில்லை.')}`, flow_token);
      return { screen: 'MY_SCHEMES', data: { title: UI.my_schemes(l), body: UI.my_schemes_body(l), list_label: UI.my_schemes(l), items, cta: UI.view_status(l) } };
    }

    if (sel === 'apply_schemes') {
      const appliedIds = (await SchemeApplication.find({ userId: user._id }).select('schemeId').lean()).map((a) => Number(a.schemeId));
      const scr = await schemeListScreen('APPLY_LIST', phone, l, { title: UI.apply_title(l), body: UI.apply_body(l), banner: '', excludeIds: appliedIds });
      if (scr.screen === 'INFO') return doneScreen('INFO', l, scr.data.body_md, flow_token);
      return scr;
    }

    if (sel === 'referral') {
      return doneScreen('REFERRAL', l, referralMd(user, l), flow_token, 'send_referral');
    }

    if (sel === 'members') {
      const items = await memberItems(user, l);
      if (!items.length) return doneScreen('INFO', l, `# ${UI.members_title(l)}\n\n${L(l, 'You have not referred anyone yet.', 'நீங்கள் இதுவரை யாரையும் பரிந்துரைக்கவில்லை.')}`, flow_token);
      const imgs = await loadGlobalImages();
      return { screen: 'MEMBERS', data: { title: UI.members_title(l), body: UI.members_body(l), list_label: UI.members_title(l), items, cta: UI.done(l), flow_token, post_action: '' } };
    }

    if (sel === 'booth_president') {
      const existing = await BoothPresidentRequest.findOne({ userId: user._id });
      if (existing) return doneScreen('BOOTH_STATUS', l, boothStatusMd(existing, l), flow_token);
      return {
        screen: 'BOOTH_HOME',
        data: {
          title: UI.booth_title(l),
          current_md:
            `${L(l, 'District', 'மாவட்டம்')}: ${user.district}\n` +
            `${L(l, 'Assembly', 'தொகுதி')}: ${user.assemblyName}\n` +
            `${L(l, 'Booth', 'பூத்')}: ${user.boothNo}`,
          another_label: UI.booth_another(l),
          cta: UI.booth_confirm_current(l),
        },
      };
    }

    return svcInit(flow_token);
  }

  // ─── MY_SCHEMES → APP_STATUS ───
  if (screen === 'MY_SCHEMES') {
    const schemeId = Number(data?.applied);
    const app = await SchemeApplication.findOne({ userId: user._id, schemeId });
    if (!app) return doneScreen('INFO', l, `# ${UI.none_title(l)}`, flow_token);
    return doneScreen('APP_STATUS', l, appStatusMd(app, l), flow_token);
  }

  // ─── APPLY_LIST → APPLY_DETAIL ───
  if (screen === 'APPLY_LIST') {
    const schemeId = Number(data?.scheme);
    await saveContact(phone, { pendingScheme: schemeId });
    const scr = await schemeDetailScreen('APPLY_DETAIL', schemeId, l);
    return scr;
  }

  // ─── APPLY_DETAIL → APPLY_DONE ───
  if (screen === 'APPLY_DETAIL') {
    const contact = await getContactDoc(phone);
    const pickedId = Number(contact?.pendingScheme || 0);
    if (pickedId) await createApplication(user, pickedId);
    const s = (await getSchemesCatalog()).find((x) => Number(x.id) === pickedId);
    const body = `# ${L(l, 'Application Submitted 🎉', 'விண்ணப்பம் சமர்ப்பிக்கப்பட்டது 🎉')}\n\n${L(l, 'You applied for', 'நீங்கள் விண்ணப்பித்தது')}: **${s ? schemeTitle(s, l) : ''}**\n\n${L(l, 'Tap Done to choose another service.', 'மற்றொரு சேவையைத் தேர்வு செய்ய Done என தட்டவும்.')}`;
    return doneScreen('APPLY_DONE', l, body, flow_token, 'choose_service');
  }

  // ─── Booth President ───
  if (screen === 'BOOTH_HOME') {
    // Footer "Confirm this Booth" (uses the member's own jurisdiction).
    await createBoothRequest(user, {
      district: user.district, assemblyName: user.assemblyName, assemblyNo: user.assemblyNo, boothNo: user.boothNo, isCustom: false,
    });
    return doneScreen('BOOTH_DONE', l, boothDoneMd(l, user.district, user.assemblyName, user.boothNo), flow_token, 'choose_service');
  }

  if (screen === 'BOOTH_DISTRICT') {
    // Reached via the "Apply for a different booth" link OR after choosing a district.
    if (data?.action === 'booth_another' || !data?.district) {
      const meta = await getAssemblyMetadata();
      const districts = [...new Set(meta.map((m) => m.district).filter(Boolean))].sort()
        .slice(0, 120).map((d) => ({ id: d, title: d }));
      return { screen: 'BOOTH_DISTRICT', data: { title: UI.select_district(l), label: UI.district(l), districts, cta: UI.cont(l) } };
    }
    const district = String(data.district);
    await saveContact(phone, { pendingBooth: { district } });
    const meta = await getAssemblyMetadata();
    const assemblies = meta.filter((m) => m.district === district)
      .sort((a, b) => parseInt(a.assemblyNo) - parseInt(b.assemblyNo))
      .map((m) => ({ id: m.assemblyNo, title: `${m.assemblyNo} - ${m.assemblyName}` }));
    return { screen: 'BOOTH_ASSEMBLY', data: { title: UI.select_assembly(l), label: UI.assembly(l), assemblies, cta: UI.cont(l) } };
  }

  if (screen === 'BOOTH_ASSEMBLY') {
    const assemblyNo = String(data?.assembly || '');
    const meta = await getAssemblyMetadata();
    const match = meta.find((m) => m.assemblyNo === assemblyNo);
    const contact = await getContactDoc(phone);
    const pb = { ...(contact?.pendingBooth || {}), assemblyNo, assemblyName: match?.assemblyName || '' };
    await saveContact(phone, { pendingBooth: pb });
    let booths = [];
    try {
      const b = await getBoothCredentialsForAssembly(assemblyNo);
      booths = (b?.boothLogins || []).slice(0, 200).map((x) => ({ id: String(x.boothNo), title: `${L(l, 'Booth', 'பூத்')} ${x.boothNo}` }));
    } catch { /* ignore */ }
    if (!booths.length) booths = [{ id: '1', title: `${L(l, 'Booth', 'பூத்')} 1` }];
    return { screen: 'BOOTH_BOOTH', data: { title: UI.select_booth(l), label: UI.booth(l), booths, cta: UI.confirm(l) } };
  }

  if (screen === 'BOOTH_BOOTH') {
    const boothNo = String(data?.booth || '1');
    const contact = await getContactDoc(phone);
    const pb = contact?.pendingBooth || {};
    await createBoothRequest(user, {
      district: pb.district || user.district, assemblyName: pb.assemblyName || user.assemblyName,
      assemblyNo: pb.assemblyNo || '', boothNo, isCustom: true,
    });
    return doneScreen('BOOTH_DONE', l, boothDoneMd(l, pb.district || user.district, pb.assemblyName || user.assemblyName, boothNo), flow_token, 'choose_service');
  }

  return svcInit(flow_token);
}

/* ───────── Service data builders ───────── */
async function profileMd(user, l) {
  return (
    `# ${L(l, 'My Profile', 'எனது சுயவிவரம்')}\n\n` +
    `| **${L(l, 'Field', 'விவரம்')}** | **${L(l, 'Value', 'மதிப்பு')}** |\n| :--- | :--- |\n` +
    `| ${L(l, 'Name', 'பெயர்')} | **${user.voterName}** |\n` +
    `| ${L(l, 'EPIC Number', 'EPIC எண்')} | ${user.epicNo} |\n` +
    `| ${L(l, 'Mobile', 'மொபைல்')} | ${user.mobile} |\n` +
    `| ${L(l, 'Gender', 'பாலினம்')} | ${user.gender || '—'} |\n` +
    `| ${L(l, 'District', 'மாவட்டம்')} | ${user.district} |\n` +
    `| ${L(l, 'Assembly', 'தொகுதி')} | ${user.assemblyName} |\n` +
    `| ${L(l, 'Booth', 'பூத்')} | ${user.boothNo} |\n` +
    `| ${L(l, 'Referral Code', 'பரிந்துரை குறியீடு')} | ${user.referralCode} |`
  );
}

async function appliedItems(user, l) {
  const apps = await SchemeApplication.find({ userId: user._id }).sort({ appliedAt: -1 }).lean();
  const catalog = await getSchemesCatalog();
  return Promise.all(apps.slice(0, 30).map(async (a) => {
    const s = catalog.find((x) => Number(x.id) === Number(a.schemeId));
    const item = { id: String(a.schemeId), title: (s ? schemeTitle(s, l) : a.schemeName || 'Scheme').slice(0, 30), description: statusLabel(a.status, l) };
    if (s) { const img = await schemeIconB64(s); if (img) item.image = img; }
    return item;
  }));
}

function appStatusMd(app, l) {
  const d = app.appliedAt ? new Date(app.appliedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  return (
    `# ${L(l, 'Application Status', 'விண்ணப்ப நிலை')}\n\n` +
    `| **${L(l, 'Field', 'விவரம்')}** | **${L(l, 'Value', 'மதிப்பு')}** |\n| :--- | :--- |\n` +
    `| ${L(l, 'Scheme', 'திட்டம்')} | **${app.schemeName}** |\n` +
    `| ${L(l, 'Status', 'நிலை')} | ${statusLabel(app.status, l)} |\n` +
    `| ${L(l, 'Applied On', 'விண்ணப்பித்த தேதி')} | ${d} |\n` +
    `${app.adminRemarks ? `\n${L(l, 'Note', 'குறிப்பு')}: ${app.adminRemarks}` : ''}`
  );
}

function referralMd(user, l) {
  const link = `https://tnbjp.org/?ref=${user.referralCode}`;
  return (
    `# ${L(l, 'My Referral Link', 'எனது பரிந்துரை இணைப்பு')}\n\n` +
    `${L(l, 'Share this link to invite others:', 'மற்றவர்களை அழைக்க இந்த இணைப்பைப் பகிரவும்:')}\n\n` +
    `**${link}**\n\n` +
    `${L(l, 'Your code', 'உங்கள் குறியீடு')}: **${user.referralCode}**\n\n` +
    `_${L(l, 'We will also send this link as a message you can forward.', 'இந்த இணைப்பை நீங்கள் பகிரக்கூடிய செய்தியாகவும் அனுப்புவோம்.')}_`
  );
}

async function memberItems(user, l) {
  const codes = [user.referralCode, user.epicNo, user.mobile].filter(Boolean);
  const members = await User.find({ referredBy: { $in: codes } }).sort({ createdAt: -1 }).limit(30).lean();
  const imgs = await loadGlobalImages();
  const icon = imgs.wa_member_default_icon || '';
  return members.map((m) => {
    const item = { id: String(m._id), title: (m.voterName || 'Member').slice(0, 30), description: `${m.assemblyName || ''}${m.boothNo ? ' · ' + L(l, 'Booth', 'பூத்') + ' ' + m.boothNo : ''}`.slice(0, 60) };
    if (icon) item.image = icon;
    return item;
  });
}

function boothStatusMd(reqDoc, l) {
  const st = { Pending: L(l, 'Pending', 'நிலுவையில்'), Approved: L(l, 'Approved ✅', 'அங்கீகரிக்கப்பட்டது ✅'), Rejected: L(l, 'Rejected', 'நிராகரிக்கப்பட்டது') }[reqDoc.status] || reqDoc.status;
  return (
    `# ${L(l, 'Booth President Request', 'பூத் தலைவர் விண்ணப்பம்')}\n\n` +
    `| **${L(l, 'Field', 'விவரம்')}** | **${L(l, 'Value', 'மதிப்பு')}** |\n| :--- | :--- |\n` +
    `| ${L(l, 'District', 'மாவட்டம்')} | ${reqDoc.district} |\n` +
    `| ${L(l, 'Assembly', 'தொகுதி')} | ${reqDoc.assemblyName} |\n` +
    `| ${L(l, 'Booth', 'பூத்')} | ${reqDoc.boothNo} |\n` +
    `| ${L(l, 'Status', 'நிலை')} | ${st} |` +
    `${reqDoc.rejectionReason ? `\n\n${L(l, 'Reason', 'காரணம்')}: ${reqDoc.rejectionReason}` : ''}`
  );
}

function boothDoneMd(l, district, assembly, booth) {
  return (
    `# ${L(l, '🙏 Request Submitted', '🙏 விண்ணப்பம் சமர்ப்பிக்கப்பட்டது')}\n\n` +
    `${L(l, 'Your Booth President request is pending review.', 'உங்கள் பூத் தலைவர் விண்ணப்பம் பரிசீலனையில் உள்ளது.')}\n\n` +
    `${L(l, 'District', 'மாவட்டம்')}: ${district}\n${L(l, 'Assembly', 'தொகுதி')}: ${assembly}\n${L(l, 'Booth', 'பூத்')}: ${booth}`
  );
}

async function createBoothRequest(user, { district, assemblyName, assemblyNo, boothNo, isCustom }) {
  const existing = await BoothPresidentRequest.findOne({ userId: user._id });
  const payload = {
    voterName: user.voterName, epicNo: user.epicNo, mobile: user.mobile, gender: user.gender || 'Unspecified',
    district, assemblyName, assemblyNo: assemblyNo || '', boothNo: String(boothNo || '1'),
    isCustomBooth: !!isCustom, originalDistrict: user.district || '', originalAssembly: user.assemblyName || '', originalBoothNo: user.boothNo || '',
    status: 'Pending', rejectionReason: '', appliedAt: new Date(), actionDate: null, actionBy: '',
  };
  if (existing) {
    if (existing.status === 'Approved') return existing;
    Object.assign(existing, payload);
    await existing.save();
    return existing;
  }
  return BoothPresidentRequest.create({ userId: user._id, ...payload });
}

module.exports = router;
module.exports.clearImageCache = clearImageCache;
