/**
 * API Logger Middleware
 * 
 * This middleware logs all API requests and responses with detailed information:
 * - Request method, URL, query parameters, body
 * - Response status code, response time, body
 * - User information (if authenticated)
 * - IP address, user agent
 * - Errors (if any)
 * 
 * Sensitive data (passwords, tokens, etc.) is automatically sanitized.
 * 
 * Configuration:
 * - Set ENABLE_FILE_LOGGING=true in .env to save logs to files (logs/api-YYYY-MM-DD.log)
 * - Set DEBUG=true in .env to enable debug logging
 * 
 * Logs are written to:
 * - Console (always)
 * - Files in logs/ directory (if ENABLE_FILE_LOGGING=true)
 */

const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

// Fields to sanitize in request/response (sensitive data)
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'idToken',
  'accessToken',
  'refreshToken',
  'authorization',
  'private_key',
  'apiKey',
  'secret',
  'otp',
  'code',
];

/**
 * Sanitize sensitive data from object (with circular reference protection)
 */
const sanitizeData = (data, depth = 0, seen = new WeakSet()) => {
  // Prevent infinite recursion from circular references or deeply nested objects
  if (depth > 10) {
    return '[TRUNCATED]';
  }

  if (!data || typeof data !== 'object') {
    return data;
  }

  // Detect circular references
  if (seen.has(data)) {
    return '[CIRCULAR]';
  }
  seen.add(data);

  if (Array.isArray(data)) {
    return data.slice(0, 50).map(item => sanitizeData(item, depth + 1, seen));
  }

  // Convert Sequelize model instances to plain objects
  const plain = typeof data.toJSON === 'function' ? data.toJSON() : { ...data };

  const sanitized = {};
  for (const key in plain) {
    if (!Object.prototype.hasOwnProperty.call(plain, key)) continue;

    const lowerKey = key.toLowerCase();
    
    // Check if key contains sensitive field
    if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof plain[key] === 'object' && plain[key] !== null) {
      sanitized[key] = sanitizeData(plain[key], depth + 1, seen);
    } else {
      sanitized[key] = plain[key];
    }
  }
  
  return sanitized;
};

/**
 * Format log entry
 */
const formatLogEntry = (req, res, responseTime, error = null) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl || req.url;
  const statusCode = res.statusCode;
  const ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Get user info if authenticated
  const userId = req.userId || req.accountId || req.user?.id || req.user?.accountId || null;
  const userAccountId = req.userAccountId || req.user?.accountId || null;
  const isAdmin = req.user?.role === 'admin' || req.admin?.role || false;
  
  // Sanitize request body
  const requestBody = req.body && Object.keys(req.body).length > 0 
    ? sanitizeData(req.body) 
    : null;
  
  // Sanitize query params
  const queryParams = req.query && Object.keys(req.query).length > 0 
    ? sanitizeData(req.query) 
    : null;
  
  const logEntry = {
    timestamp,
    method,
    url,
    statusCode,
    responseTime: `${responseTime}ms`,
    ip,
    userAgent,
    userId,
    userAccountId,
    isAdmin,
    queryParams,
    requestBody,
    error: error ? {
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    } : null,
  };
  
  return logEntry;
};

/**
 * Write log to file (optional)
 */
const writeToFile = (logEntry) => {
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `api-${date}.log`);
    const logLine = JSON.stringify(logEntry) + '\n';
    
    fs.appendFileSync(logFile, logLine, 'utf8');
  } catch (error) {
    // Don't fail the request if file write fails
    console.error('Failed to write log to file:', error.message);
  }
};

/**
 * API Logger Middleware
 * Logs all API requests and responses
 */
const apiLogger = (req, res, next) => {
  const startTime = Date.now();
  req.startTime = startTime; // Store for error logger
  
  // Override res.json to capture response
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    const responseTime = Date.now() - startTime;
    const logEntry = formatLogEntry(req, res, responseTime);
    
    // Add response data (sanitized)
    if (data) {
      logEntry.responseBody = sanitizeData(data);
    }
    
    // Log to console
    const logMessage = `[API] ${logEntry.method} ${logEntry.url} - ${logEntry.statusCode} - ${logEntry.responseTime} - User: ${logEntry.userAccountId || 'Anonymous'}`;
    
    if (logEntry.statusCode >= 400) {
      logger.error(logMessage);
    } else {
      logger.info(logMessage);
    }
    
    // Write to file
    if (process.env.ENABLE_FILE_LOGGING === 'true') {
      writeToFile(logEntry);
    }
    
    return originalJson(data);
  };
  
  // Handle errors
  res.on('finish', () => {
    if (!res.headersSent) {
      const responseTime = Date.now() - startTime;
      const logEntry = formatLogEntry(req, res, responseTime);
      
      const logMessage = `[API] ${logEntry.method} ${logEntry.url} - ${logEntry.statusCode} - ${logEntry.responseTime} - User: ${logEntry.userAccountId || 'Anonymous'}`;
      
      if (logEntry.statusCode >= 400) {
        logger.error(logMessage);
      } else {
        logger.info(logMessage);
      }
      
      if (process.env.ENABLE_FILE_LOGGING === 'true') {
        writeToFile(logEntry);
      }
    }
  });
  
  next();
};

/**
 * Error Logger Middleware
 * Logs errors with full context
 */
const errorLogger = (err, req, res, next) => {
  const responseTime = Date.now() - (req.startTime || Date.now());
  const logEntry = formatLogEntry(req, res, responseTime, err);
  
  // Log error details
  logger.error(`[API ERROR] ${logEntry.method} ${logEntry.url} - ${err.message}`);
  logger.error(`[API ERROR] Stack: ${err.stack}`);
  
  if (process.env.ENABLE_FILE_LOGGING === 'true') {
    writeToFile(logEntry);
  }
  
  next(err);
};

module.exports = {
  apiLogger,
  errorLogger,
  sanitizeData,
};
