const User = require('../models/User');
const OtpSession = require('../models/OtpSession');
const SchemeApplication = require('../models/SchemeApplication');
const { getVoterDbClient } = require('../config/db');
const { sendSmsOtp } = require('../services/smsService');
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'bjp_nalam_thittam_secret_2026', {
    expiresIn: '30d'
  });
};

// @desc    Send OTP to mobile
// @route   POST /api/send-otp
const sendOtp = async (req, res) => {
  try {
    const { mobile } = req.body;
    if (!mobile || !/^[6-9]\d{9}$/.test(mobile.trim())) {
      return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number' });
    }

    const cleanMobile = mobile.trim();
    const existingUser = await User.findOne({ mobile: cleanMobile });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await OtpSession.deleteMany({ mobile: cleanMobile });

    const smsResult = await sendSmsOtp(cleanMobile, otp);

    await OtpSession.create({
      mobile: cleanMobile,
      otp,
      sessionId: smsResult.sessionId || null,
      expiresAt
    });

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      mobile: cleanMobile,
      isExistingUser: !!existingUser,
      devOtp: smsResult.devOtp || otp
    });
  } catch (error) {
    console.error('[sendOtp Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to send OTP', error: error.message });
  }
};

// @desc    Verify OTP
// @route   POST /api/verify-otp
const verifyOtp = async (req, res) => {
  try {
    const { mobile, otp } = req.body;
    if (!mobile || !otp) {
      return res.status(400).json({ success: false, message: 'Mobile number and OTP are required' });
    }

    const cleanMobile = mobile.trim();
    const cleanOtp = otp.trim();

    // Allow dev bypass 123456 or match session
    const session = await OtpSession.findOne({ mobile: cleanMobile, verified: false });

    if (!session && cleanOtp !== '123456') {
      return res.status(400).json({ success: false, message: 'OTP session expired. Please request a new OTP.' });
    }

    if (session && session.otp !== cleanOtp && cleanOtp !== '123456') {
      return res.status(400).json({ success: false, message: 'Invalid OTP entered. Please try again.' });
    }

    if (session) {
      session.verified = true;
      await session.save();
    }

    const existingUser = await User.findOne({ mobile: cleanMobile });

    if (existingUser) {
      const token = generateToken(existingUser._id);
      const host = req.get('host');
      const referralLink = `${req.protocol}://${host}/r/${existingUser.referralCode}`;
      return res.status(200).json({
        success: true,
        message: 'OTP verified successfully. Welcome back!',
        isExistingUser: true,
        has_card: true,
        epic_no: existingUser.epicNo,
        voter_name: existingUser.voterName,
        bjp_code: existingUser.referralCode,
        referral_link: referralLink,
        token,
        user: existingUser
      });
    } else {
      return res.status(200).json({
        success: true,
        message: 'OTP verified successfully. Please provide your EPIC number.',
        isExistingUser: false,
        requireEpic: true
      });
    }
  } catch (error) {
    console.error('[verifyOtp Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to verify OTP', error: error.message });
  }
};

// @desc    Check Mobile Status
// @route   POST /api/check-mobile
const checkMobile = async (req, res) => {
  try {
    const { mobile } = req.body;
    if (!mobile) return res.status(400).json({ success: false, message: 'Mobile required' });

    const cleanMobile = mobile.trim();
    const user = await User.findOne({ mobile: cleanMobile });

    return res.status(200).json({
      success: true,
      registered: !!user,
      user: user || null
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Validate EPIC Number from Voter DB
// @route   POST /api/validate-epic
const validateEpic = async (req, res) => {
  try {
    const epicNo = req.body.epic_no || req.body.epicNo;
    const mobile = req.body.mobile;

    if (!epicNo || epicNo.trim().length < 4) {
      return res.status(400).json({ success: false, message: 'Please provide a valid EPIC number' });
    }

    const cleanEpic = epicNo.trim().toUpperCase();

    // Check if voter DB has document
    const voterDb = await getVoterDbClient();
    const collections = await voterDb.listCollections().toArray();

    let foundDoc = null;
    for (let col of collections) {
      if (!col.name.startsWith('ass_')) continue;
      const doc = await voterDb.collection(col.name).findOne({ EPIC_NO: cleanEpic });
      if (doc) {
        foundDoc = {
          epic_no: doc.EPIC_NO,
          name: doc.VOTER_NAME,
          father_name: doc.RELATION_NAME || doc.FATHER_NAME || doc.VOTER_NAME,
          district: doc.DISTRICT,
          assembly_no: doc.ASSEMBLY_NO || col.name.replace('ass_', ''),
          assembly: doc.ASSEMBLY_NAME || `Assembly ${doc.ASSEMBLY_NO}`,
          part_no: doc.PART_NO || '1',
          serial_no: doc.SL_NO || '1',
          gender: doc.GENDER || 'Unspecified',
          age: doc.AGE || 35
        };
        break;
      }
    }

    if (!foundDoc) {
      return res.status(404).json({
        success: false,
        message: `EPIC '${cleanEpic}' not found in Tamil Nadu Voter Roll. Please check your voter ID card.`
      });
    }

    return res.status(200).json({
      success: true,
      voter: foundDoc
    });
  } catch (error) {
    console.error('[validateEpic Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get User Profile & Registered Schemes
// @route   GET /api/profile/:epicNo
const getProfile = async (req, res) => {
  try {
    const { epicNo } = req.params;
    const { mobile } = req.query;

    const orConditions = [];
    if (epicNo && epicNo !== 'undefined' && epicNo !== 'null' && epicNo.trim()) {
      orConditions.push({ epicNo: epicNo.trim().toUpperCase() });
    }
    if (mobile && mobile !== 'undefined' && mobile !== 'null' && mobile.trim()) {
      orConditions.push({ mobile: mobile.trim() });
    }

    if (orConditions.length === 0) {
      return res.status(400).json({ success: false, message: 'EPIC or Mobile is required' });
    }

    const user = await User.findOne({ $or: orConditions });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User profile not found' });
    }

    const appConditions = [{ userId: user._id }];
    if (user.epicNo) appConditions.push({ epicNo: user.epicNo });
    if (user.mobile) appConditions.push({ mobile: user.mobile });

    const applications = await SchemeApplication.find({ $or: appConditions }).sort({ appliedAt: -1 });

    return res.status(200).json({
      success: true,
      user,
      applications,
      referralCode: user.referralCode,
      ntCode: user.referralCode
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Register Selected Schemes & Complete Registration
// @route   POST /api/register-schemes
const registerSchemes = async (req, res) => {
  try {
    const {
      mobile, epicNo, epic_no, voterName, name, district, assemblyName, assembly,
      boothNo, part_no, gender, schemes, schemeIds, referralCode, refCode, referredBy, photo
    } = req.body;

    const cleanMobile = (mobile || '').trim();
    const cleanEpic = (epicNo || epic_no || '').trim().toUpperCase();
    const cleanName = (voterName || name || 'BJP Member').trim();
    const cleanDist = (district || 'TAMIL NADU').trim();
    const cleanAss  = (assemblyName || assembly || 'Assembly').trim();
    const cleanBooth = (boothNo || part_no || '1').toString().trim();

    if (!cleanMobile && !cleanEpic) {
      return res.status(400).json({ success: false, message: 'Mobile or EPIC number is required' });
    }

    const orConditions = [];
    if (cleanMobile) orConditions.push({ mobile: cleanMobile });
    if (cleanEpic) orConditions.push({ epicNo: cleanEpic });

    let user = await User.findOne({ $or: orConditions });

    if (!user) {
      const ntCode = 'NT-' + Math.random().toString(36).substring(2, 10).toUpperCase();

      user = await User.create({
        mobile: cleanMobile || '0000000000',
        epicNo: cleanEpic || ('TEMP-' + Date.now()),
        voterName: cleanName,
        district: cleanDist,
        assemblyName: cleanAss,
        boothNo: cleanBooth,
        gender: gender || 'Unspecified',
        referralCode: ntCode,
        referredBy: (referredBy || refCode || null)
      });
    }

    // List of selected schemes to register
    const targetSchemes = schemeIds || schemes || ['PM_KISAN', 'PM_UJJWALA', 'AYUSHMAN_BHARAT'];
    const registeredApps = [];

    const { BJP_SCHEMES_LIST } = require('./schemeController');

    for (let sch of targetSchemes) {
      const schemeName = String(sch);
      // Look up scheme metadata in BJP_SCHEMES_LIST
      const matched = (BJP_SCHEMES_LIST || []).find(s =>
        s.name.toLowerCase() === schemeName.toLowerCase() ||
        schemeName.toLowerCase().includes(s.name.toLowerCase()) ||
        (s.id && Number(schemeName) === s.id)
      );

      // Check if already applied
      const existing = await SchemeApplication.findOne({
        $or: [
          { userId: user._id, schemeName },
          { mobile: user.mobile, schemeName },
          { epicNo: user.epicNo, schemeName }
        ]
      });

      if (!existing) {
        const app = await SchemeApplication.create({
          userId: user._id,
          voterName: user.voterName,
          epicNo: user.epicNo,
          mobile: user.mobile,
          district: user.district,
          assemblyName: user.assemblyName,
          boothNo: user.boothNo,
          schemeId: matched ? matched.id : (typeof sch === 'number' ? sch : 1),
          schemeName,
          clusterName: matched ? matched.cluster : 'BJP Nalam Thittam Welfare',
          benefit: matched ? matched.benefit : 'BJP Central Scheme Benefit',
          status: 'Submitted',
          appliedAt: new Date()
        });
        registeredApps.push(app);
      }
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Schemes registered successfully!',
      token,
      user,
      ntCode: user.referralCode,
      referralCode: user.referralCode,
      registeredApps
    });
  } catch (error) {
    console.error('[registerSchemes Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to register schemes', error: error.message });
  }
};

// @desc    Get Referral Link Info
// @route   GET /api/referral-link/:ntCode
const getReferralLink = async (req, res) => {
  try {
    const { ntCode } = req.params;
    const cleanNt = ntCode.trim().toUpperCase();

    const referrer = await User.findOne({
      $or: [{ referralCode: cleanNt }, { epicNo: cleanNt }]
    });

    const referralCount = await User.countDocuments({ referredBy: cleanNt });

    return res.status(200).json({
      success: true,
      ntCode: cleanNt,
      referralCode: cleanNt,
      referrerName: referrer ? referrer.voterName : 'BJP Supporter',
      referralCount
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Referred Members List
// @route   GET /api/my-members/:ntCode
const getMyMembers = async (req, res) => {
  try {
    const { ntCode } = req.params;
    const cleanNt = ntCode.trim().toUpperCase();

    const members = await User.find({ referredBy: cleanNt }).select('voterName epicNo mobile district assemblyName boothNo createdAt');

    return res.status(200).json({
      success: true,
      count: members.length,
      members
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Member Status & Applications
// @route   GET /api/member-status/:ntCode
const getMemberStatus = async (req, res) => {
  try {
    const { ntCode } = req.params;
    const cleanNt = ntCode.trim().toUpperCase();

    const user = await User.findOne({
      $or: [{ referralCode: cleanNt }, { epicNo: cleanNt }]
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    const applications = await SchemeApplication.find({ userId: user._id }).sort({ appliedAt: -1 });

    return res.status(200).json({
      success: true,
      user,
      applications
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  sendOtp,
  verifyOtp,
  checkMobile,
  validateEpic,
  getProfile,
  registerSchemes,
  getReferralLink,
  getMyMembers,
  getMemberStatus
};
