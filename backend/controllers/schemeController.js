const SchemeApplication = require('../models/SchemeApplication');
const User = require('../models/User');

// All 23 BJP Nalam Thittam Schemes — single source of truth
const { BJP_SCHEMES } = require('../constants/schemes');
const BJP_SCHEMES_LIST = BJP_SCHEMES; // alias so rest of file is unchanged



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

    for (let id of schemeIds) {
      const schemeInfo = BJP_SCHEMES_LIST.find(s => s.id === Number(id));
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

// @desc    Get scheme catalog list
// @route   GET /api/schemes/list
// @access  Public
const getSchemeList = async (req, res) => {
  return res.status(200).json({
    success: true,
    schemes: BJP_SCHEMES_LIST
  });
};

module.exports = {
  applySchemes,
  getUserRequests,
  getSchemeList,
  BJP_SCHEMES_LIST
};
