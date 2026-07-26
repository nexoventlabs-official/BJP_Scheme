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
    expires: 300 // TTL index: auto delete document after 5 minutes
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
