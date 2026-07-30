const mongoose = require('mongoose');

const otpSessionSchema = new mongoose.Schema({
  mobile: {
    type: String,
    required: true,
    index: true
  },
  otp: {
    type: String,
    required: true
  },
  sessionId: {
    type: String,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true,
    // TTL index: Mongo removes the doc ~300s after `expiresAt` as a cleanup
    // safety net. Actual OTP validity is enforced authoritatively in
    // verifyOtp via an explicit `expiresAt` comparison (see userChatController).
    expires: 300
  },
  verified: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('OtpSession', otpSessionSchema);
