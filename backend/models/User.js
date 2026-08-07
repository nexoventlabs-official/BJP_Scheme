const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  mobile: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  epicNo: {
    // NOT unique — multiple members can share the same voter ID (EPIC).
    // The mobile number is the unique per-user identifier.
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  voterName: {
    type: String,
    required: true,
    trim: true
  },
  district: {
    type: String,
    required: true,
    trim: true
  },
  assemblyNo: {
    type: String,
    default: ''
  },
  assemblyName: {
    type: String,
    required: true,
    trim: true
  },
  boothNo: {
    type: String,
    required: true,
    trim: true
  },
  gender: {
    type: String,
    default: 'Unspecified'
  },
  referralCode: {
    type: String,
    unique: true,
    required: true
  },
  referredBy: {
    type: String, // referral code of inviter
    default: null
  },
  tokenVersion: {
    type: Number,
    default: 1
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.index({ district: 1, assemblyName: 1, boothNo: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ epicNo: 1 }); // non-unique lookup index (EPIC can repeat)

module.exports = mongoose.model('User', userSchema);
