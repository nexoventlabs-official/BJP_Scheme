const SchemeApplication = require('../models/SchemeApplication');
const User = require('../models/User');

// Predefined 20 BJP Schemes Data
const BJP_SCHEMES_LIST = [
  { id: 1, name: 'PMSBY', cluster: 'Cluster 1 — Insurance Trinity', benefit: '₹2L accident insurance — ₹20/year' },
  { id: 2, name: 'PMJJBY', cluster: 'Cluster 1 — Insurance Trinity', benefit: '₹2L life insurance — ₹436/year' },
  { id: 3, name: 'APY', cluster: 'Cluster 1 — Insurance Trinity', benefit: 'Pension ₹1K–5K/month after 60' },
  { id: 4, name: 'PM SVANidhi', cluster: 'Cluster 2 — Credit', benefit: '₹10K–50K collateral-free loan (street vendors)' },
  { id: 5, name: 'PM Mudra Shishu', cluster: 'Cluster 2 — Credit', benefit: 'Up to ₹50K loan' },
  { id: 6, name: 'PM Mudra Kishor', cluster: 'Cluster 2 — Credit', benefit: '₹50K–5L loan' },
  { id: 7, name: 'Udyam', cluster: 'Cluster 2 — Credit', benefit: 'MSME registration — unlocks all government business benefits' },
  { id: 8, name: 'Stand Up India', cluster: 'Cluster 2 — Credit', benefit: 'SC/ST or women entrepreneurs — ₹10L–1Cr loan' },
  { id: 9, name: 'Startup Seed Fund', cluster: 'Cluster 2 — Credit', benefit: 'Registered startups' },
  { id: 10, name: 'PM Kisan', cluster: 'Cluster 3 — Farmers', benefit: '₹6,000/year — 3 installments' },
  { id: 11, name: 'PM Fasal Bima', cluster: 'Cluster 3 — Farmers', benefit: 'Crop insurance' },
  { id: 12, name: 'PM Kisan Maan Dhan', cluster: 'Cluster 3 — Farmers', benefit: 'Farmer pension — age 18–40 entry' },
  { id: 13, name: 'PM Ujjwala', cluster: 'Cluster 4 — Women & Families', benefit: 'Free LPG connection (BPL, no existing connection)' },
  { id: 14, name: 'PM Matru Vandana', cluster: 'Cluster 4 — Women & Families', benefit: '₹5,000 for first pregnancy' },
  { id: 15, name: 'Sukanya Samridhi', cluster: 'Cluster 4 — Women & Families', benefit: 'Girl child savings (under 10 years)' },
  { id: 16, name: 'PMKVY', cluster: 'Cluster 5 — Youth & Skills', benefit: 'Free skill training — age 15–45' },
  { id: 17, name: 'NSP Scholarship', cluster: 'Cluster 5 — Youth & Skills', benefit: 'Student scholarships — age 15–25' },
  { id: 18, name: 'PM Vishwakarma', cluster: 'Cluster 5 — Youth & Skills', benefit: 'Traditional artisans / daily wage trades' },
  { id: 19, name: 'Jan Dhan', cluster: 'Foundation Layer', benefit: 'Zero-balance bank account — gateway for all DBT' },
  { id: 20, name: 'e-Shram', cluster: 'Foundation Layer', benefit: 'Unorganised worker registration — unlocks insurance' }
];

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
    return res.status(500).json({ success: false, message: 'Failed to submit scheme applications', error: error.message });
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
    return res.status(500).json({ success: false, message: error.message });
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
