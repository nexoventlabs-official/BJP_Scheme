const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/adminController');
const { protectAdmin, authorizeRoles } = require('../middleware/authMiddleware');

router.post('/login', adminLogin);
router.get('/jurisdiction-assemblies', protectAdmin, getAssembliesList);

// Restrict all credentials endpoints STRICTLY to SUPER_ADMIN only
router.get('/jurisdiction-district-credentials', protectAdmin, authorizeRoles('SUPER_ADMIN'), getDistrictCredentials);
router.get('/jurisdiction-assembly-credentials', protectAdmin, authorizeRoles('SUPER_ADMIN'), getAssemblyCredentials);
router.get('/assembly-booth-credentials', protectAdmin, authorizeRoles('SUPER_ADMIN'), getAssemblyBoothCredentials);

router.get('/dashboard-stats', protectAdmin, getDashboardStats);
router.get('/filter-meta', protectAdmin, getFilterMeta);
router.get('/member-referrals', protectAdmin, getMemberReferrals);
router.get('/applications', protectAdmin, getApplicationsList);
router.get('/export-csv', protectAdmin, exportApplicationsCsv);
router.get('/export-excel', protectAdmin, exportApplicationsExcel);
router.put('/applications/:id/status', protectAdmin, updateApplicationStatus);
router.post('/create-credential', protectAdmin, authorizeRoles('SUPER_ADMIN'), createAdminCredential);
router.get('/credentials', protectAdmin, authorizeRoles('SUPER_ADMIN'), getAllAdmins);

module.exports = router;
