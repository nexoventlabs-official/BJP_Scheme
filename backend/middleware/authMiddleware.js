const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');

// Verify User JWT Token
const protectUser = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-__v');
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'User token invalid or user not found' });
      }
      return next();
    } catch (error) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
    }
  }
  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
  }
};

// Verify Admin JWT Token (Supports DB Admins and Dynamic Booth/Assembly Admins)
const protectAdmin = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded.isAdmin) {
        return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
      }

      if (String(decoded.id).startsWith('DYNAMIC_')) {
        req.admin = {
          _id: decoded.id,
          username: decoded.username,
          role: decoded.role,
          district: decoded.district,
          assemblyName: decoded.assemblyName,
          boothNo: decoded.boothNo
        };
      } else {
        req.admin = await Admin.findById(decoded.id).select('-password');
      }

      if (!req.admin) {
        return res.status(401).json({ success: false, message: 'Admin session expired or admin deleted' });
      }
      return next();
    } catch (error) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Invalid admin token' });
    }
  }
  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Admin token required' });
  }
};

// Enforce specific admin roles
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Admin role '${req.admin?.role || 'Unknown'}' is not allowed to access credentials`
      });
    }
    next();
  };
};

module.exports = {
  protectUser,
  protectAdmin,
  authorizeRoles
};
