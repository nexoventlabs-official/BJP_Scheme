const express = require('express');
const router = express.Router();
const { sendOtp, verifyOtp, getMe } = require('../controllers/authController');
const { protectUser } = require('../middleware/authMiddleware');

router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.get('/me', protectUser, getMe);

module.exports = router;
