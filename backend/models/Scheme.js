const mongoose = require('mongoose');

/**
 * Scheme — dynamic catalog of BJP Nalam Thittam welfare schemes.
 *
 * Replaces the previously hardcoded 23-scheme list. Each document carries the
 * union of fields consumed across the app (chatbot selection grid, "My Schemes"
 * panel, scheme info modal, and every admin dashboard), in both English and
 * Tamil, plus a Cloudinary background image.
 *
 * `id` is a stable numeric identifier (kept in sync with the original 1..23 so
 * existing SchemeApplication records — which reference schemes by numeric id
 * and/or name — continue to resolve correctly).
 */
const schemeSchema = new mongoose.Schema(
  {
    // Stable numeric id (referenced by SchemeApplication.schemeId)
    id: { type: Number, required: true, unique: true, index: true },

    // ── English ──
    name: { type: String, required: true, trim: true },        // short, e.g. "PMSBY"
    fullName: { type: String, default: '' },                    // e.g. "PMSBY — Suraksha Bima Yojana"
    cluster: { type: String, default: '' },                     // full, e.g. "Cluster 1 — Insurance"
    clusterShort: { type: String, default: '' },                // e.g. "Insurance"
    benefit: { type: String, default: '' },                     // short benefit line
    icon: { type: String, default: '📄' },                      // emoji shown on cards
    highlight: { type: String, default: '' },
    overview: { type: String, default: '' },
    eligibility: { type: String, default: '' },
    howToApply: { type: String, default: '' },
    link: { type: String, default: '' },
    tags: { type: [String], default: [] },
    documents: { type: [String], default: [] },
    steps: { type: [String], default: [] },
    keys: { type: [String], default: [] },                      // search aliases (backend name resolution)

    // ── Tamil (optional; used for schemes added via admin panel) ──
    name_ta: { type: String, default: '' },
    fullName_ta: { type: String, default: '' },
    cluster_ta: { type: String, default: '' },
    clusterShort_ta: { type: String, default: '' },
    benefit_ta: { type: String, default: '' },
    highlight_ta: { type: String, default: '' },
    overview_ta: { type: String, default: '' },
    eligibility_ta: { type: String, default: '' },
    howToApply_ta: { type: String, default: '' },
    tags_ta: { type: [String], default: [] },
    documents_ta: { type: [String], default: [] },
    steps_ta: { type: [String], default: [] },

    // ── Media (Cloudinary) ──
    backgroundImage: { type: String, default: '' },             // secure_url (web card)
    imagePublicId: { type: String, default: '' },               // for deletion/overwrite
    // WhatsApp flow media (managed via the admin Flow Images page) — kept
    // separate from the web background image.
    waLogo: { type: String, default: '' },
    waLogoPublicId: { type: String, default: '' },
    waBanner: { type: String, default: '' },
    waBannerPublicId: { type: String, default: '' },

    // ── Meta ──
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

schemeSchema.index({ order: 1, id: 1 });

module.exports = mongoose.model('Scheme', schemeSchema);
