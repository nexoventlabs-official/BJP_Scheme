const User = require('../models/User');
const SchemeApplication = require('../models/SchemeApplication');

// @desc    Get user's referral code, link, and list of referred members
// @route   GET /api/referrals/my-referrals
// @access  Private (User)
const getReferralStats = async (req, res) => {
  try {
    const user = req.user;
    const matchCodes = [user.referralCode, user.epicNo, user.mobile].filter(Boolean);
    const referredUsers = await User.find({ referredBy: { $in: matchCodes } }).sort({ createdAt: -1 });

    const referredMembers = await Promise.all(
      referredUsers.map(async (refUser) => {
        const apps = await SchemeApplication.find({ userId: refUser._id }).sort({ appliedAt: -1 });
        return {
          id: refUser._id,
          voterName: refUser.voterName,
          epicNo: refUser.epicNo,
          district: refUser.district,
          assemblyName: refUser.assemblyName,
          boothNo: refUser.boothNo,
          mobileMasked: refUser.mobile && refUser.mobile.length >= 10 ? refUser.mobile.slice(0, 3) + '*****' + refUser.mobile.slice(-2) : refUser.mobile,
          joinedAt: refUser.createdAt,
          schemeCount: apps.length,
          applications: apps
        };
      })
    );

    return res.status(200).json({
      success: true,
      referralCode: user.referralCode,
      totalReferred: referredMembers.length,
      referredMembers
    });
  } catch (error) {
    console.error('[getReferralStats Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to load referral data', error: error.message });
  }
};

module.exports = {
  getReferralStats
};
