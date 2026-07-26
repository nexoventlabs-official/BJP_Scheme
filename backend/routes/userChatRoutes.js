const express = require('express');
const router = express.Router();
const {
  sendOtp,
  verifyOtp,
  checkMobile,
  validateEpic,
  getProfile,
  registerSchemes,
  getReferralLink,
  getMyMembers,
  getMemberStatus
} = require('../controllers/userChatController');

router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/check-mobile', checkMobile);
router.post('/validate-epic', validateEpic);
router.get('/profile/:epicNo', getProfile);
router.post('/register-schemes', registerSchemes);
router.get('/referral-link/:ntCode', getReferralLink);
router.get('/my-members/:ntCode', getMyMembers);
router.get('/member-status/:ntCode', getMemberStatus);

module.exports = router;
