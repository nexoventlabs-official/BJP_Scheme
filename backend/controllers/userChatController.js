const User = require('../models/User');
const OtpSession = require('../models/OtpSession');
const SchemeApplication = require('../models/SchemeApplication');
const { getVoterDbClient } = require('../config/db');
const { sendSmsOtp } = require('../services/smsService');
const { findVoterByEpic } = require('../services/voterSearchService');
const jwt = require('jsonwebtoken');

const generateToken = (id, tokenVersion = 1) => {
  return jwt.sign({ id, tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: '7d'
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
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    // Run the user lookup and old-session cleanup together (both local DB ops).
    const [existingUser] = await Promise.all([
      User.findOne({ mobile: cleanMobile }),
      OtpSession.deleteMany({ mobile: cleanMobile })
    ]);

    // Persist the OTP session BEFORE responding so verification is ready
    // immediately. (verifyOtp matches on mobile + otp, not sessionId.)
    const session = await OtpSession.create({
      mobile: cleanMobile,
      otp,
      sessionId: null,
      expiresAt
    });

    // Respond right away — the SMS gateway call is the slow part, so we
    // dispatch it in the background instead of making the user wait for the
    // 2Factor round-trip. The OTP already works the moment this returns.
    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      mobile: cleanMobile,
      isExistingUser: !!existingUser,
      ...(process.env.NODE_ENV !== 'production' && { devOtp: otp })
    });

    // Fire-and-forget SMS dispatch (does not block the response).
    sendSmsOtp(cleanMobile, otp)
      .then((smsResult) => {
        if (smsResult?.sessionId) {
          OtpSession.updateOne({ _id: session._id }, { sessionId: smsResult.sessionId }).catch(() => {});
        }
      })
      .catch((err) => console.error('[sendOtp background SMS Error]:', err.message));
  } catch (error) {
    console.error('[sendOtp Error]:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }
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

    // Static dev-bypass OTP is ONLY honoured outside production. In production
    // (NODE_ENV=production) there is no bypass — a real, matching OTP session
    // is always required.
    const allowDevBypass = process.env.NODE_ENV !== 'production';
    const isDevBypass = allowDevBypass && cleanOtp === '123456';

    const session = await OtpSession.findOne({ mobile: cleanMobile, verified: false });

    if (!session && !isDevBypass) {
      return res.status(400).json({ success: false, message: 'OTP session expired. Please request a new OTP.' });
    }

    // Authoritative expiry check — don't rely solely on the TTL index (whose
    // sweep is approximate). Reject an OTP whose window has already passed.
    if (session && session.expiresAt && session.expiresAt.getTime() < Date.now() && !isDevBypass) {
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new OTP.' });
    }

    if (session && session.otp !== cleanOtp && !isDevBypass) {
      return res.status(400).json({ success: false, message: 'Invalid OTP entered. Please try again.' });
    }

    if (session) {
      session.verified = true;
      await session.save();
    }

    const existingUser = await User.findOne({ mobile: cleanMobile });

    if (existingUser) {
      const token = generateToken(existingUser._id, existingUser.tokenVersion || 1);
      const clientOrigin = process.env.FRONTEND_URL || process.env.CLIENT_URL || req.get('origin') || 'https://bjp-scheme.vercel.app';
      const referralLink = `${clientOrigin.replace(/\/$/, '')}/r/${existingUser.referralCode}`;
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
    return res.status(500).json({ success: false, message: 'Failed to verify OTP' });
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
    return res.status(500).json({ success: false, message: 'Internal server error' });
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

    // Fast parallel batch search across assembly collections
    const result = await findVoterByEpic(cleanEpic);

    if (!result || !result.doc) {
      return res.status(404).json({
        success: false,
        message: `EPIC '${cleanEpic}' not found in Tamil Nadu Voter Roll. Please check your voter ID card.`
      });
    }

    const doc = result.doc;
    const colName = result.colName || '';
    const foundDoc = {
      epic_no: doc.EPIC_NO,
      name: doc.VOTER_NAME,
      father_name: doc.RELATION_NAME || doc.FATHER_NAME || doc.VOTER_NAME,
      district: doc.DISTRICT,
      assembly_no: doc.ASSEMBLY_NO || colName.replace('ass_', ''),
      assembly: doc.ASSEMBLY_NAME || `Assembly ${doc.ASSEMBLY_NO}`,
      part_no: doc.PART_NO || '1',
      serial_no: doc.SL_NO || '1',
      gender: doc.GENDER || 'Unspecified',
      age: doc.AGE || 35
    };

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
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @desc    Get User Profile & Registered Schemes
// @route   GET /api/profile/:epicNo
const getProfile = async (req, res) => {
  try {
    // Identity comes from the authenticated token (protectUser), NOT from the
    // URL param — this prevents anyone from reading another member's profile by
    // supplying an arbitrary EPIC number (IDOR).
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
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
    return res.status(500).json({ success: false, message: 'Internal server error' });
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

    // ── Authorisation ──
    // Accept EITHER a valid user JWT (existing member adding schemes) OR a
    // verified OTP session for this mobile (brand-new member completing sign-up).
    // This blocks anonymous callers from creating users / inflating referrals.
    let tokenUser = null;
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        tokenUser = await User.findById(decoded.id);
      } catch { /* invalid token — fall through to OTP-session check */ }
    }
    if (!tokenUser) {
      const verifiedSession = cleanMobile
        ? await OtpSession.findOne({ mobile: cleanMobile, verified: true })
        : null;
      if (!verifiedSession) {
        return res.status(401).json({ success: false, message: 'Verification required. Please verify your mobile via OTP first.' });
      }
    }

    const orConditions = [];
    if (cleanMobile) orConditions.push({ mobile: cleanMobile });
    if (cleanEpic) orConditions.push({ epicNo: cleanEpic });

    let user = tokenUser || await User.findOne({ $or: orConditions });

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
    return res.status(500).json({ success: false, message: 'Failed to register schemes' });
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
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @desc    Get Referred Members List
// @route   GET /api/my-members/:ntCode
const getMyMembers = async (req, res) => {
  try {
    // Only the authenticated user's OWN referred members are returned. The
    // referral code(s) are taken from the token, not the URL param.
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const matchCodes = [user.referralCode, user.epicNo, user.mobile].filter(Boolean);

    const members = await User.find({ referredBy: { $in: matchCodes } }).select('voterName epicNo mobile district assemblyName boothNo createdAt');

    return res.status(200).json({
      success: true,
      count: members.length,
      members
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @desc    Get Member Status & Applications
// @route   GET /api/member-status/:ntCode
const getMemberStatus = async (req, res) => {
  try {
    // Authenticated member's own status only (identity from token).
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const applications = await SchemeApplication.find({ userId: user._id }).sort({ appliedAt: -1 });

    // Count everyone this member has referred (matched against their referral
    // code / epic / mobile, since referredBy stores the referrer's code).
    const matchCodes = [user.referralCode, user.epicNo, user.mobile].filter(Boolean);
    const referredCount = await User.countDocuments({ referredBy: { $in: matchCodes } });

    return res.status(200).json({
      success: true,
      user,
      applications,
      referred_count: referredCount,
      referralCount: referredCount,
      created_at: user.createdAt,
      district: user.district,
      assembly_name: user.assemblyName,
      booth_no: user.boothNo,
      boothNo: user.boothNo
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
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
