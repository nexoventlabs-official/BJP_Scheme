const mongoose = require('mongoose');

/**
 * Lightweight per-phone WhatsApp session/state store. The registered member
 * lives in the User collection (keyed by 10-digit mobile); this holds the
 * transient conversation state: chosen language, WhatsApp profile name, the
 * last voter snapshot from an EPIC lookup (so the confirm screen can finalize
 * without re-fetching), and a pending booth-president selection.
 */
const whatsAppContactSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, index: true }, // full, e.g. 919876543210
    lang: { type: String, enum: ['en', 'ta'], default: 'ta' },
    profileName: { type: String, default: '' },
    voterSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    pendingScheme: { type: Number, default: null },
    pendingBooth: { type: mongoose.Schema.Types.Mixed, default: null },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WhatsAppContact', whatsAppContactSchema);
