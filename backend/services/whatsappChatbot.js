const meta = require('./metaCloud');
const flowImages = require('./waFlowImages');
const { last10, t } = require('./waHelpers');
const WhatsAppContact = require('../models/WhatsAppContact');
const User = require('../models/User');
const SchemeApplication = require('../models/SchemeApplication');

const STATUS_LABELS = {
  en: { Pending: 'Pending', Submitted: 'Submitted', Processing: 'Processing', Approved: 'Approved ✅', Completed: 'Completed ✅', Rejected: 'Rejected' },
  ta: { Pending: 'நிலுவையில்', Submitted: 'சமர்ப்பிக்கப்பட்டது', Processing: 'செயலாக்கத்தில்', Approved: 'அங்கீகரிக்கப்பட்டது ✅', Completed: 'முடிந்தது ✅', Rejected: 'நிராகரிக்கப்பட்டது' },
};
const statusLabel = (lang, s) => (STATUS_LABELS[lang] && STATUS_LABELS[lang][s]) || s;

// Get the user's most recently applied scheme application (the one just applied).
async function getLatestApplication(phone) {
  try {
    const user = await User.findOne({ mobile: last10(phone) }).select('_id').lean();
    if (!user) return null;
    return await SchemeApplication.findOne({ userId: user._id }).sort({ appliedAt: -1 }).lean();
  } catch {
    return null;
  }
}

// Choose-Service message body that mentions ONLY the scheme just applied + its status.
function buildAppliedBody(lang, app) {
  const status = statusLabel(lang, app.status);
  if (lang === 'ta') {
    return `🎉 நீங்கள் *${app.schemeName}* திட்டத்திற்கு விண்ணப்பித்துள்ளீர்கள்.\nநிலை: *${status}*\n\nஉங்கள் சுயவிவரம், திட்டங்கள், பரிந்துரைகள், உறுப்பினர்கள் அல்லது பூத் தலைவர் விண்ணப்பத்தைக் காண *சேவையைத் தேர்வு* செய்யவும்.`.slice(0, 1024);
  }
  return `🎉 You applied for *${app.schemeName}*.\nStatus: *${status}*\n\nTap *Choose Service* to view your profile, schemes, referrals, members or apply to be a Booth President.`.slice(0, 1024);
}

const GREETING_RE = /^(hi+|h?ello+|hey+|namaste|namaskar|namaskaram|vanakkam|start|menu|hai|register|bjp)\b/i;
const isGreeting = (text) => !!text && GREETING_RE.test(String(text).trim());

async function getContact(phone) {
  return WhatsAppContact.findOne({ phone }).lean();
}

async function trackContact(phone, profileName) {
  if (!phone) return null;
  try {
    return await WhatsAppContact.findOneAndUpdate(
      { phone },
      {
        $set: { lastSeenAt: new Date(), ...(profileName ? { profileName } : {}) },
        $setOnInsert: { phone },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    console.warn('[waChatbot] trackContact failed:', err.message);
    return null;
  }
}

async function isRegistered(phone) {
  try {
    const u = await User.findOne({ mobile: last10(phone) }).select('_id').lean();
    return !!u;
  } catch {
    return false;
  }
}

const flowMode = (statusEnv) =>
  String(process.env[statusEnv] || '').toUpperCase() === 'PUBLISHED' ? 'published' : 'draft';

/* ─── Message senders ─── */

async function sendLanguageButtons(phone, lang = 'ta') {
  const header = await flowImages.getUrl('wa_language_header');
  await meta.sendButtons(phone, {
    headerImageUrl: header || undefined,
    headerText: !header ? 'BJP Nalam Thittam' : undefined,
    body: t(lang, 'lang_body'),
    footer: t(lang, 'lang_footer'),
    buttons: [
      { id: 'lang_en', title: t(lang, 'btn_english') },
      { id: 'lang_ta', title: t(lang, 'btn_tamil') },
    ],
  });
}

async function sendRegisterFlow(phone, lang = 'ta') {
  const flowId = process.env.WHATSAPP_REG_FLOW_ID;
  if (!flowId) {
    await meta.sendText(phone, 'Registration is being set up. Please try again shortly. 🙏');
    return;
  }
  const header = await flowImages.getUrl('wa_register_header');
  await meta.sendFlowMessage(phone, {
    flowId,
    flowCta: t(lang, 'register_cta'),
    headerImageUrl: header || undefined,
    headerText: !header ? 'BJP Nalam Thittam' : undefined,
    bodyText: t(lang, 'register_body'),
    footerText: t(lang, 'footer'),
    flowToken: `reg_${String(phone).replace(/\D/g, '')}`,
    mode: flowMode('WHATSAPP_REG_FLOW_STATUS'),
  });
}

// Send the Choose-Service flow message. Pass { applied } to prepend a
// "you applied for <scheme>" line (used right after registering/applying a
// scheme). With no opts it sends the plain welcome (e.g. on a returning "Hi").
async function sendServiceFlow(phone, lang = 'ta', opts = {}) {
  const flowId = process.env.WHATSAPP_SERVICE_FLOW_ID;
  if (!flowId) {
    await meta.sendText(phone, 'Services are being set up. Please try again shortly. 🙏');
    return;
  }
  const header = await flowImages.getUrl('wa_choose_service_header');
  const bodyText = opts.applied ? buildAppliedBody(lang, opts.applied) : t(lang, 'choose_body');
  await meta.sendFlowMessage(phone, {
    flowId,
    flowCta: t(lang, 'choose_cta'),
    headerImageUrl: header || undefined,
    headerText: !header ? 'BJP Nalam Thittam' : undefined,
    bodyText,
    footerText: t(lang, 'footer'),
    flowToken: `svc_${String(phone).replace(/\D/g, '')}`,
    mode: flowMode('WHATSAPP_SERVICE_FLOW_STATUS'),
  });
}

/* ─── Inbound handlers ─── */

// Any greeting (or first contact) → language chooser.
async function handleInbound({ phone, profileName, text }) {
  const contact = await trackContact(phone, profileName);
  const lang = contact?.lang || 'ta';

  if (isGreeting(text) || !text) {
    try {
      await sendLanguageButtons(phone, lang);
    } catch (err) {
      console.error('[waChatbot] sendLanguageButtons failed:', err.response?.data || err.message);
      await meta.sendText(phone, 'Namaste 🙏 Type *hi* to begin.').catch(() => {});
    }
    return;
  }

  await meta.sendText(phone, t(lang, 'fallback')).catch(() => {});
}

// Language reply button → store language, then Register (new) or Choose Service (registered).
async function handleButtonReply({ phone, profileName, buttonId }) {
  await trackContact(phone, profileName);
  if (buttonId !== 'lang_en' && buttonId !== 'lang_ta') return false;

  const lang = buttonId === 'lang_en' ? 'en' : 'ta';
  await WhatsAppContact.updateOne({ phone }, { $set: { lang } }, { upsert: true });

  try {
    if (await isRegistered(phone)) await sendServiceFlow(phone, lang);
    else await sendRegisterFlow(phone, lang);
  } catch (err) {
    console.error('[waChatbot] post-language flow failed:', err.response?.data || err.message);
  }
  return true;
}

// A flow's terminal `complete` fired. Register done → Choose Service;
// Apply/Booth confirm (post_action=choose_service) → Choose Service again;
// Referral (post_action=send_referral) → send the link as a copyable text.
async function handleFlowComplete({ phone, flowToken, postAction }) {
  if (typeof flowToken !== 'string') return;
  const contact = await getContact(phone);
  const lang = contact?.lang || 'ta';

  if (flowToken.startsWith('reg_')) {
    if (await isRegistered(phone)) {
      // Registration applied one scheme — mention it by name + status.
      const app = await getLatestApplication(phone);
      await sendServiceFlow(phone, lang, app ? { applied: app } : {}).catch((err) =>
        console.error('[waChatbot] post-register service flow failed:', err.response?.data || err.message)
      );
    }
    return;
  }

  if (flowToken.startsWith('svc_')) {
    // Apply Schemes → its own "you applied for X" message (which already carries
    // the Choose Service button). Don't also send the plain welcome.
    if (postAction === 'applied_scheme') {
      const app = await getLatestApplication(phone);
      await sendServiceFlow(phone, lang, app ? { applied: app } : {}).catch((err) =>
        console.error('[waChatbot] post-apply service flow failed:', err.response?.data || err.message)
      );
      return;
    }

    // Referral → send the copyable link first.
    if (postAction === 'send_referral') {
      try {
        const u = await User.findOne({ mobile: last10(phone) }).select('referralCode').lean();
        if (u?.referralCode) {
          const link = `https://tnbjp.org/?ref=${u.referralCode}`;
          const body =
            lang === 'ta'
              ? `🪷 *BJP நலத் திட்டம்* — உங்கள் பரிந்துரை இணைப்பு:\n\n${link}\n\nஉங்கள் குறியீடு: *${u.referralCode}*`
              : `🪷 *BJP Nalam Thittam* — your referral link:\n\n${link}\n\nYour code: *${u.referralCode}*`;
          await meta.sendText(phone, body);
        }
      } catch (err) {
        console.error('[waChatbot] send_referral failed:', err.message);
      }
    }

    // Any other flow close (profile / scheme status / members / booth / referral)
    // → re-send the Choose Service welcome so they can pick another service.
    await sendServiceFlow(phone, lang).catch((err) =>
      console.error('[waChatbot] re-send service flow failed:', err.response?.data || err.message)
    );
  }
}

module.exports = {
  isGreeting,
  handleInbound,
  handleButtonReply,
  handleFlowComplete,
  sendLanguageButtons,
  sendRegisterFlow,
  sendServiceFlow,
  trackContact,
};
