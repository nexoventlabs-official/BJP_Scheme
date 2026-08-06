const mongoose = require('mongoose');

const boothPresidentRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  voterName: {
    type: String,
    required: true,
    trim: true
  },
  epicNo: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  mobile: {
    type: String,
    required: true,
    trim: true
  },
  gender: {
    type: String,
    default: 'Unspecified'
  },
  district: {
    type: String,
    required: true,
    trim: true
  },
  assemblyName: {
    type: String,
    required: true,
    trim: true
  },
  assemblyNo: {
    type: String,
    default: '',
    trim: true
  },
  boothNo: {
    type: String,
    required: true,
    trim: true
  },
  isCustomBooth: {
    type: Boolean,
    default: false
  },
  originalDistrict: {
    type: String,
    default: '',
    trim: true
  },
  originalAssembly: {
    type: String,
    default: '',
    trim: true
  },
  originalBoothNo: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  rejectionReason: {
    type: String,
    default: ''
  },
  appliedAt: {
    type: Date,
    default: Date.now
  },
  actionDate: {
    type: Date,
    default: null
  },
  actionBy: {
    type: String,
    default: ''
  }
});

boothPresidentRequestSchema.index({ district: 1, assemblyName: 1, boothNo: 1 });
boothPresidentRequestSchema.index({ userId: 1 });
boothPresidentRequestSchema.index({ status: 1 });

module.exports = mongoose.model('BoothPresidentRequest', boothPresidentRequestSchema);
