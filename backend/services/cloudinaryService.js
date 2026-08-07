const cloudinary = require('cloudinary').v2;

// Configure from environment. Credentials must be set in .env
// (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET).
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const isConfigured = () =>
  !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

/**
 * Upload a base64 data URI (or remote URL) to Cloudinary under bjp_schemes.
 * Returns { secure_url, public_id }.
 */
// Target dimensions for all scheme banners.
const SCHEME_IMG_W = 1100;
const SCHEME_IMG_H = 385;

const uploadSchemeImage = async (dataUri, publicId) => {
  const opts = {
    folder: 'bjp_schemes',
    overwrite: true,
    resource_type: 'image',
    // Incoming transformation: the stored asset is auto-resized to the exact
    // scheme dimensions (crop to fill, smart gravity) regardless of the
    // uploaded image's original size/ratio.
    transformation: [{ width: SCHEME_IMG_W, height: SCHEME_IMG_H, crop: 'fill', gravity: 'auto' }],
  };
  if (publicId) opts.public_id = publicId;
  const res = await cloudinary.uploader.upload(dataUri, opts);
  return { secure_url: res.secure_url, public_id: res.public_id };
};

/**
 * Generic image upload from a base64 data URI (used by the Flow Images admin
 * page). No forced resize — flow icons/banners keep their aspect ratio.
 */
const uploadDataUri = async (dataUri, { folder = 'bjp_flow', publicId } = {}) => {
  const opts = { folder, overwrite: true, resource_type: 'image' };
  if (publicId) opts.public_id = publicId;
  const res = await cloudinary.uploader.upload(dataUri, opts);
  return { secure_url: res.secure_url, public_id: res.public_id };
};

const deleteImage = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('[Cloudinary delete error]:', err && err.message ? err.message : err);
  }
};

/**
 * Derive a Cloudinary public_id from a delivery URL, e.g.
 *   https://res.cloudinary.com/dkjrdntf/image/upload/v1785409434/bjp_schemes/PMSBY.png
 *   -> "bjp_schemes/PMSBY"
 * Strips the version segment (v123...), any transformation chain (segments with
 * commas), and the file extension. Returns null for non-Cloudinary URLs.
 */
const publicIdFromUrl = (url) => {
  if (!url || !String(url).includes('/upload/')) return null;
  const after = String(url).split('/upload/')[1];
  if (!after) return null;
  const segs = after
    .split('/')
    .filter((seg) => seg && !/^v\d+$/.test(seg) && !seg.includes(','));
  const joined = segs.join('/');
  const publicId = joined.replace(/\.[^/.]+$/, '');
  return publicId || null;
};

module.exports = { cloudinary, isConfigured, uploadSchemeImage, uploadDataUri, deleteImage, publicIdFromUrl };
