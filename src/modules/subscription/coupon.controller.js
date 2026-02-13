const { Op } = require('sequelize');
const Coupon = require('../../models/Coupon.model');
const CouponUsage = require('../../models/CouponUsage.model');
const SubscriptionPlan = require('../../models/SubscriptionPlan.model');
const User = require('../../models/User.model');

/**
 * POST /api/subscription/apply-coupon
 * Validate and calculate discount for a coupon + plan combination
 */
const applyCoupon = async (req, res) => {
  try {
    const { code, planId } = req.body;
    const accountId = req.accountId;

    if (!code || !planId) {
      return res.status(400).json({ success: false, message: 'Coupon code and plan ID are required' });
    }

    const user = await User.findOne({ where: { accountId } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const plan = await SubscriptionPlan.findByPk(planId);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    const coupon = await Coupon.findOne({
      where: { code: code.toUpperCase().trim(), status: 'active' },
    });

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or expired coupon code' });
    }

    // Validate coupon
    const now = new Date();
    const validation = validateCoupon(coupon, plan, user, now);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    // Check per-user usage limit
    const userUsageCount = await CouponUsage.count({
      where: { couponId: coupon.id, userId: user.id },
    });

    if (userUsageCount >= coupon.maxUsesPerUser) {
      return res.status(400).json({
        success: false,
        message: `You have already used this coupon ${coupon.maxUsesPerUser} time(s)`,
      });
    }

    // Calculate discount
    const originalAmount = parseFloat(plan.offerAmount) || parseFloat(plan.amount);
    const discount = calculateDiscount(coupon, originalAmount);
    const finalAmount = Math.max(0, originalAmount - discount);

    res.json({
      success: true,
      message: 'Coupon applied successfully',
      data: {
        couponId: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: parseFloat(coupon.discountValue),
        originalAmount,
        discountAmount: discount,
        finalAmount,
      },
    });
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Helper functions ───

function validateCoupon(coupon, plan, user, now) {
  // Date checks
  if (coupon.validFrom && now < new Date(coupon.validFrom)) {
    return { valid: false, message: 'This coupon is not yet active' };
  }
  if (coupon.validUntil && now > new Date(coupon.validUntil)) {
    return { valid: false, message: 'This coupon has expired' };
  }

  // Usage limit check
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { valid: false, message: 'This coupon has reached its usage limit' };
  }

  // Applicable plans check
  const applicablePlans = coupon.applicablePlans;
  if (applicablePlans && applicablePlans.length > 0) {
    if (!applicablePlans.includes(plan.id)) {
      return { valid: false, message: 'This coupon is not applicable for the selected plan' };
    }
  }

  // Minimum order amount
  const amount = parseFloat(plan.offerAmount) || parseFloat(plan.amount);
  if (coupon.minOrderAmount && amount < parseFloat(coupon.minOrderAmount)) {
    return {
      valid: false,
      message: `Minimum order amount for this coupon is ₹${coupon.minOrderAmount}`,
    };
  }

  return { valid: true };
}

function calculateDiscount(coupon, amount) {
  let discount = 0;

  if (coupon.discountType === 'percentage') {
    discount = (amount * parseFloat(coupon.discountValue)) / 100;
    // Apply max discount cap
    if (coupon.maxDiscount) {
      discount = Math.min(discount, parseFloat(coupon.maxDiscount));
    }
  } else {
    // fixed
    discount = parseFloat(coupon.discountValue);
  }

  // Discount can't exceed order amount
  return Math.min(discount, amount);
}

module.exports = {
  applyCoupon,
  validateCoupon,
  calculateDiscount,
};
