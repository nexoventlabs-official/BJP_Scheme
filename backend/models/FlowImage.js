const mongoose = require('mongoose');

/**
 * Admin-managed image slots for the WhatsApp flow (headers, banners, service
 * icons, member default icon). Uploaded via the Super Admin "Flow Images" page
 * to Cloudinary; the flow endpoint fetches them and inlines base64.
 */
const flowImageSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    label: { type: String, default: '' },
    group: { type: String, default: 'general' },
    url: { type: String, default: '' },
    publicId: { type: String, default: '' },
    resourceType: { type: String, default: 'image' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FlowImage', flowImageSchema);
