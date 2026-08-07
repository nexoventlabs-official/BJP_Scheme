const SchemeApplication = require('../models/SchemeApplication');
const User = require('../models/User');
const Scheme = require('../models/Scheme');

// Static fallback — used only if the Scheme collection is empty or unreachable.
const { BJP_SCHEMES } = require('../constants/schemes');
const BJP_SCHEMES_LIST = BJP_SCHEMES; // legacy alias

// ── Cached scheme catalog (DB-backed, short TTL) ──────────────
let _cache = { at: 0, data: null };
const CACHE_MS = 30000;

// Returns the scheme catalog from the DB (fallback to static constants).
async function getSchemesCatalog() {
  const now = Date.now();
  if (_cache.data && now - _cache.at < CACHE_MS) return _cache.data;
  try {
    const docs = await Scheme.find({}).sort({ order: 1, id: 1 }).lean();
    // Fully DB-driven: return exactly what's in the DB (even an empty list).
    _cache = { at: now, data: docs || [] };
    return _cache.data;
  } catch (e) {
    console.error('[getSchemesCatalog] DB error:', e.message);
    return _cache.data || [];
  }
}

function invalidateSchemeCache() {
  _cache = { at: 0, data: null };
}

// @desc    Apply for single or multiple BJP schemes
// @route   POST /api/schemes/apply
// @access  Private (User)
const applySchemes = async (req, res) => {
  try {
    const { schemeIds } = req.body;
    if (!schemeIds || !Array.isArray(schemeIds) || schemeIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Please select at least one scheme to apply' });
    }

    const user = req.user;
    const appliedResults = [];
    const skippedAlreadyApplied = [];
    const catalog = await getSchemesCatalog();

    for (let id of schemeIds) {
      const schemeInfo = catalog.find(s => Number(s.id) === Number(id));
      if (!schemeInfo) continue;

      // Check if already applied
      const existingApp = await SchemeApplication.findOne({
        userId: user._id,
        schemeId: schemeInfo.id
      });

      if (existingApp) {
        skippedAlreadyApplied.push(schemeInfo.name);
        continue;
      }

      const newApp = await SchemeApplication.create({
        userId: user._id,
        epicNo: user.epicNo,
        voterName: user.voterName,
        mobile: user.mobile,
        district: user.district,
        assemblyName: user.assemblyName,
        assemblyNo: user.assemblyNo,
        boothNo: user.boothNo,
        schemeId: schemeInfo.id,
        schemeName: schemeInfo.name,
        clusterName: schemeInfo.cluster,
        benefit: schemeInfo.benefit,
        status: 'Pending',
        adminRemarks: 'Application submitted and pending verification.',
        statusHistory: [
          {
            status: 'Pending',
            remarks: 'Application submitted via voter portal',
            updatedBy: 'User (' + user.voterName + ')'
          }
        ]
      });

      appliedResults.push(newApp);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully submitted ${appliedResults.length} scheme application(s).`,
      appliedCount: appliedResults.length,
      applied: appliedResults,
      skippedAlreadyApplied
    });
  } catch (error) {
    console.error('[applySchemes Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit scheme applications' });
  }
};

// @desc    Get logged-in user scheme applications
// @route   GET /api/schemes/my-requests
// @access  Private (User)
const getUserRequests = async (req, res) => {
  try {
    const applications = await SchemeApplication.find({ userId: req.user._id }).sort({ appliedAt: -1 });
    return res.status(200).json({
      success: true,
      count: applications.length,
      applications
    });
  } catch (error) {
    console.error('[getUserRequests Error]:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @desc    Get scheme catalog list (dynamic — from DB)
// @route   GET /api/schemes/list
// @access  Public
const getSchemeList = async (req, res) => {
  try {
    const schemes = await getSchemesCatalog();
    const list = (schemes || []).filter(s => s.active !== false);
    return res.status(200).json({ success: true, schemes: list });
  } catch (error) {
    console.error('[getSchemeList Error]:', error);
    return res.status(200).json({ success: true, schemes: [] });
  }
};

module.exports = {
  applySchemes,
  getUserRequests,
  getSchemeList,
  getSchemesCatalog,
  invalidateSchemeCache,
  BJP_SCHEMES_LIST
};
