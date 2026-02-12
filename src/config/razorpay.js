const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Create a Razorpay order
 * @param {number} amount - Amount in INR (will be converted to paise)
 * @param {string} receipt - Unique receipt ID
 * @param {object} notes - Optional notes
 * @returns {Promise<object>} Razorpay order object
 */
const createOrder = async (amount, receipt, notes = {}) => {
  const options = {
    amount: Math.round(amount * 100), // Convert INR to paise
    currency: 'INR',
    receipt,
    notes,
  };

  const order = await razorpayInstance.orders.create(options);
  return order;
};

/**
 * Verify Razorpay payment signature
 * @param {string} orderId - Razorpay order ID
 * @param {string} paymentId - Razorpay payment ID
 * @param {string} signature - Razorpay signature
 * @returns {boolean} Whether the signature is valid
 */
const verifyPaymentSignature = (orderId, paymentId, signature) => {
  const body = orderId + '|' + paymentId;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest('hex');

  return expectedSignature === signature;
};

/**
 * Fetch payment details from Razorpay
 * @param {string} paymentId - Razorpay payment ID
 * @returns {Promise<object>} Payment details
 */
const fetchPayment = async (paymentId) => {
  return await razorpayInstance.payments.fetch(paymentId);
};

/**
 * Fetch order details from Razorpay
 * @param {string} orderId - Razorpay order ID
 * @returns {Promise<object>} Order details
 */
const fetchOrder = async (orderId) => {
  return await razorpayInstance.orders.fetch(orderId);
};

/**
 * Issue a refund for a payment
 * @param {string} paymentId - Razorpay payment ID
 * @param {number} amount - Amount to refund in paise (optional, full refund if not provided)
 * @returns {Promise<object>} Refund details
 */
const createRefund = async (paymentId, amount = null) => {
  const options = {};
  if (amount) {
    options.amount = amount;
  }
  return await razorpayInstance.payments.refund(paymentId, options);
};

module.exports = {
  razorpayInstance,
  createOrder,
  verifyPaymentSignature,
  fetchPayment,
  fetchOrder,
  createRefund,
};
