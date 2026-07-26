const express = require('express');
const router = express.Router();
const { getReferralStats } = require('../controllers/referralController');
const { protectUser } = require('../middleware/authMiddleware');

router.get('/my-referrals', protectUser, getReferralStats);

module.exports = router;
