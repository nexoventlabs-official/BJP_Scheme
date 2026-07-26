const express = require('express');
const router = express.Router();
const { applySchemes, getUserRequests, getSchemeList } = require('../controllers/schemeController');
const { protectUser } = require('../middleware/authMiddleware');

router.get('/list', getSchemeList);
router.post('/apply', protectUser, applySchemes);
router.get('/my-requests', protectUser, getUserRequests);

module.exports = router;
