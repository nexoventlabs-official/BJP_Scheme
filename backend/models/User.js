const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  mobile: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  epicNo: {
    type: String,
    required: true,
    unique: true,
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
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);
