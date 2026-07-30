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
const { protectUser } = require('../middleware/authMiddleware');

router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/check-mobile', checkMobile);
router.post('/validate-epic', validateEpic);
// PII endpoints — require a valid user token; identity is derived from the token
// (the :param is ignored) so members can only read their OWN data.
router.get('/profile/:epicNo', protectUser, getProfile);
router.post('/register-schemes', registerSchemes);
router.get('/referral-link/:ntCode', getReferralLink);
router.get('/my-members/:ntCode', protectUser, getMyMembers);
router.get('/member-status/:ntCode', protectUser, getMemberStatus);

module.exports = router;
