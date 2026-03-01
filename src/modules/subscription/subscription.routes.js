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
    createPayUOrder,
    verifyPayUPayment,
    generatePayUMobileHash,
    handlePayUFailed,
} = require('./subscription.controller');
const { applyCoupon } = require('./coupon.controller');
const { getReferralInfo, applyReferralCode } = require('./referral.controller');

const router = express.Router();

// All routes here require authentication
router.use(authenticate);

// ── Subscription Status ──
router.get('/status', getSubscriptionStatus);

// ── Razorpay Payment Flow ──
router.post(
    '/create-order',
    [
        body('planId').isInt().withMessage('Plan ID must be an integer'),
        body('couponCode').optional().trim(),
        validate,
    ],
    createRazorpayOrder
);

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

router.post(
    '/payment-failed',
    [
        body('razorpay_order_id').trim().notEmpty().withMessage('Razorpay order ID is required'),
        validate,
    ],
    handlePaymentFailed
);

// ── Transaction History ──
router.get(
    '/transactions',
    [
        query('page').optional().isInt({ min: 1 }),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        validate,
    ],
    getUserTransactions
);

// ── PayU Payment Flow ──
router.post(
    '/payu/create-order',
    [
        body('planId').isInt().withMessage('Plan ID must be an integer'),
        body('couponCode').optional().trim(),
        validate,
    ],
    createPayUOrder
);

router.post(
    '/payu/verify-payment',
    [
        body('txnid').trim().notEmpty().withMessage('txnid is required'),
        body('mihpayid').trim().notEmpty().withMessage('mihpayid is required'),
        body('status').trim().notEmpty().withMessage('status is required'),
        body('hash').trim().notEmpty().withMessage('hash is required'),
        validate,
    ],
    verifyPayUPayment
);

router.post(
    '/payu/generate-hash',
    [
        body('hashName').trim().notEmpty().withMessage('hashName is required'),
        body('hashString').trim().notEmpty().withMessage('hashString is required'),
        validate,
    ],
    generatePayUMobileHash
);

router.post(
    '/payu/payment-failed',
    [
        body('txnid').trim().notEmpty().withMessage('txnid is required'),
        validate,
    ],
    handlePayUFailed
);

// ── Coupons ──
router.post(
    '/apply-coupon',
    [
        body('code').trim().notEmpty().withMessage('Coupon code is required'),
        body('planId').isInt().withMessage('Plan ID is required'),
        validate,
    ],
    applyCoupon
);

// ── Referrals ──
router.get('/referral', getReferralInfo);

router.post(
    '/referral/apply',
    [
        body('referralCode').trim().notEmpty().withMessage('Referral code is required'),
        validate,
    ],
    applyReferralCode
);

module.exports = router;
