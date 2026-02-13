const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../../middleware/validation.middleware');
const { authenticateAdmin } = require('../../middleware/adminAuth.middleware');
const {
  getCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getCouponUsage,
} = require('./coupon.controller');

const router = express.Router();
router.use(authenticateAdmin);

// GET /api/admin/coupons
router.get(
  '/coupons',
  [
    query('status').optional().isIn(['active', 'inactive', 'expired']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validate,
  ],
  getCoupons
);

// GET /api/admin/coupons/:id
router.get('/coupons/:id', getCouponById);

// POST /api/admin/coupons
router.post(
  '/coupons',
  [
    body('code').trim().notEmpty().withMessage('Coupon code is required'),
    body('discountType').isIn(['percentage', 'fixed']).withMessage('Must be percentage or fixed'),
    body('discountValue').isFloat({ min: 0 }).withMessage('Discount value must be >= 0'),
    body('maxDiscount').optional().isFloat({ min: 0 }),
    body('minOrderAmount').optional().isFloat({ min: 0 }),
    body('maxUses').optional().isInt({ min: 1 }),
    body('maxUsesPerUser').optional().isInt({ min: 1 }),
    body('validFrom').optional().isISO8601(),
    body('validUntil').optional().isISO8601(),
    body('status').optional().isIn(['active', 'inactive']),
    validate,
  ],
  createCoupon
);

// PUT /api/admin/coupons/:id
router.put(
  '/coupons/:id',
  [
    param('id').isInt(),
    body('discountType').optional().isIn(['percentage', 'fixed']),
    body('discountValue').optional().isFloat({ min: 0 }),
    body('status').optional().isIn(['active', 'inactive', 'expired']),
    validate,
  ],
  updateCoupon
);

// DELETE /api/admin/coupons/:id
router.delete('/coupons/:id', deleteCoupon);

// GET /api/admin/coupons/:id/usage
router.get('/coupons/:id/usage', getCouponUsage);

module.exports = router;
