const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_EXPIRY = process.env.JWT_ACCESS_EXPIRE || '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = Number(process.env.JWT_REFRESH_EXPIRE_DAYS || 7);

/**
 * Generate a short-lived access token (default: 15 minutes)
 */
const generateToken = (accountId) => {
  return jwt.sign({ accountId }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
};

/**
 * Verify an access token
 */
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * Get refresh token expiry date from now
 */
const getRefreshTokenExpiry = () => {
  return new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
};

module.exports = {
  generateToken,
  verifyToken,
  getRefreshTokenExpiry,
  REFRESH_TOKEN_EXPIRY_DAYS,
};
