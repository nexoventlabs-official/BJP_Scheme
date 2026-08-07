const Scheme = require('../models/Scheme');
const { isConfigured, uploadSchemeImage, deleteImage, publicIdFromUrl } = require('../services/cloudinaryService');
const { invalidateSchemeCache } = require('./schemeController');

// Fields an admin may set/edit on a scheme.
const EDITABLE_FIELDS = [
  'name', 'fullName', 'cluster', 'clusterShort', 'benefit', 'icon', 'highlight',
  'overview', 'eligibility', 'howToApply', 'link', 'tags', 'documents', 'steps', 'keys',
  'name_ta', 'fullName_ta', 'cluster_ta', 'clusterShort_ta', 'benefit_ta', 'highlight_ta',
  'overview_ta', 'eligibility_ta', 'howToApply_ta', 'tags_ta', 'documents_ta', 'steps_ta',
  'order', 'active',
];

const pickEditable = (body) => {
  const out = {};
  for (const f of EDITABLE_FIELDS) {
    if (body[f] !== undefined) out[f] = body[f];
  }
  return out;
};

const slugify = (str) => String(str || 'scheme')
  .replace(/[^a-zA-Z0-9_-]/g, '_')
  .replace(/_+/g, '_')
  .slice(0, 60) || 'scheme';

// @desc   List all schemes (admin — includes inactive)
// @route  GET /api/admin/schemes
// @access SUPER_ADMIN
const getAllSchemesAdmin = async (req, res) => {
  try {
    const schemes = await Scheme.find({}).sort({ order: 1, id: 1 }).lean();
    return res.status(200).json({ success: true, count: schemes.length, schemes });
  } catch (err) {
    console.error('[getAllSchemesAdmin Error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to load schemes' });
  }
};

// @desc   Create a new scheme
// @route  POST /api/admin/schemes
// @access SUPER_ADMIN
const createScheme = async (req, res) => {
  try {
    const { name, imageBase64 } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Scheme name is required' });
    }

    // Next stable numeric id
    const last = await Scheme.findOne({}).sort({ id: -1 }).select('id').lean();
    const nextId = last ? last.id + 1 : 1;

    const data = pickEditable(req.body);
    data.id = nextId;
    data.name = String(name).trim();
    if (data.order === undefined) data.order = nextId;

    // Optional image upload (base64 data URI from the admin form)
    if (imageBase64) {
      if (!isConfigured()) {
        return res.status(500).json({ success: false, message: 'Image upload unavailable — Cloudinary is not configured on the server.' });
      }
      const { secure_url, public_id } = await uploadSchemeImage(imageBase64, `custom_${nextId}_${slugify(data.name)}`);
      data.backgroundImage = secure_url;
      data.imagePublicId = public_id;
    }

    const scheme = await Scheme.create(data);
    invalidateSchemeCache();
    return res.status(201).json({ success: true, message: 'Scheme created successfully', scheme });
  } catch (err) {
    console.error('[createScheme Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to create scheme' });
  }
};

// @desc   Update a scheme
// @route  PUT /api/admin/schemes/:id
// @access SUPER_ADMIN
const updateScheme = async (req, res) => {
  try {
    const numericId = Number(req.params.id);
    const scheme = await Scheme.findOne({ id: numericId });
    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }

    const data = pickEditable(req.body);

    // Optional new image — replace and remove the previous one.
    if (req.body.imageBase64) {
      if (!isConfigured()) {
        return res.status(500).json({ success: false, message: 'Image upload unavailable — Cloudinary is not configured on the server.' });
      }
      const oldPublicId = scheme.imagePublicId || publicIdFromUrl(scheme.backgroundImage);
      const { secure_url, public_id } = await uploadSchemeImage(
        req.body.imageBase64,
        `custom_${numericId}_${slugify(data.name || scheme.name)}`
      );
      data.backgroundImage = secure_url;
      data.imagePublicId = public_id;
      if (oldPublicId && oldPublicId !== public_id) await deleteImage(oldPublicId);
    }

    Object.assign(scheme, data);
    await scheme.save();
    invalidateSchemeCache();
    return res.status(200).json({ success: true, message: 'Scheme updated successfully', scheme });
  } catch (err) {
    console.error('[updateScheme Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to update scheme' });
  }
};

// @desc   Delete a scheme (catalog only — existing applications are preserved)
// @route  DELETE /api/admin/schemes/:id
// @access SUPER_ADMIN
const deleteScheme = async (req, res) => {
  try {
    const numericId = Number(req.params.id);
    const scheme = await Scheme.findOne({ id: numericId });
    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }
    // Remove the Cloudinary image too — use the stored public_id, or derive it
    // from the image URL (seeded schemes only carry the URL, not the public_id).
    const publicId = scheme.imagePublicId || publicIdFromUrl(scheme.backgroundImage);
    if (publicId) await deleteImage(publicId);

    await Scheme.deleteOne({ id: numericId });
    invalidateSchemeCache();
    return res.status(200).json({ success: true, message: 'Scheme deleted successfully' });
  } catch (err) {
    console.error('[deleteScheme Error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete scheme' });
  }
};

module.exports = {
  getAllSchemesAdmin,
  createScheme,
  updateScheme,
  deleteScheme,
};
