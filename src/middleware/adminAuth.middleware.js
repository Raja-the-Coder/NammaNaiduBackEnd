const { verifyToken } = require('../config/jwt');

const authenticateAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      console.error('[authenticateAdmin] No token provided');
      return res.status(401).json({ 
        success: false,
        message: 'No token, authorization denied' 
      });
    }

    const decoded = verifyToken(token);
    console.log('[authenticateAdmin] Token decoded:', { accountId: decoded.accountId });
    
    // Check if this is an admin token (admin.id is stored as accountId in token)
    const Admin = require('../models/Admin.model');
    const admin = await Admin.findByPk(decoded.accountId);
    
    if (!admin) {
      console.error('[authenticateAdmin] Admin not found for accountId:', decoded.accountId);
      return res.status(401).json({ 
        success: false,
        message: 'Admin not found' 
      });
    }

    // Check if admin is active
    if (admin.status !== 'active') {
      console.error('[authenticateAdmin] Admin account is inactive:', decoded.accountId);
      return res.status(403).json({ 
        success: false,
        message: 'Admin account is inactive' 
      });
    }

    req.adminId = admin.id;
    req.adminRole = admin.role;
    req.isAdmin = true;
    console.log('[authenticateAdmin] Authentication successful:', { adminId: admin.id, role: admin.role });
    next();
  } catch (error) {
    console.error('[authenticateAdmin] Error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    res.status(401).json({ 
      success: false,
      message: error.message || 'Token is not valid' 
    });
  }
};

module.exports = { authenticateAdmin };

