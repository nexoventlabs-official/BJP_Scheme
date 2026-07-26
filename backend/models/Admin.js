const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['SUPER_ADMIN', 'STATE_ADMIN', 'DISTRICT_ADMIN', 'ASSEMBLY_ADMIN', 'BOOTH_ADMIN'],
    required: true
  },
  district: {
    type: String,
    default: null // Required for DISTRICT_ADMIN, ASSEMBLY_ADMIN, BOOTH_ADMIN
  },
  assemblyName: {
    type: String,
    default: null // Required for ASSEMBLY_ADMIN, BOOTH_ADMIN
  },
  boothNo: {
    type: String,
    default: null // Required for BOOTH_ADMIN
  },
  createdBy: {
    type: String,
    default: 'SYSTEM'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

adminSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Admin', adminSchema);
