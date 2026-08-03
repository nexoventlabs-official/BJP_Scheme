const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['Pending', 'Submitted', 'Processing', 'Completed', 'In Progress', 'Called', 'Verified', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  remarks: {
    type: String,
    default: ''
  },
  updatedBy: {
    type: String, // admin username or role
    default: 'System'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const schemeApplicationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  epicNo: {
    type: String,
    required: true
  },
  voterName: {
    type: String,
    required: true
  },
  mobile: {
    type: String,
    required: true
  },
  district: {
    type: String,
    required: true
  },
  assemblyName: {
    type: String,
    required: true
  },
  assemblyNo: {
    type: String,
    default: ''
  },
  boothNo: {
    type: String,
    required: true
  },
  schemeId: {
    type: Number,
    default: 1
  },
  schemeName: {
    type: String,
    required: true
  },
  clusterName: {
    type: String,
    default: 'BJP Nalam Thittam Welfare'
  },
  benefit: {
    type: String,
    default: 'BJP Central Scheme Welfare Benefit'
  },
  status: {
    type: String,
    enum: ['Pending', 'Submitted', 'Processing', 'Completed', 'In Progress', 'Called', 'Verified', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  adminRemarks: {
    type: String,
    default: 'Application submitted and pending verification.'
  },
  lastCalledAt: {
    type: Date,
    default: null
  },
  statusHistory: [statusHistorySchema],
  appliedAt: {
    type: Date,
    default: Date.now
  }
});

schemeApplicationSchema.index({ district: 1, assemblyName: 1, boothNo: 1, status: 1 });
schemeApplicationSchema.index({ userId: 1, schemeId: 1 });
schemeApplicationSchema.index({ epicNo: 1, schemeId: 1 });
schemeApplicationSchema.index({ epicNo: 1 });
schemeApplicationSchema.index({ appliedAt: -1 });

module.exports = mongoose.model('SchemeApplication', schemeApplicationSchema);
