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

// Admin endpoints (mounted at /api/admin in server.js → /api/admin/booth-president-requests)
router.get('/booth-president-requests', protectAdmin, getAdminBoothPresidentRequests);
router.post('/booth-president-requests/:id/action', protectAdmin, handleBoothPresidentAction);

module.exports = router;
