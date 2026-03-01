// PayU Payment Gateway Configuration
// Docs: https://devguide.payu.in/
// Mobile SDK: https://devguide.payu.in/mobile-sdk/flutter-sdk/

const crypto = require('crypto');

// PayU Endpoints
const PAYU_TEST_URL = 'https://test.payu.in/_payment';
const PAYU_PROD_URL = 'https://secure.payu.in/_payment';

/**
 * Get PayU config from environment variables
 */
const getPayUConfig = () => ({
  key: process.env.PAYU_KEY,
  salt: process.env.PAYU_SALT,
  paymentUrl:
    process.env.NODE_ENV === 'production' ? PAYU_PROD_URL : PAYU_TEST_URL,
});

/**
 * Check if PayU is configured
 */
const isPayUConfigured = () => {
  const { key, salt } = getPayUConfig();
  return !!(key && salt);
};

/**
 * Generate PayU payment hash (for initiating payment)
 * Formula: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
 *
 * @param {object} params - Payment parameters
 * @returns {string} SHA512 hash
 */
const generatePayUHash = ({
  key,
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = '',
  salt,
}) => {
  const hashString = [
    key,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
    '',
    '',
    '',
    '',
    '',
    salt,
  ].join('|');

  return crypto.createHash('sha512').update(hashString).digest('hex');
};

/**
 * Verify PayU payment response hash (reverse hash verification)
 * Formula: sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 *
 * @param {object} params - Response parameters from PayU
 * @returns {boolean} Whether hash is valid
 */
const verifyPayUHash = ({
  salt,
  status,
  udf5 = '',
  udf4 = '',
  udf3 = '',
  udf2 = '',
  udf1 = '',
  email,
  firstname,
  productinfo,
  amount,
  txnid,
  key,
  receivedHash,
}) => {
  const hashString = [
    salt,
    status,
    '',
    '',
    '',
    '',
    '',
    udf5,
    udf4,
    udf3,
    udf2,
    udf1,
    email,
    firstname,
    productinfo,
    amount,
    txnid,
    key,
  ].join('|');

  const calculatedHash = crypto
    .createHash('sha512')
    .update(hashString)
    .digest('hex');

  return calculatedHash === receivedHash;
};

/**
 * Generate hash for PayU mobile SDK's generateHash callback
 * Used for additional payment methods (net banking, saved cards, etc.)
 * Formula: sha512(hashString|SALT)
 *
 * @param {string} hashString - Hash string sent by PayU SDK
 * @param {string} salt - PayU Salt
 * @returns {string} SHA512 hash
 */
const generateMobileSDKHash = (hashString, salt) => {
  return crypto
    .createHash('sha512')
    .update(`${hashString}|${salt}`)
    .digest('hex');
};

module.exports = {
  getPayUConfig,
  isPayUConfigured,
  generatePayUHash,
  verifyPayUHash,
  generateMobileSDKHash,
};
