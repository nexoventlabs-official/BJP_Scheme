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

    const districtStats = await SchemeApplication.aggregate([
      { $match: scopeQuery },
      {
        $group: {
          _id: '$district',
          totalApps: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $in: ['$status', ['Submitted', 'Pending', 'In Progress', 'Called']] }, 1, 0] } }
        }
      },
      { $sort: { totalApps: -1 } }
    ]);

    const assemblyStats = await SchemeApplication.aggregate([
      { $match: scopeQuery },
      {
        $group: {
          _id: { district: '$district', assemblyName: '$assemblyName' },
          totalApps: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $in: ['$status', ['Submitted', 'Pending', 'In Progress', 'Called']] }, 1, 0] } }
        }
      },
      { $sort: { totalApps: -1 } },
      { $limit: 50 }
    ]);

    const boothStats = await SchemeApplication.aggregate([
      { $match: scopeQuery },
      {
        $group: {
          _id: { district: '$district', assemblyName: '$assemblyName', boothNo: '$boothNo' },
          totalApps: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $in: ['$status', ['Submitted', 'Pending', 'In Progress', 'Called']] }, 1, 0] } }
        }
      },
      { $sort: { totalApps: -1 } },
      { $limit: 100 }
    ]);

    const schemePopularity = await SchemeApplication.aggregate([
      { $match: scopeQuery },
      { $group: { _id: '$schemeName', count: { $sum: 1 }, cluster: { $first: '$clusterName' } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

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
    ]);

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

    // ── Step 1: Build User scope filter (uses indexed fields: district, assemblyName, boothNo) ──
    const adminScope = getAdminScopeQuery(admin); // e.g. { district: 'ARIYALUR' }
    let userFilter = {};

    // Map the scope from apps to users (same field names)
    if (adminScope.district)     userFilter.district     = adminScope.district;
    if (adminScope.assemblyName) userFilter.assemblyName = adminScope.assemblyName;
    if (adminScope.boothNo)      userFilter.boothNo      = adminScope.boothNo;

    // Additional filters from query params
    if (district)     userFilter.district     = new RegExp('^' + district + '$', 'i');
    if (assemblyName) userFilter.assemblyName = new RegExp('^' + assemblyName + '$', 'i');
    if (boothNo)      userFilter.boothNo      = String(boothNo);

    if (search) {
      const r = new RegExp(search.trim(), 'i');
      userFilter.$or = [{ voterName: r }, { epicNo: r }, { mobile: r }];
    }

    // ── Step 1b: If status or schemeName filter is active, filter distinct epicNos ──
    if (status || schemeName) {
      const appScopeFilter = { ...adminScope };
      if (status) appScopeFilter.status = status;
      if (schemeName) appScopeFilter.schemeName = new RegExp(schemeName.trim(), 'i');
      if (district)     appScopeFilter.district     = new RegExp('^' + district + '$', 'i');
      if (assemblyName) appScopeFilter.assemblyName = new RegExp('^' + assemblyName + '$', 'i');
      if (boothNo)      appScopeFilter.boothNo      = String(boothNo);
      
      const epicNosWithFilter = await SchemeApplication.distinct('epicNo', appScopeFilter);
      if (epicNosWithFilter.length === 0) {
        return res.status(200).json({ success: true, voters: [], totalVoters: 0, totalPages: 0, currentPage: pageNum, limit: limitNum, applications: [] });
      }
      userFilter.epicNo = { $in: epicNosWithFilter };
    }

    // ── Step 2: Count total users matching filter ──
    const totalVoters = await User.countDocuments(userFilter);
    const totalPages  = Math.ceil(totalVoters / limitNum);

    // ── Step 3: Paginate users ──
    const users = await User.find(userFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('epicNo voterName mobile district assemblyName boothNo referralCode _id');

    if (users.length === 0) {
      return res.status(200).json({ success: true, voters: [], totalVoters, totalPages, currentPage: pageNum, limit: limitNum, applications: [] });
    }

    // ── Step 4: Fetch all applications for these users in ONE query ──
    const userIds = users.map(u => u._id);
    const epicNos = users.map(u => u.epicNo).filter(Boolean);
    const mobiles = users.map(u => u.mobile).filter(Boolean);

    const appFilter = {
      $or: [
        { userId: { $in: userIds } },
        { epicNo: { $in: epicNos } },
        { mobile: { $in: mobiles } }
      ],
      ...adminScope
    };
    if (status) appFilter.status = status;
    if (schemeName) appFilter.schemeName = new RegExp(schemeName.trim(), 'i');
    const allApps = await SchemeApplication.find(appFilter).sort({ appliedAt: -1 }).lean();

    const voters = users.map(u => {
      const userApps = allApps.filter(app => 
        (app.userId && String(app.userId) === String(u._id)) ||
        (app.epicNo && u.epicNo && app.epicNo === u.epicNo) ||
        (app.mobile && u.mobile && app.mobile === u.mobile)
      );
      return {
        epicNo:       u.epicNo,
        voterName:    u.voterName,
        mobile:       u.mobile,
        district:     u.district,
        assemblyName: u.assemblyName,
        boothNo:      u.boothNo,
        userId:       u._id,
        applications: userApps
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
      // Return assemblies in the selected district
      const assQuery = { ...scopeQuery, district: new RegExp('^' + district.trim() + '$', 'i') };
      const assemblies = await SchemeApplication.distinct('assemblyName', assQuery);
      assemblies.sort((a, b) => a.localeCompare(b));
      return res.status(200).json({ success: true, assemblies });
    }

    // Return all districts and assemblies in scope
    const districts = await SchemeApplication.distinct('district', scopeQuery);
    districts.sort((a, b) => a.localeCompare(b));
    const assemblies = await SchemeApplication.distinct('assemblyName', scopeQuery);
    assemblies.sort((a, b) => a.localeCompare(b));

    return res.status(200).json({ success: true, districts, assemblies });
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
