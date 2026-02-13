const { Op } = require('sequelize');
const Coupon = require('../../models/Coupon.model');
const CouponUsage = require('../../models/CouponUsage.model');

// GET /api/admin/coupons
const getCoupons = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const where = {};
    if (status) where.status = status;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const coupons = await Coupon.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    res.json({
      success: true,
      data: coupons.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(coupons.count / parseInt(limit)),
        totalItems: coupons.count,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/admin/coupons/:id
const getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findByPk(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });

    // Get usage stats
    const usageCount = await CouponUsage.count({ where: { couponId: coupon.id } });

    res.json({
      success: true,
      data: { ...coupon.toJSON(), usageCount },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/admin/coupons
const createCoupon = async (req, res) => {
  try {
    const {
      code, description, discountType, discountValue,
      maxDiscount, minOrderAmount, maxUses, maxUsesPerUser,
      applicablePlans, validFrom, validUntil, status,
    } = req.body;

    // Normalize code to uppercase
    const normalizedCode = code.toUpperCase().trim();

    // Check for duplicate
    const existing = await Coupon.findOne({ where: { code: normalizedCode } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }

    const coupon = await Coupon.create({
      code: normalizedCode,
      description,
      discountType: discountType || 'percentage',
      discountValue,
      maxDiscount: maxDiscount || null,
      minOrderAmount: minOrderAmount || 0,
      maxUses: maxUses || null,
      maxUsesPerUser: maxUsesPerUser || 1,
      applicablePlans: applicablePlans || null,
      validFrom: validFrom || null,
      validUntil: validUntil || null,
      status: status || 'active',
    });

    res.status(201).json({ success: true, message: 'Coupon created', data: coupon });
  } catch (error) {
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ success: false, message: error.errors.map(e => e.message).join(', ') });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/admin/coupons/:id
const updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByPk(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });

    const updates = {};
    const fields = [
      'description', 'discountType', 'discountValue', 'maxDiscount',
      'minOrderAmount', 'maxUses', 'maxUsesPerUser', 'applicablePlans',
      'validFrom', 'validUntil', 'status',
    ];

    for (const field of fields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    // Allow code update only if no usages
    if (req.body.code) {
      const usageCount = await CouponUsage.count({ where: { couponId: coupon.id } });
      if (usageCount > 0) {
        return res.status(400).json({ success: false, message: 'Cannot change code of a used coupon' });
      }
      updates.code = req.body.code.toUpperCase().trim();
    }

    await coupon.update(updates);
    res.json({ success: true, message: 'Coupon updated', data: coupon });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/admin/coupons/:id
const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByPk(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });

    const usageCount = await CouponUsage.count({ where: { couponId: coupon.id } });
    if (usageCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete coupon with usage history. Deactivate it instead.',
      });
    }

    await coupon.destroy();
    res.json({ success: true, message: 'Coupon deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/admin/coupons/:id/usage
const getCouponUsage = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const usages = await CouponUsage.findAndCountAll({
      where: { couponId: req.params.id },
      include: [{ association: 'user', attributes: ['id', 'name', 'userCode', 'phone'] }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    res.json({
      success: true,
      data: usages.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(usages.count / parseInt(limit)),
        totalItems: usages.count,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getCouponUsage,
};
