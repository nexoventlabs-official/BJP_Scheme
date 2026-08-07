const express = require('express');
const { protectAdmin, authorizeRoles } = require('../middleware/authMiddleware');
const FlowImage = require('../models/FlowImage');
const Scheme = require('../models/Scheme');
const { GLOBAL_IMAGE_KEYS } = require('../services/waFlowImages');
const { uploadDataUri, deleteImage, publicIdFromUrl, isConfigured } = require('../services/cloudinaryService');

const router = express.Router();

function bustFlowCache() {
  try {
    const fe = require('./whatsappFlow');
    if (typeof fe.clearImageCache === 'function') fe.clearImageCache();
  } catch { /* ignore */ }
}

// All flow-image management is SUPER_ADMIN only.
router.use(protectAdmin, authorizeRoles('SUPER_ADMIN'));

/** List global image slots + per-scheme WhatsApp image status. */
router.get('/', async (_req, res) => {
  try {
    const docs = await FlowImage.find({}, { key: 1, url: 1, group: 1, updatedAt: 1 }).lean();
    const map = new Map(docs.map((d) => [d.key, d]));
    const globals = GLOBAL_IMAGE_KEYS.map((spec) => ({
      key: spec.key,
      label: spec.label,
      group: spec.group,
      url: map.get(spec.key)?.url || '',
      updatedAt: map.get(spec.key)?.updatedAt || null,
    }));
    const schemes = await Scheme.find({}, { id: 1, name: 1, waLogo: 1, waBanner: 1 }).sort({ order: 1, id: 1 }).lean();
    res.json({
      success: true,
      globals,
      schemes: schemes.map((s) => ({ id: s.id, name: s.name, waLogo: s.waLogo || '', waBanner: s.waBanner || '' })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** Upload a global slot image (base64 data URI in body.imageBase64). */
router.post('/global/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const spec = GLOBAL_IMAGE_KEYS.find((k) => k.key === key);
    if (!spec) return res.status(400).json({ success: false, message: 'Unknown image key' });
    if (!req.body.imageBase64) return res.status(400).json({ success: false, message: 'imageBase64 required' });
    if (!isConfigured()) return res.status(500).json({ success: false, message: 'Cloudinary not configured' });

    const existing = await FlowImage.findOne({ key });
    if (existing?.publicId) await deleteImage(existing.publicId).catch(() => {});

    const { secure_url, public_id } = await uploadDataUri(req.body.imageBase64, { folder: `bjp_flow/${key}` });
    const doc = await FlowImage.findOneAndUpdate(
      { key },
      { $set: { url: secure_url, publicId: public_id, resourceType: 'image', label: spec.label, group: spec.group } },
      { upsert: true, new: true }
    );
    bustFlowCache();
    res.json({ success: true, image: { key, url: doc.url } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/global/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const doc = await FlowImage.findOne({ key });
    if (doc?.publicId) await deleteImage(doc.publicId).catch(() => {});
    await FlowImage.updateOne({ key }, { $set: { url: '', publicId: '' } });
    bustFlowCache();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** Upload a per-scheme WhatsApp image. type = 'logo' | 'banner'. */
router.post('/scheme/:id/:type', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const type = req.params.type === 'banner' ? 'banner' : 'logo';
    const scheme = await Scheme.findOne({ id });
    if (!scheme) return res.status(404).json({ success: false, message: 'Scheme not found' });
    if (!req.body.imageBase64) return res.status(400).json({ success: false, message: 'imageBase64 required' });
    if (!isConfigured()) return res.status(500).json({ success: false, message: 'Cloudinary not configured' });

    const urlField = type === 'banner' ? 'waBanner' : 'waLogo';
    const pidField = type === 'banner' ? 'waBannerPublicId' : 'waLogoPublicId';
    const oldPid = scheme[pidField] || publicIdFromUrl(scheme[urlField]);
    const { secure_url, public_id } = await uploadDataUri(req.body.imageBase64, { folder: `bjp_flow/scheme_${id}_${type}` });
    if (oldPid && oldPid !== public_id) await deleteImage(oldPid).catch(() => {});
    scheme[urlField] = secure_url;
    scheme[pidField] = public_id;
    await scheme.save();
    bustFlowCache();
    res.json({ success: true, id, type, url: secure_url });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/scheme/:id/:type', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const type = req.params.type === 'banner' ? 'banner' : 'logo';
    const scheme = await Scheme.findOne({ id });
    if (!scheme) return res.status(404).json({ success: false, message: 'Scheme not found' });
    const urlField = type === 'banner' ? 'waBanner' : 'waLogo';
    const pidField = type === 'banner' ? 'waBannerPublicId' : 'waLogoPublicId';
    const oldPid = scheme[pidField] || publicIdFromUrl(scheme[urlField]);
    if (oldPid) await deleteImage(oldPid).catch(() => {});
    scheme[urlField] = '';
    scheme[pidField] = '';
    await scheme.save();
    bustFlowCache();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
