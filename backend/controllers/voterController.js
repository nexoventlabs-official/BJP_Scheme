const jwt = require('jsonwebtoken');
const { getVoterDbClient } = require('../config/db');
const User = require('../models/User');
const OtpSession = require('../models/OtpSession');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'bjp_nalam_thittam_secret_2026', {
    expiresIn: '30d'
  });
};

// @desc    Search EPIC number in Read-Only Voter DB across all assembly collections
// @route   POST /api/voter/search-epic
// @access  Public
const searchEpic = async (req, res) => {
  try {
    const { epicNo } = req.body;
    if (!epicNo || epicNo.trim().length < 5) {
      return res.status(400).json({ success: false, message: 'Please enter a valid EPIC number' });
    }

    const cleanEpic = epicNo.trim().toUpperCase();

    // Check if EPIC already registered in App DB
    const registeredUser = await User.findOne({ epicNo: cleanEpic });
    if (registeredUser) {
      return res.status(400).json({
        success: false,
        message: `EPIC ${cleanEpic} is already registered under mobile ending in ...${registeredUser.mobile.slice(-4)}. Please login with that mobile number.`
      });
    }

    const voterDb = await getVoterDbClient();
    const collections = await voterDb.listCollections().toArray();

    let foundVoter = null;

    // Search across assembly collections (ass_*)
    for (let col of collections) {
      if (!col.name.startsWith('ass_')) continue;
      const voterDoc = await voterDb.collection(col.name).findOne({ EPIC_NO: cleanEpic });
      if (voterDoc) {
        foundVoter = {
          epicNo: voterDoc.EPIC_NO,
          voterName: voterDoc.VOTER_NAME,
          district: voterDoc.DISTRICT,
          assemblyNo: voterDoc.ASSEMBLY_NO || col.name.replace('ass_', ''),
          assemblyName: voterDoc.ASSEMBLY_NAME || 'Assembly ' + voterDoc.ASSEMBLY_NO,
          boothNo: voterDoc.PART_NO || '1',
          gender: voterDoc.GENDER || 'Unspecified'
        };
        break;
      }
    }

    if (!foundVoter) {
      return res.status(404).json({
        success: false,
        message: `EPIC number '${cleanEpic}' was not found in voter database. Please double check your EPIC card number.`
      });
    }

    return res.status(200).json({
      success: true,
      voter: foundVoter
    });
  } catch (error) {
    console.error('[searchEpic Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to query voter database', error: error.message });
  }
};

// @desc    Confirm Voter details & complete Registration
// @route   POST /api/voter/confirm-registration
// @access  Public
const confirmVoterRegistration = async (req, res) => {
  try {
    const { mobile, epicNo, voterName, district, assemblyNo, assemblyName, boothNo, gender, referredBy } = req.body;

    if (!mobile || !epicNo || !voterName || !district || !assemblyName || !boothNo) {
      return res.status(400).json({ success: false, message: 'Missing required voter registration details' });
    }

    const cleanMobile = mobile.trim();
    const cleanEpic = epicNo.trim().toUpperCase();

    // Verify OTP session was completed
    const verifiedSession = await OtpSession.findOne({ mobile: cleanMobile, verified: true });
    if (!verifiedSession) {
      return res.status(400).json({ success: false, message: 'Mobile number not verified with OTP. Please complete OTP verification first.' });
    }

    // Check duplicate
    let user = await User.findOne({ $or: [{ mobile: cleanMobile }, { epicNo: cleanEpic }] });
    if (user) {
      const token = generateToken(user._id);
      return res.status(200).json({
        success: true,
        message: 'User already registered. Logging in...',
        token,
        user
      });
    }

    // Generate unique referral code
    const uniqueSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    const referralCode = `BJP-${cleanEpic.substring(0, 4)}-${uniqueSuffix}`;

    // Create user
    user = await User.create({
      mobile: cleanMobile,
      epicNo: cleanEpic,
      voterName: voterName.trim(),
      district: district.trim(),
      assemblyNo: assemblyNo || '',
      assemblyName: assemblyName.trim(),
      boothNo: boothNo.trim(),
      gender: gender || 'Unspecified',
      referralCode,
      referredBy: referredBy ? referredBy.trim() : null
    });

    const token = generateToken(user._id);

    return res.status(201).json({
      success: true,
      message: 'Registration confirmed successfully!',
      token,
      user
    });
  } catch (error) {
    console.error('[confirmVoterRegistration Error]:', error);
    return res.status(500).json({ success: false, message: 'Registration failed', error: error.message });
  }
};

module.exports = {
  searchEpic,
  confirmVoterRegistration
};
