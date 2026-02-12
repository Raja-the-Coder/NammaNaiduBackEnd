const express = require('express');
const { body, query } = require('express-validator');
const { authenticate } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validation.middleware');
const {
    getSubscriptionStatus,
    createRazorpayOrder,
    verifyRazorpayPayment,
    handlePaymentFailed,
    getUserTransactions,
} = require('./subscription.controller');

const router = express.Router();

// All routes here require authentication
router.use(authenticate);

// GET /api/subscription/status - Get current user's subscription status
router.get('/status', getSubscriptionStatus);

// POST /api/subscription/create-order - Create Razorpay order for a plan
router.post(
    '/create-order',
    [
        body('planId').isInt().withMessage('Plan ID must be an integer'),
        validate,
    ],
    createRazorpayOrder
);

// POST /api/subscription/verify-payment - Verify payment and activate subscription
router.post(
    '/verify-payment',
    [
        body('razorpay_order_id').trim().notEmpty().withMessage('Razorpay order ID is required'),
        body('razorpay_payment_id').trim().notEmpty().withMessage('Razorpay payment ID is required'),
        body('razorpay_signature').trim().notEmpty().withMessage('Razorpay signature is required'),
        validate,
    ],
    verifyRazorpayPayment
);

// POST /api/subscription/payment-failed - Record payment failure
router.post(
    '/payment-failed',
    [
        body('razorpay_order_id').trim().notEmpty().withMessage('Razorpay order ID is required'),
        validate,
    ],
    handlePaymentFailed
);

// GET /api/subscription/transactions - Get user's payment history
router.get(
    '/transactions',
    [
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        validate,
    ],
    getUserTransactions
);

module.exports = router;
