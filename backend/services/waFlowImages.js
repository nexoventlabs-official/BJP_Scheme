const FlowImage = require('../models/FlowImage');
const { SERVICES } = require('./waHelpers');

// Global (fixed-key) image slots managed on the admin "Flow Images" page.
// Per-scheme WhatsApp images live on the Scheme model (waLogo / waBanner).
const GLOBAL_IMAGE_KEYS = [
  { key: 'wa_language_header',       label: 'Language chooser — header image',   group: 'headers' },
  { key: 'wa_register_header',       label: 'Register message — header image',   group: 'headers' },
  { key: 'wa_register_banner',       label: 'Register flow — banner',            group: 'banners' },
  { key: 'wa_choose_service_header', label: 'Choose Service message — header',   group: 'headers' },
  { key: 'wa_choose_service_banner', label: 'Choose Service flow — banner',      group: 'banners' },
  { key: 'wa_confirm_header',        label: 'Confirmation message — header',     group: 'headers' },
  { key: 'wa_member_default_icon',   label: 'My Members — default profile icon', group: 'icons' },
  ...SERVICES.map((s) => ({ key: s.iconKey, label: `Service icon: ${s.en[0]}`, group: 'service_icons' })),
];

async function ensureKeysExist() {
  if (!GLOBAL_IMAGE_KEYS.length) return;
  const ops = GLOBAL_IMAGE_KEYS.map((item) => ({
    updateOne: {
      filter: { key: item.key },
      update: { $setOnInsert: { key: item.key, label: item.label, group: item.group, url: '', publicId: '' } },
      upsert: true,
    },
  }));
  await FlowImage.bulkWrite(ops, { ordered: false });
}

async function getUrl(key) {
  const doc = await FlowImage.findOne({ key }).lean();
  return doc?.url || '';
}

async function getMap(keys) {
  const docs = await FlowImage.find({ key: { $in: keys } }).lean();
  const out = {};
  keys.forEach((k) => (out[k] = ''));
  docs.forEach((d) => { out[d.key] = d.url || ''; });
  return out;
}

module.exports = { GLOBAL_IMAGE_KEYS, ensureKeysExist, getUrl, getMap };
