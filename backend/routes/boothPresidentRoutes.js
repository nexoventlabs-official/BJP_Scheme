const express = require('express');
const router = express.Router();
const {
  applyBoothPresident,
  getMyBoothPresidentStatus,
  getPublicJurisdictions,
  getAdminBoothPresidentRequests,
  handleBoothPresidentAction
} = require('../controllers/boothPresidentController');
const { protectUser, protectAdmin } = require('../middleware/authMiddleware');

// User / Member endpoints
router.post('/apply', protectUser, applyBoothPresident);
router.get('/my-status', protectUser, getMyBoothPresidentStatus);
router.get('/jurisdictions', getPublicJurisdictions);

// Admin endpoints
router.get('/admin/booth-president-requests', protectAdmin, getAdminBoothPresidentRequests);
router.post('/admin/booth-president-requests/:id/action', protectAdmin, handleBoothPresidentAction);

module.exports = router;
