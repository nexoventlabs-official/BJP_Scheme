const ExcelJS = require('exceljs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const SchemeApplication = require('../models/SchemeApplication');
const { getVoterDbClient } = require('../config/db');
const {
  getAssemblyMetadata,
  getDistrictCredentialsList,
  getAssemblyCredentialsList,
  getBoothCredentialsForAssembly,
  authenticateDynamicAdmin,
  getCollectionsForDistrict,
  getCollectionForAssembly,
  getDistrictVoterRollCount,
  getAssemblyVoterRollCount,
  getBoothVoterRollCount,
  getStateVoterRollCount
} = require('../services/jurisdictionService');

const generateAdminToken = (admin) => {
  return jwt.sign(
    {
      id: admin._id || admin.id,
      username: admin.username,
      role: admin.role,
      district: admin.district,
      assemblyName: admin.assemblyName,
      boothNo: admin.boothNo,
      isAdmin: true
    },
    process.env.JWT_SECRET || 'bjp_nalam_thittam_secret_2026',
    { expiresIn: '7d' }
  );
};

// Helper: Get scoping query for admin role
const getAdminScopeQuery = (admin) => {
  const query = {};
  if (admin.role === 'DISTRICT_ADMIN' && admin.district) {
    query.district = new RegExp('^' + admin.district + '$', 'i');
  } else if (admin.role === 'ASSEMBLY_ADMIN') {
    if (admin.district) query.district = new RegExp('^' + admin.district + '$', 'i');
    if (admin.assemblyName) query.assemblyName = new RegExp('^' + admin.assemblyName + '$', 'i');
  } else if (admin.role === 'BOOTH_ADMIN') {
    if (admin.district) query.district = new RegExp('^' + admin.district + '$', 'i');
    if (admin.assemblyName) query.assemblyName = new RegExp('^' + admin.assemblyName + '$', 'i');
    if (admin.boothNo) query.boothNo = String(admin.boothNo);
  }
  return query;
};

// @desc    Admin Login
// @route   POST /api/admin/login
// @access  Public
const adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    // 1. Check Mongoose DB
    const admin = await Admin.findOne({ username: cleanUsername });
    if (admin) {
      const isMatch = await admin.matchPassword(cleanPassword);
      if (isMatch) {
        const token = generateAdminToken(admin);
        return res.status(200).json({
          success: true,
          message: `Welcome ${admin.role} (${admin.username})`,
          token,
          admin: {
            id: admin._id,
            username: admin.username,
            role: admin.role,
            district: admin.district,
            assemblyName: admin.assemblyName,
            boothNo: admin.boothNo
          }
        });
      }
    }

    // 2. Check Dynamic Booth / Assembly / District Credential
    const dynamicAdmin = await authenticateDynamicAdmin(cleanUsername, cleanPassword);
    if (dynamicAdmin) {
      const token = generateAdminToken(dynamicAdmin);
      return res.status(200).json({
        success: true,
        message: `Welcome ${dynamicAdmin.role} (${dynamicAdmin.username})`,
        token,
        admin: dynamicAdmin
      });
    }

    return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
  } catch (error) {
    console.error('[adminLogin Error]:', error);
    return res.status(500).json({ success: false, message: 'Admin login failed', error: error.message });
  }
};

// @desc    Get All Assemblies Metadata (for Assembly Dropdown)
// @route   GET /api/admin/jurisdiction-assemblies
// @access  Private (Admin)
const getAssembliesList = async (req, res) => {
  try {
    const assemblies = await getAssemblyMetadata();
    return res.status(200).json({
      success: true,
      count: assemblies.length,
      assemblies
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get All District Admin Credentials List
// @route   GET /api/admin/jurisdiction-district-credentials
// @access  Private (Admin)
const getDistrictCredentials = async (req, res) => {
  try {
    const districts = await getDistrictCredentialsList();
    return res.status(200).json({
      success: true,
      count: districts.length,
      districts
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get All Assembly Admin Credentials List
// @route   GET /api/admin/jurisdiction-assembly-credentials
// @access  Private (Admin)
const getAssemblyCredentials = async (req, res) => {
  try {
    const assemblies = await getAssemblyCredentialsList();
    return res.status(200).json({
      success: true,
      count: assemblies.length,
      assemblies
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Generated Booth Credentials for selected Assembly
// @route   GET /api/admin/assembly-booth-credentials
// @access  Private (Admin)
const getAssemblyBoothCredentials = async (req, res) => {
  try {
    const { assemblyNo } = req.query;
    const targetNo = assemblyNo || '1';

    const data = await getBoothCredentialsForAssembly(targetNo);
    if (!data) {
      return res.status(404).json({ success: false, message: `Assembly #${targetNo} not found` });
    }

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Admin Dashboard Scoped Statistics
// @route   GET /api/admin/dashboard-stats
// @access  Private (Admin)
const getDashboardStats = async (req, res) => {
  try {
    const admin = req.admin;
    const { district, assemblyName, boothNo } = req.query || {};
    const scopeQuery = getAdminScopeQuery(admin);

    // Count from WRITE DB: users who registered/requested schemes
    const totalVotersRequested = await User.countDocuments(scopeQuery);
    const totalApplications = await SchemeApplication.countDocuments(scopeQuery);

    // Count from READ DB: instant from in-memory cache
    let totalVotersInRoll = null;
    try {
      const activeBooth = boothNo || (admin.role === 'BOOTH_ADMIN' ? admin.boothNo : null);
      const activeAss   = assemblyName || admin.assemblyName;
      const activeDist  = district || admin.district;

      if (activeBooth && activeAss) {
        const cols = await getCollectionForAssembly(activeAss);
        if (cols && cols.length > 0) {
          const voterDb = await getVoterDbClient();
          const bStr = String(activeBooth);
          const bNum = parseInt(activeBooth);
          totalVotersInRoll = await voterDb.collection(cols[0]).countDocuments({
            $or: [{ PART_NO: bStr }, { PART_NO: bNum }]
          });
        }
      } else if (activeAss) {
        totalVotersInRoll = await getAssemblyVoterRollCount(activeAss);
      } else if (activeDist) {
        totalVotersInRoll = await getDistrictVoterRollCount(activeDist);
      } else {
        totalVotersInRoll = await getStateVoterRollCount();
      }
    } catch (rollErr) {
      console.error('[ReadDB VoterCount Error]:', rollErr.message);
    }

    // ── Execute all aggregation queries in parallel (O(1) execution time) ──
    const [
      statusCounts,
      rawDistrictStats,
      rawAssemblyStats,
      rawBoothStats,
      rawPopularity,
      topReferrersRaw
    ] = await Promise.all([
      SchemeApplication.aggregate([
        { $match: scopeQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ], { allowDiskUse: true }),

      SchemeApplication.aggregate([
        { $match: scopeQuery },
        {
          $group: {
            _id: '$district',
            totalApps: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $in: ['$status', ['Submitted', 'Pending', 'In Progress', 'Called']] }, 1, 0] } },
            voterIds: { $addToSet: { $ifNull: ['$epicNo', '$mobile'] } }
          }
        },
        {
          $project: {
            _id: 1,
            totalApps: 1,
            approved: 1,
            pending: 1,
            appliedVoters: { $size: '$voterIds' }
          }
        },
        { $sort: { totalApps: -1 } }
      ], { allowDiskUse: true }),

      SchemeApplication.aggregate([
        { $match: scopeQuery },
        {
          $group: {
            _id: { district: '$district', assemblyName: '$assemblyName' },
            totalApps: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $in: ['$status', ['Submitted', 'Pending', 'In Progress', 'Called']] }, 1, 0] } },
            voterIds: { $addToSet: { $ifNull: ['$epicNo', '$mobile'] } }
          }
        },
        {
          $project: {
            _id: 1,
            totalApps: 1,
            approved: 1,
            pending: 1,
            appliedVoters: { $size: '$voterIds' }
          }
        },
        { $sort: { totalApps: -1 } },
        { $limit: 50 }
      ], { allowDiskUse: true }),

      SchemeApplication.aggregate([
        { $match: scopeQuery },
        {
          $group: {
            _id: { district: '$district', assemblyName: '$assemblyName', boothNo: '$boothNo' },
            totalApps: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $in: ['$status', ['Submitted', 'Pending', 'In Progress', 'Called']] }, 1, 0] } },
            voterIds: { $addToSet: { $ifNull: ['$epicNo', '$mobile'] } }
          }
        },
        {
          $project: {
            _id: 1,
            totalApps: 1,
            approved: 1,
            pending: 1,
            appliedVoters: { $size: '$voterIds' }
          }
        },
        { $sort: { totalApps: -1 } },
        { $limit: 100 }
      ], { allowDiskUse: true }),

      SchemeApplication.aggregate([
        { $match: scopeQuery },
        { $group: { _id: '$schemeName', count: { $sum: 1 }, cluster: { $first: '$clusterName' } } },
        { $sort: { count: -1 } }
      ], { allowDiskUse: true }),

      User.aggregate([
        {
          $match: {
            ...scopeQuery,
            referredBy: { $nin: [null, '', 'null', 'undefined'] }
          }
        },
        { $group: { _id: '$referredBy', referralCount: { $sum: 1 } } },
        { $sort: { referralCount: -1 } },
        { $limit: 5 }
      ], { allowDiskUse: true })
    ]);

    const statusMap = {
      Submitted: 0,
      Pending: 0,
      Called: 0,
      'In Progress': 0,
      Verified: 0,
      Approved: 0,
      Rejected: 0
    };
    statusCounts.forEach(item => {
      if (item._id) statusMap[item._id] = item.count;
    });

    const districtStats = await Promise.all(
      rawDistrictStats.map(async (d) => {
        const rollCount = await getDistrictVoterRollCount(d._id);
        return {
          _id: d._id,
          totalVoters: rollCount || null,
          appliedVoters: d.appliedVoters || 0,
          totalApps: d.totalApps,
          approved: d.approved,
          pending: d.pending
        };
      })
    );

    const assemblyStats = await Promise.all(
      rawAssemblyStats.map(async (a) => {
        const rollCount = await getAssemblyVoterRollCount(a._id.assemblyName);
        return {
          _id: a._id,
          totalVoters: rollCount || null,
          appliedVoters: a.appliedVoters || 0,
          totalApps: a.totalApps,
          approved: a.approved,
          pending: a.pending
        };
      })
    );

    const boothStats = await Promise.all(
      rawBoothStats.map(async (b) => {
        let rollCount = null;
        if (b._id.assemblyName && b._id.boothNo) {
          rollCount = await getBoothVoterRollCount(b._id.assemblyName, b._id.boothNo);
        }
        return {
          _id: b._id,
          totalVoters: rollCount,
          appliedVoters: b.appliedVoters || 0,
          totalApps: b.totalApps,
          approved: b.approved,
          pending: b.pending
        };
      })
    );

    const CANONICAL_SCHEMES = [
      { id: '1', name: 'PMSBY', keys: ['pmsby', 'suraksha bima'], cluster: 'Cluster 1 — Insurance Trinity (Daily Wage Workers)' },
      { id: '2', name: 'PMJJBY', keys: ['pmjjby', 'jeevan jyoti'], cluster: 'Cluster 1 — Insurance Trinity (Daily Wage Workers)' },
      { id: '3', name: 'APY', keys: ['apy', 'atal pension'], cluster: 'Cluster 1 — Insurance Trinity (Daily Wage Workers)' },
      { id: '4', name: 'PM SVANidhi', keys: ['svanidhi', 'street vendor'], cluster: 'Cluster 2 — Credit (Street Vendors & Small Business)' },
      { id: '5', name: 'PM Mudra Shishu', keys: ['mudra shishu', 'shishu'], cluster: 'Cluster 2 — Credit (Street Vendors & Small Business)' },
      { id: '6', name: 'PM Mudra Kishor', keys: ['mudra kishor', 'kishor'], cluster: 'Cluster 2 — Credit (Street Vendors & Small Business)' },
      { id: '7', name: 'Udyam', keys: ['udyam', 'msme'], cluster: 'Cluster 2 — Credit (Street Vendors & Small Business)' },
      { id: '8', name: 'Stand Up India', keys: ['stand up', 'standup'], cluster: 'Cluster 2 — Credit (Street Vendors & Small Business)' },
      { id: '9', name: 'Startup Seed Fund', keys: ['startup', 'seed fund'], cluster: 'Cluster 2 — Credit (Street Vendors & Small Business)' },
      { id: '10', name: 'PM Kisan', keys: ['pm kisan', 'kisan samman'], cluster: 'Cluster 3 — Farmers (Kisan)' },
      { id: '11', name: 'PM Fasal Bima', keys: ['fasal bima', 'crop insurance'], cluster: 'Cluster 3 — Farmers (Kisan)' },
      { id: '12', name: 'PM Kisan Maan Dhan', keys: ['maan dhan', 'farmer pension'], cluster: 'Cluster 3 — Farmers (Kisan)' },
      { id: '13', name: 'PM Ujjwala', keys: ['ujjwala', 'lpg'], cluster: 'Cluster 4 — Women & Families' },
      { id: '14', name: 'PM Matru Vandana', keys: ['matru vandana', 'maternity'], cluster: 'Cluster 4 — Women & Families' },
      { id: '15', name: 'Sukanya Samridhi', keys: ['sukanya', 'girl child'], cluster: 'Cluster 4 — Women & Families' },
      { id: '16', name: 'PMKVY', keys: ['pmkvy', 'kaushal vikas'], cluster: 'Cluster 5 — Youth & Skills (Future)' },
      { id: '17', name: 'NSP Scholarship', keys: ['nsp', 'scholarship'], cluster: 'Cluster 5 — Youth & Skills (Future)' },
      { id: '18', name: 'PM Vishwakarma', keys: ['vishwakarma'], cluster: 'Cluster 5 — Youth & Skills (Future)' },
      { id: '19', name: 'Jan Dhan', keys: ['jan dhan', 'zero-balance', 'ayushman'], cluster: 'Foundation Layer (Prerequisite for all DBT)' },
      { id: '20', name: 'e-Shram', keys: ['e-shram', 'eshram', 'unorganised'], cluster: 'Foundation Layer (Prerequisite for all DBT)' }
    ];

    const popularityObj = {};
    rawPopularity.forEach(item => {
      const rawStr = String(item._id || '').trim().toLowerCase();
      let matched = CANONICAL_SCHEMES.find(s => String(s.id) === String(item._id) || s.name.toLowerCase() === rawStr);
      if (!matched) {
        matched = CANONICAL_SCHEMES.find(s => s.keys.some(k => rawStr.includes(k)));
      }

      const displayName = matched ? matched.name : String(item._id);
      const clusterName = matched ? matched.cluster : (item.cluster || 'BJP Nalam Thittam Welfare');

      if (!popularityObj[displayName]) {
        popularityObj[displayName] = { _id: displayName, count: 0, cluster: clusterName };
      }
      popularityObj[displayName].count += item.count;
    });

    const schemePopularity = Object.values(popularityObj).sort((a, b) => b.count - a.count);

    const topReferrers = await Promise.all(
      topReferrersRaw.map(async (item) => {
        const referrerUser = await User.findOne({
          $or: [
            { referralCode: item._id },
            { epicNo: item._id },
            { mobile: item._id }
          ]
        });

        if (referrerUser) {
          const apps = await SchemeApplication.find({ userId: referrerUser._id });
          return {
            epicNo: referrerUser.epicNo,
            voterName: referrerUser.voterName,
            mobile: referrerUser.mobile,
            district: referrerUser.district,
            assemblyName: referrerUser.assemblyName,
            boothNo: referrerUser.boothNo,
            referralCode: referrerUser.referralCode,
            referralCount: item.referralCount,
            applications: apps
          };
        } else {
          return {
            epicNo: item._id,
            voterName: `Referrer (${item._id})`,
            referralCount: item.referralCount,
            applications: []
          };
        }
      })
    );

    return res.status(200).json({
      success: true,
      adminRole: admin.role,
      jurisdiction: {
        district: admin.district,
        assemblyName: admin.assemblyName,
        boothNo: admin.boothNo
      },
      overview: {
        totalUsers: totalVotersRequested,
        totalVotersRequested,
        totalVotersInRoll,
        totalApplications,
        statusBreakdown: statusMap
      },
      districtStats,
      assemblyStats,
      boothStats,
      schemePopularity,
      topReferrers
    });
  } catch (error) {
    console.error('[getDashboardStats Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to compute dashboard stats', error: error.message });
  }
};

// @desc    Get Referred Members by Member (EPIC or Referral Code)
// @route   GET /api/admin/member-referrals
// @access  Private (Admin)
const getMemberReferrals = async (req, res) => {
  try {
    const { epicNo, referralCode, mobile, userId } = req.query;

    let targetUser = null;
    if (userId) targetUser = await User.findById(userId);
    if (!targetUser && epicNo) targetUser = await User.findOne({ epicNo: epicNo.trim().toUpperCase() });
    if (!targetUser && mobile) targetUser = await User.findOne({ mobile: mobile.trim() });
    if (!targetUser && referralCode) targetUser = await User.findOne({ referralCode: referralCode.trim() });

    const searchCodes = [];
    if (targetUser) {
      if (targetUser.referralCode) searchCodes.push(targetUser.referralCode);
      if (targetUser.epicNo) searchCodes.push(targetUser.epicNo);
      if (targetUser.mobile) searchCodes.push(targetUser.mobile);
    }
    if (referralCode) searchCodes.push(referralCode);
    if (epicNo) searchCodes.push(epicNo);
    if (mobile) searchCodes.push(mobile);

    const uniqueCodes = Array.from(new Set(searchCodes.filter(Boolean)));
    if (uniqueCodes.length === 0) {
      return res.status(200).json({ success: true, count: 0, referredVoters: [] });
    }

    const referredUsers = await User.find({
      referredBy: { $in: uniqueCodes }
    }).sort({ createdAt: -1 });

    const referredVoters = await Promise.all(
      referredUsers.map(async (u) => {
        const apps = await SchemeApplication.find({ userId: u._id });
        return {
          id: u._id,
          epicNo: u.epicNo,
          voterName: u.voterName,
          mobile: u.mobile,
          district: u.district,
          assemblyName: u.assemblyName,
          boothNo: u.boothNo,
          applications: apps
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: referredVoters.length,
      referredVoters
    });
  } catch (error) {
    console.error('[getMemberReferrals Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Scoped Applications List for Admin (Paginated by Voter)
// @route   GET /api/admin/applications
const getApplicationsList = async (req, res) => {
  try {
    const admin = req.admin;
    const { search, status, schemeName, district, assemblyName, boothNo, page = 1, limit = 20, exportAll } = req.query;
    const isExport = req.query.isExport === 'true' || exportAll === 'true';
    const pageNum  = Math.max(1, parseInt(page)  || 1);
    const limitNum = isExport ? 500000 : Math.min(500, Math.max(1, parseInt(limit) || 20));
    const skip = isExport ? 0 : (pageNum - 1) * limitNum;

    // ── Build Scope Filter for SchemeApplications ──
    const adminScope = getAdminScopeQuery(admin);
    const appScopeFilter = { ...adminScope };

    if (district)     appScopeFilter.district     = new RegExp('^' + district.trim() + '$', 'i');
    if (assemblyName) appScopeFilter.assemblyName = new RegExp('^' + assemblyName.trim() + '$', 'i');
    if (boothNo)      appScopeFilter.boothNo      = String(boothNo);
    if (status)       appScopeFilter.status       = new RegExp('^' + status.trim() + '$', 'i');

    if (schemeName) {
      const clean = schemeName.trim();
      const regexes = [new RegExp(clean, 'i')];
      const numId = Number(clean);
      const schemeMap = {
        'PMSBY': 1, 'PMJJBY': 2, 'APY': 3, 'PM SVANidhi': 4, 'PM Mudra Shishu': 5,
        'PM Mudra Kishor': 6, 'Udyam': 7, 'Stand Up India': 8, 'Startup Seed Fund': 9,
        'PM Kisan': 10, 'PM Fasal Bima': 11, 'PM Kisan Maan Dhan': 12, 'PM Ujjwala': 13,
        'Sukanya Samridhi': 14, 'PM Matru Vandana': 15, 'Jan Dhan': 16, 'PM Vishwakarma': 17,
        'PMKVY': 18, 'e-Shram': 19, 'NSP Scholarship': 20
      };
      let foundId = !isNaN(numId) && numId > 0 ? numId : null;
      if (!foundId) {
        for (const [sKey, sId] of Object.entries(schemeMap)) {
          if (sKey.toLowerCase() === clean.toLowerCase() || clean.toLowerCase().includes(sKey.toLowerCase())) {
            foundId = sId;
            regexes.push(new RegExp('^' + sKey + '$', 'i'));
            break;
          }
        }
      }
      const appMatchConds = [{ schemeName: { $in: regexes } }];
      if (foundId) {
        appMatchConds.push({ schemeName: String(foundId) });
        appMatchConds.push({ schemeId: foundId });
      }
      appScopeFilter.$or = appMatchConds;
    }

    if (search) {
      const r = new RegExp(search.trim(), 'i');
      const searchConds = [{ voterName: r }, { epicNo: r }, { mobile: r }, { schemeName: r }];
      if (appScopeFilter.$or) {
        const existingOr = appScopeFilter.$or;
        delete appScopeFilter.$or;
        appScopeFilter.$and = [{ $or: existingOr }, { $or: searchConds }];
      } else {
        appScopeFilter.$or = searchConds;
      }
    }

    // ── Fast Path: Two-step voter-based pagination (avoids MongoDB 32MB sort limit) ──
    if (!isExport) {
      const voterSkip = (pageNum - 1) * limitNum;

      // Step 1: Lightweight aggregation — only epicNo + latestAt (tiny memory, no $$ROOT)
      // Run in parallel with counts and status breakdown
      const [totalAppsCount, rawEpicList, statusGroup, epicPage] = await Promise.all([
        SchemeApplication.countDocuments(appScopeFilter),
        SchemeApplication.distinct('epicNo', appScopeFilter),
        SchemeApplication.aggregate([
          { $match: appScopeFilter },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ], { allowDiskUse: true }),
        SchemeApplication.aggregate([
          { $match: appScopeFilter },
          // Group by voter — only keep the 3 tiny fields needed for sorting + identity
          {
            $group: {
              _id:      { $ifNull: ['$epicNo', { $ifNull: [{ $toString: '$userId' }, '$mobile'] }] },
              epicNo:   { $first: '$epicNo' },
              latestAt: { $max: '$appliedAt' }
            }
          },
          { $sort: { latestAt: -1 } },
          { $skip:  voterSkip },
          { $limit: limitNum },
          { $project: { _id: 1, epicNo: 1 } }
        ], { allowDiskUse: true })
      ]);

      const distinctVoterCount = rawEpicList.length || totalAppsCount;
      const totalPages = Math.ceil(distinctVoterCount / limitNum) || 1;

      const statusCounts = { Approved: 0, Pending: 0, Submitted: 0, Processing: 0, Called: 0, Verified: 0, Completed: 0, Rejected: 0 };
      statusGroup.forEach(g => { if (g._id) statusCounts[g._id] = g.count; });

      // Step 2: Fetch full application docs for just these 20 voter EPICs
      const pageEpicNos  = epicPage.map(e => e.epicNo).filter(Boolean);
      const pageVoterIds = epicPage.map(e => e._id).filter(id => id && !pageEpicNos.includes(id));

      const rawApps = await SchemeApplication.find({
        $and: [
          appScopeFilter,
          { $or: [
            { epicNo: { $in: pageEpicNos } },
            { mobile: { $in: pageVoterIds } }
          ]}
        ]
      }).sort({ appliedAt: -1 }).lean();

      // Group apps by voter key
      const voterMap = {};
      // Preserve the sorted order from epicPage
      epicPage.forEach(e => { voterMap[e._id] = null; });

      rawApps.forEach(app => {
        const key = app.epicNo || (app.userId ? String(app.userId) : app.mobile);
        if (!key) return;
        if (!voterMap[key]) {
          voterMap[key] = {
            _id:          app.userId || key,
            epicNo:       app.epicNo || 'N/A',
            voterName:    app.voterName || 'N/A',
            mobile:       app.mobile || 'N/A',
            district:     app.district || 'N/A',
            assemblyName: app.assemblyName || 'N/A',
            boothNo:      app.boothNo || 'N/A',
            userId:       app.userId,
            referralCode: app.referralCode,
            applications: []
          };
        }
        voterMap[key].applications.push(app);
      });

      // Return voters in the same order as epicPage (latest first)
      let voters = epicPage
        .map(e => voterMap[e._id])
        .filter(Boolean);

      // ── Enrich missing voter names from the voter roll DB (read DB) ──
      // Detect any bad/placeholder voter name — always enrich from voter DB if name looks fake
      const PLACEHOLDER_NAMES = new Set([
        null, undefined, '', 'N/A', 'n/a', 'null', 'undefined',
        'voter', 'Voter', 'VOTER',
        'user', 'User', 'USER',
        'member', 'Member', 'MEMBER',
        'name', 'Name', 'NAME',
        'unknown', 'Unknown', 'UNKNOWN',
        'test', 'Test', 'TEST'
      ]);
      const isBadName = (name) => !name || PLACEHOLDER_NAMES.has(name) || String(name).trim().length < 2;
      const needsEnrichment = voters.filter(v => isBadName(v.voterName) && v.epicNo && v.epicNo !== 'N/A');

      if (needsEnrichment.length > 0) {
        try {
          const voterDb = await getVoterDbClient();
          const { getCollectionForAssembly } = require('../services/jurisdictionService');

          // Group by assemblyName to minimize DB queries (1 query per unique assembly)
          const byAssembly = {};
          needsEnrichment.forEach(v => {
            const key = v.assemblyName || '__unknown__';
            if (!byAssembly[key]) byAssembly[key] = [];
            byAssembly[key].push(v.epicNo);
          });

          const epicNameMap = {};

          await Promise.all(
            Object.entries(byAssembly).map(async ([assName, epicNos]) => {
              try {
                let colNames = assName !== '__unknown__' ? await getCollectionForAssembly(assName) : [];
                // Fallback: scan all collections if assembly not found
                if (!colNames.length) {
                  const allCols = await voterDb.listCollections().toArray();
                  colNames = allCols.filter(c => c.name.startsWith('ass_')).map(c => c.name);
                }
                for (const colName of colNames) {
                  const found = await voterDb.collection(colName).find(
                    { EPIC_NO: { $in: epicNos } },
                    { projection: { EPIC_NO: 1, VOTER_NAME: 1, _id: 0 } }
                  ).toArray();
                  found.forEach(doc => {
                    if (doc.EPIC_NO && doc.VOTER_NAME) epicNameMap[doc.EPIC_NO] = doc.VOTER_NAME;
                  });
                  if (epicNos.every(e => epicNameMap[e])) break;
                }
              } catch (e) { /* non-fatal */ }
            })
          );

          // Patch names into voters array
          voters = voters.map(v => {
            if (isBadName(v.voterName) && v.epicNo && epicNameMap[v.epicNo]) {
              return { ...v, voterName: epicNameMap[v.epicNo] };
            }
            return v;
          });
        } catch (enrichErr) {
          console.error('[Name Enrichment Error]:', enrichErr.message);
          // Non-fatal — continue with what we have
        }
      }

      return res.status(200).json({
        success: true,
        voters,
        totalApplications: totalAppsCount,
        totalVoters: distinctVoterCount,
        statusCounts,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
        applications: voters.flatMap(v => v.applications)
      });
    }

    // ── Aggregate distinct applicants for complete export ──
    const applicantAgg = await SchemeApplication.aggregate([
      { $match: appScopeFilter },
      {
        $group: {
          _id: { $ifNull: ['$epicNo', { $ifNull: ['$userId', '$mobile'] }] },
          epicNo: { $first: '$epicNo' },
          voterName: { $first: '$voterName' },
          mobile: { $first: '$mobile' },
          district: { $first: '$district' },
          assemblyName: { $first: '$assemblyName' },
          boothNo: { $first: '$boothNo' },
          userId: { $first: '$userId' },
          referralCode: { $first: '$referralCode' },
          latestAppliedAt: { $max: '$appliedAt' }
        }
      }
    ], { allowDiskUse: true });

    const totalVoters = applicantAgg.length;
    const totalPages  = Math.ceil(totalVoters / limitNum) || 1;
    const paginatedApplicants = applicantAgg;

    if (paginatedApplicants.length === 0) {
      return res.status(200).json({ success: true, voters: [], totalVoters, totalPages, currentPage: pageNum, limit: limitNum, applications: [] });
    }

    const paginatedUserIds = paginatedApplicants.map(a => a.userId).filter(Boolean);
    const paginatedEpicNos = paginatedApplicants.map(a => a.epicNo).filter(Boolean);
    const paginatedMobiles = paginatedApplicants.map(a => a.mobile).filter(Boolean);

    const allApps = await SchemeApplication.find({
      $or: [
        { userId: { $in: paginatedUserIds } },
        { epicNo: { $in: paginatedEpicNos } },
        { mobile: { $in: paginatedMobiles } }
      ]
    }).lean();

    allApps.sort((a, b) => new Date(b.appliedAt || b.createdAt) - new Date(a.appliedAt || a.createdAt));

    const appMapByEpic = {};
    const appMapByUserId = {};
    const appMapByMobile = {};

    allApps.forEach(app => {
      if (app.epicNo) {
        if (!appMapByEpic[app.epicNo]) appMapByEpic[app.epicNo] = [];
        appMapByEpic[app.epicNo].push(app);
      }
      if (app.userId) {
        const uid = String(app.userId);
        if (!appMapByUserId[uid]) appMapByUserId[uid] = [];
        appMapByUserId[uid].push(app);
      }
      if (app.mobile) {
        if (!appMapByMobile[app.mobile]) appMapByMobile[app.mobile] = [];
        appMapByMobile[app.mobile].push(app);
      }
    });

    const voters = paginatedApplicants.map(u => {
      const userAppMap = new Map();
      if (u.epicNo && appMapByEpic[u.epicNo]) {
        appMapByEpic[u.epicNo].forEach(a => userAppMap.set(String(a._id), a));
      }
      if (u.userId && appMapByUserId[String(u.userId)]) {
        appMapByUserId[String(u.userId)].forEach(a => userAppMap.set(String(a._id), a));
      }
      if (u.mobile && appMapByMobile[u.mobile]) {
        appMapByMobile[u.mobile].forEach(a => userAppMap.set(String(a._id), a));
      }

      const apps = Array.from(userAppMap.values()).sort((a, b) => new Date(b.appliedAt || b.createdAt) - new Date(a.appliedAt || a.createdAt));

      return {
        id: u._id,
        epicNo: u.epicNo,
        voterName: u.voterName,
        mobile: u.mobile,
        district: u.district,
        assemblyName: u.assemblyName,
        boothNo: u.boothNo,
        referralCode: u.referralCode,
        applications: apps
      };
    });

    return res.status(200).json({
      success:      true,
      voters,
      totalVoters,
      totalPages,
      currentPage:  pageNum,
      limit:        limitNum,
      applications: voters.flatMap(v => v.applications)
    });
  } catch (error) {
    console.error('[getApplicationsList Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


// @desc    Update Scheme Application Status & Remarks
// @route   PUT /api/admin/applications/:id/status
// @access  Private (Admin)
const updateApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks, isCallAction } = req.body;

    const app = await SchemeApplication.findById(id);
    if (!app) {
      return res.status(404).json({ success: false, message: 'Application record not found' });
    }

    if (status) {
      app.status = status;
    }
    if (remarks !== undefined) {
      app.adminRemarks = remarks;
    }
    if (isCallAction) {
      app.lastCalledAt = new Date();
      if (!status) app.status = 'Called';
    }

    app.statusHistory.push({
      status: app.status,
      remarks: remarks || (isCallAction ? 'Call logged by admin' : 'Status updated'),
      updatedBy: `${req.admin.role} (${req.admin.username})`,
      updatedAt: new Date()
    });

    await app.save();

    return res.status(200).json({
      success: true,
      message: 'Application status updated successfully',
      application: app
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create new Admin Credential
// @route   POST /api/admin/create-credential
// @access  Private (Super Admin or State Admin)
const createAdminCredential = async (req, res) => {
  try {
    const { username, password, role, district, assemblyName, boothNo } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ success: false, message: 'Username, password, and role are required' });
    }

    const existing = await Admin.findOne({ username: username.trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: `Admin username '${username}' already exists.` });
    }

    const newAdmin = await Admin.create({
      username: username.trim(),
      password: password.trim(),
      role,
      district: district ? district.trim() : null,
      assemblyName: assemblyName ? assemblyName.trim() : null,
      boothNo: boothNo ? String(boothNo).trim() : null,
      createdBy: `${req.admin.role} (${req.admin.username})`
    });

    return res.status(201).json({
      success: true,
      message: `Created ${role} account '${newAdmin.username}' successfully`,
      admin: {
        id: newAdmin._id,
        username: newAdmin.username,
        role: newAdmin.role,
        district: newAdmin.district,
        assemblyName: newAdmin.assemblyName,
        boothNo: newAdmin.boothNo
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get List of All Custom Admin Accounts
// @route   GET /api/admin/credentials
// @access  Private (Admin - Super / State)
const getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find().select('-password').sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: admins.length,
      admins
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get filter metadata (assemblies in scope + booths for a given assembly)
// @route   GET /api/admin/filter-meta?assemblyName=xxx
// @access  Private (Admin)
const getFilterMeta = async (req, res) => {
  try {
    const admin = req.admin;
    const { district, assemblyName } = req.query;
    const scopeQuery = getAdminScopeQuery(admin);

    if (assemblyName) {
      // Return sorted booth numbers for the given assembly
      const boothQuery = { ...scopeQuery, assemblyName: new RegExp('^' + assemblyName.trim() + '$', 'i') };
      if (district) boothQuery.district = new RegExp('^' + district.trim() + '$', 'i');
      const rawBooths = await SchemeApplication.distinct('boothNo', boothQuery);
      const booths = rawBooths.filter(Boolean).sort((a, b) => parseInt(a) - parseInt(b));
      return res.status(200).json({ success: true, booths });
    }

    if (district) {
      // Return assemblies and booths in the selected district
      const distQuery = { ...scopeQuery, district: new RegExp('^' + district.trim() + '$', 'i') };
      const [assemblies, rawBooths] = await Promise.all([
        SchemeApplication.distinct('assemblyName', distQuery),
        SchemeApplication.distinct('boothNo', distQuery)
      ]);
      assemblies.sort((a, b) => a.localeCompare(b));
      const booths = rawBooths.filter(Boolean).sort((a, b) => parseInt(a) - parseInt(b));
      return res.status(200).json({ success: true, assemblies, booths });
    }

    // Return all districts, assemblies, and booths in scope
    const [districts, assemblies, rawBooths] = await Promise.all([
      SchemeApplication.distinct('district', scopeQuery),
      SchemeApplication.distinct('assemblyName', scopeQuery),
      SchemeApplication.distinct('boothNo', scopeQuery)
    ]);
    districts.sort((a, b) => a.localeCompare(b));
    assemblies.sort((a, b) => a.localeCompare(b));
    const booths = rawBooths.filter(Boolean).sort((a, b) => parseInt(a) - parseInt(b));

    return res.status(200).json({ success: true, districts, assemblies, booths });
  } catch (err) {
    console.error('[getFilterMeta Error]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Stream CSV export of applications (server-side, fast)
// @route   GET /api/admin/export-csv
// @access  Private (Admin)
const exportApplicationsCsv = async (req, res) => {
  try {
    const { district, assemblyName, boothNo, status, schemeName, search, format } = req.query;
    const admin = req.admin;

    // ── Build scope filter (same as getApplicationsList) ──
    const appScopeFilter = {};
    if (admin.role === 'DISTRICT_ADMIN')    appScopeFilter.district     = admin.district;
    if (admin.role === 'ASSEMBLY_ADMIN')   appScopeFilter.assemblyName = admin.assemblyName;
    if (admin.role === 'BOOTH_ADMIN') { appScopeFilter.assemblyName = admin.assemblyName; appScopeFilter.boothNo = admin.boothNo; }
    if (district)     appScopeFilter.district     = district;
    if (assemblyName) appScopeFilter.assemblyName = assemblyName;
    if (boothNo)      appScopeFilter.boothNo      = boothNo;
    if (status)       appScopeFilter.status        = status;
    if (schemeName)   appScopeFilter.schemeName    = schemeName;
    if (search) {
      const re = new RegExp(search, 'i');
      appScopeFilter.$or = [{ voterName: re }, { epicNo: re }, { mobile: re }];
    }

    const scopeLabel = boothNo ? `Booth_${boothNo}` : assemblyName ? assemblyName.replace(/\s+/g, '_') : district ? district.replace(/\s+/g, '_') : 'Statewide';
    const timestamp  = new Date().toISOString().slice(0, 10);
    const filename   = `BJP_Report_${scopeLabel}_${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // UTF-8 BOM so Excel opens it correctly without encoding issues
    res.write('\uFEFF');

    // Header row
    const headers = ['S.No', 'Voter Name', 'EPIC Number', 'Mobile Number', 'District', 'Assembly Name', 'Booth No', 'Scheme Name', 'Cluster / Benefit', 'Status', 'Applied Date'];
    res.write(headers.map(h => `"${h}"`).join(',') + '\n');

    // Stream cursor — never loads all docs into memory
    const cursor = SchemeApplication.find(
      appScopeFilter,
      { voterName: 1, epicNo: 1, mobile: 1, district: 1, assemblyName: 1, boothNo: 1, schemeName: 1, clusterName: 1, status: 1, appliedAt: 1 }
    ).sort({ appliedAt: -1 }).lean().cursor();

    let idx = 0;
    const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;

    for await (const doc of cursor) {
      idx++;
      const appliedDate = doc.appliedAt ? new Date(doc.appliedAt).toLocaleDateString('en-IN') : '—';
      const row = [
        idx,
        esc(doc.voterName),
        esc(doc.epicNo),
        esc(doc.mobile),
        esc(doc.district),
        esc(doc.assemblyName),
        esc(doc.boothNo),
        esc(doc.schemeName),
        esc(doc.clusterName),
        esc(doc.status),
        esc(appliedDate)
      ];
      res.write(row.join(',') + '\n');
    }

    res.end();
  } catch (error) {
    console.error('[exportApplicationsCsv Error]:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    } else {
      res.end();
    }
  }
};

// @desc  Export styled Excel file (server-side, fast streaming)
// @route GET /api/admin/export-excel
// @access Private
const exportApplicationsExcel = async (req, res) => {
  try {
    const {
      district, assemblyName, boothNo, status, schemeId,
      startDate, endDate, search
    } = req.query;
    const user = req.admin;

    // ── Build scope filter (same as CSV export) ──
    const appScopeFilter = {};
    if (user.role === 'DISTRICT_ADMIN' && user.district)
      appScopeFilter.district = user.district;
    else if (user.role === 'ASSEMBLY_ADMIN' && user.assemblyName)
      appScopeFilter.assemblyName = user.assemblyName;
    else if (user.role === 'BOOTH_ADMIN' && user.assemblyName && user.boothNo) {
      appScopeFilter.assemblyName = user.assemblyName;
      appScopeFilter.boothNo = String(user.boothNo);
    }
    if (district)      appScopeFilter.district     = district;
    if (assemblyName) appScopeFilter.assemblyName  = assemblyName;
    if (boothNo)      appScopeFilter.boothNo       = String(boothNo);
    if (status)       appScopeFilter.status        = status;
    if (schemeId)     appScopeFilter.schemeId      = schemeId;
    if (startDate || endDate) {
      appScopeFilter.appliedAt = {};
      if (startDate) appScopeFilter.appliedAt.$gte = new Date(startDate);
      if (endDate)   appScopeFilter.appliedAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }
    if (search) {
      const re = { $regex: search, $options: 'i' };
      appScopeFilter.$or = [{ voterName: re }, { epicNo: re }, { mobile: re }];
    }

    // ── Status colour map ──
    const STATUS_COLORS = {
      Approved:   { bg: 'FF16a34a', fg: 'FFFFFFFF' },
      Completed:  { bg: 'FF15803d', fg: 'FFFFFFFF' },
      Rejected:   { bg: 'FFdc2626', fg: 'FFFFFFFF' },
      Submitted:  { bg: 'FF2563eb', fg: 'FFFFFFFF' },
      Pending:    { bg: 'FFf59e0b', fg: 'FFFFFFFF' },
      Processing: { bg: 'FF7c3aed', fg: 'FFFFFFFF' },
      Called:     { bg: 'FF0891b2', fg: 'FFFFFFFF' },
      Verified:   { bg: 'FF059669', fg: 'FFFFFFFF' },
    };

    // ── Create workbook ──
    const workbook  = new ExcelJS.Workbook();
    workbook.creator = 'BJP Nalam Thittam';
    const sheet = workbook.addWorksheet('Applications', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });

    // Column definitions with widths
    sheet.columns = [
      { header: 'S.No',         key: 'sno',      width: 6  },
      { header: 'Voter Name',   key: 'name',     width: 25 },
      { header: 'EPIC Number',  key: 'epic',     width: 16 },
      { header: 'Mobile No',    key: 'mobile',   width: 14 },
      { header: 'District',     key: 'district', width: 18 },
      { header: 'Assembly',     key: 'assembly', width: 22 },
      { header: 'Booth No',     key: 'booth',    width: 9  },
      { header: 'Scheme Name',  key: 'scheme',   width: 32 },
      { header: 'Cluster',      key: 'cluster',  width: 45 },
      { header: 'Status',       key: 'status',   width: 13 },
      { header: 'Applied Date', key: 'date',     width: 14 },
    ];

    // Style header row — saffron BJP orange
    const headerRow = sheet.getRow(1);
    headerRow.eachCell(cell => {
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6B00' } };
      cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FFCC5500' } }
      };
    });
    headerRow.height = 22;

    // Stream rows from MongoDB cursor
    const cursor = SchemeApplication.find(appScopeFilter)
      .sort({ appliedAt: -1 })
      .select('voterName epicNo mobile district assemblyName boothNo schemeName clusterName status appliedAt')
      .lean()
      .cursor();

    let idx = 0;
    for await (const doc of cursor) {
      idx++;
      const appliedDate = doc.appliedAt ? new Date(doc.appliedAt).toLocaleDateString('en-IN') : '—';
      const statusColors = STATUS_COLORS[doc.status] || { bg: 'FFe5e7eb', fg: 'FF374151' };

      const row = sheet.addRow({
        sno:      idx,
        name:     doc.voterName  || '—',
        epic:     doc.epicNo     || '—',
        mobile:   doc.mobile     || '—',
        district: doc.district   || '—',
        assembly: doc.assemblyName || '—',
        booth:    doc.boothNo    || '—',
        scheme:   doc.schemeName || '—',
        cluster:  doc.clusterName || '—',
        status:   doc.status     || '—',
        date:     appliedDate,
      });

      // Alternate row banding
      const rowBg = idx % 2 === 0 ? 'FFF9FAFB' : 'FFFFFFFF';
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.alignment = { vertical: 'middle', wrapText: false };
        if (colNum !== 10) {
          // Non-status cells — alternate banding
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        }
      });

      // Mobile as text — prevent scientific notation
      const mobileCell = row.getCell('mobile');
      mobileCell.numFmt = '@';

      // Status cell — coloured pill
      const statusCell = row.getCell('status');
      statusCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColors.bg } };
      statusCell.font  = { bold: true, color: { argb: statusColors.fg }, size: 10 };
      statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    // Send as .xlsx download
    const filename = `BJP_Applications_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('[exportApplicationsExcel Error]:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: error.message });
    else res.end();
  }
};

module.exports = {
  adminLogin,
  getAssembliesList,
  getDistrictCredentials,
  getAssemblyCredentials,
  getAssemblyBoothCredentials,
  getDashboardStats,
  getMemberReferrals,
  getApplicationsList,
  exportApplicationsCsv,
  exportApplicationsExcel,
  getFilterMeta,
  updateApplicationStatus,
  createAdminCredential,
  getAllAdmins
};
