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

    const statusCounts = await SchemeApplication.aggregate([
      { $match: scopeQuery },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ], { allowDiskUse: true });

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

    const rawDistrictStats = await SchemeApplication.aggregate([
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
    ], { allowDiskUse: true });

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

    const rawAssemblyStats = await SchemeApplication.aggregate([
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
    ], { allowDiskUse: true });

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

    const rawBoothStats = await SchemeApplication.aggregate([
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
    ], { allowDiskUse: true });

    const assembliesMeta = await getAssemblyMetadata();
    const voterDb = await getVoterDbClient();

    const boothByCol = {};
    rawBoothStats.forEach(b => {
      if (b._id.assemblyName && b._id.boothNo) {
        const match = assembliesMeta.find(a => a.assemblyName.toLowerCase() === b._id.assemblyName.toLowerCase());
        if (match) {
          if (!boothByCol[match.colName]) boothByCol[match.colName] = new Set();
          boothByCol[match.colName].add(String(b._id.boothNo));
        }
      }
    });

    const boothRollCountMap = {};
    await Promise.all(
      Object.entries(boothByCol).map(async ([colName, boothSet]) => {
        try {
          const boothNos = Array.from(boothSet);
          const counts = await voterDb.collection(colName).aggregate([
            { $match: { PART_NO: { $in: boothNos } } },
            { $group: { _id: '$PART_NO', count: { $sum: 1 } } }
          ], { allowDiskUse: true }).toArray();

          counts.forEach(c => {
            boothRollCountMap[`${colName}_${c._id}`] = c.count;
          });
        } catch (e) {
          console.error('[Batch Booth Count Error]:', e.message);
        }
      })
    );

    const boothStats = rawBoothStats.map(b => {
      let rollCount = null;
      if (b._id.assemblyName && b._id.boothNo) {
        const match = assembliesMeta.find(a => a.assemblyName.toLowerCase() === b._id.assemblyName.toLowerCase());
        if (match) {
          rollCount = boothRollCountMap[`${match.colName}_${b._id.boothNo}`] || null;
        }
      }
      return {
        _id: b._id,
        totalVoters: rollCount,
        appliedVoters: b.appliedVoters || 0,
        totalApps: b.totalApps,
        approved: b.approved,
        pending: b.pending
      };
    });

    const rawPopularity = await SchemeApplication.aggregate([
      { $match: scopeQuery },
      { $group: { _id: '$schemeName', count: { $sum: 1 }, cluster: { $first: '$clusterName' } } },
      { $sort: { count: -1 } }
    ], { allowDiskUse: true });

    const schemeMap = {
      '1': { name: 'PMSBY', cluster: 'Cluster 1 — Insurance Trinity (Daily Wage Workers)' },
      '2': { name: 'PMJJBY', cluster: 'Cluster 1 — Insurance Trinity (Daily Wage Workers)' },
      '3': { name: 'APY', cluster: 'Cluster 1 — Insurance Trinity (Daily Wage Workers)' },
      '4': { name: 'PM SVANidhi', cluster: 'Cluster 2 — Credit (Street Vendors & Small Business)' },
      '5': { name: 'PM Mudra Shishu', cluster: 'Cluster 2 — Credit (Street Vendors & Small Business)' },
      '6': { name: 'PM Mudra Kishor', cluster: 'Cluster 2 — Credit (Street Vendors & Small Business)' },
      '7': { name: 'Udyam', cluster: 'Cluster 2 — Credit (Street Vendors & Small Business)' },
      '8': { name: 'Stand Up India', cluster: 'Cluster 2 — Credit (Street Vendors & Small Business)' },
      '9': { name: 'Startup Seed Fund', cluster: 'Cluster 2 — Credit (Street Vendors & Small Business)' },
      '10': { name: 'PM Kisan', cluster: 'Cluster 3 — Farmers (Kisan)' },
      '11': { name: 'PM Fasal Bima', cluster: 'Cluster 3 — Farmers (Kisan)' },
      '12': { name: 'PM Kisan Maan Dhan', cluster: 'Cluster 3 — Farmers (Kisan)' },
      '13': { name: 'PM Ujjwala', cluster: 'Cluster 4 — Women & Families' },
      '14': { name: 'PM Matru Vandana', cluster: 'Cluster 4 — Women & Families' },
      '15': { name: 'Sukanya Samridhi', cluster: 'Cluster 4 — Women & Families' },
      '16': { name: 'PMKVY', cluster: 'Cluster 5 — Youth & Skills (Future)' },
      '17': { name: 'NSP Scholarship', cluster: 'Cluster 5 — Youth & Skills (Future)' },
      '18': { name: 'PM Vishwakarma', cluster: 'Cluster 5 — Youth & Skills (Future)' },
      '19': { name: 'Jan Dhan', cluster: 'Foundation Layer (Prerequisite for all DBT)' },
      '20': { name: 'e-Shram', cluster: 'Foundation Layer (Prerequisite for all DBT)' }
    };

    const popularityObj = {};
    rawPopularity.forEach(item => {
      const key = String(item._id).trim();
      const mapped = schemeMap[key];
      const displayName = mapped ? mapped.name : key;
      const clusterName = mapped ? mapped.cluster : (item.cluster || 'BJP Nalam Thittam Welfare');

      if (!popularityObj[displayName]) {
        popularityObj[displayName] = { _id: displayName, count: 0, cluster: clusterName };
      }
      popularityObj[displayName].count += item.count;
    });

    const schemePopularity = Object.values(popularityObj).sort((a, b) => b.count - a.count);

    // Fast & Scalable Top 5 Referrers in Admin Scope using MongoDB Aggregation
    const topReferrersRaw = await User.aggregate([
      {
        $match: {
          ...scopeQuery,
          referredBy: { $nin: [null, '', 'null', 'undefined'] }
        }
      },
      { $group: { _id: '$referredBy', referralCount: { $sum: 1 } } },
      { $sort: { referralCount: -1 } },
      { $limit: 5 }
    ], { allowDiskUse: true });

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
// @access  Private (Admin)
const getApplicationsList = async (req, res) => {
  try {
    const admin = req.admin;
    const { search, status, schemeName, district, assemblyName, boothNo, page = 1, limit = 20, exportAll } = req.query;
    const isExport = exportAll === 'true';
    const pageNum  = Math.max(1, parseInt(page)  || 1);
    const limitNum = isExport ? 5000 : Math.min(500, Math.max(1, parseInt(limit) || 20));
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

    // Aggregate distinct applicants from SchemeApplication matching filter
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
      },
      { $sort: { latestAppliedAt: -1 } }
    ], { allowDiskUse: true });

    const totalVoters = applicantAgg.length;
    const totalPages  = Math.ceil(totalVoters / limitNum) || 1;
    const paginatedApplicants = applicantAgg.slice(skip, skip + limitNum);

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
    }).sort({ appliedAt: -1 }).lean();

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

module.exports = {
  adminLogin,
  getAssembliesList,
  getDistrictCredentials,
  getAssemblyCredentials,
  getAssemblyBoothCredentials,
  getDashboardStats,
  getMemberReferrals,
  getApplicationsList,
  getFilterMeta,
  updateApplicationStatus,
  createAdminCredential,
  getAllAdmins
};
