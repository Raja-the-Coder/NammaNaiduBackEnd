const express = require('express');
const { query } = require('express-validator');
const { validate } = require('../../middleware/validation.middleware');
const { authenticateAdmin } = require('../../middleware/adminAuth.middleware');
const Referral = require('../../models/Referral.model');
const User = require('../../models/User.model');

const router = express.Router();
router.use(authenticateAdmin);

// GET /api/admin/referrals - list all referrals
router.get(
  '/referrals',
  [
    query('status').optional().isIn(['pending', 'completed', 'rewarded']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validate,
  ],
  async (req, res) => {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const where = {};
      if (status) where.status = status;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const referrals = await Referral.findAndCountAll({
        where,
        include: [
          { model: User, as: 'referrer', attributes: ['id', 'name', 'userCode', 'phone'] },
          { model: User, as: 'referred', attributes: ['id', 'name', 'userCode', 'phone'] },
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset,
      });

      res.json({
        success: true,
        data: referrals.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(referrals.count / parseInt(limit)),
          totalItems: referrals.count,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// GET /api/admin/referrals/stats
router.get('/referrals/stats', async (req, res) => {
  try {
    const totalReferrals = await Referral.count();
    const pendingReferrals = await Referral.count({ where: { status: 'pending' } });
    const completedReferrals = await Referral.count({ where: { status: ['completed', 'rewarded'] } });
    const totalReferrerRewards = await Referral.sum('referrerReward') || 0;
    const totalReferredRewards = await Referral.sum('referredReward') || 0;

    // Top referrers
    const { sequelize } = require('../../config/database');
    const topReferrers = await Referral.findAll({
      attributes: [
        'referrerId',
        [sequelize.fn('COUNT', sequelize.col('referrerId')), 'referralCount'],
        [sequelize.fn('SUM', sequelize.col('referrerReward')), 'totalReward'],
      ],
      include: [{ model: User, as: 'referrer', attributes: ['name', 'userCode'] }],
      group: ['referrerId', 'referrer.id', 'referrer.name', 'referrer.userCode'],
      order: [[sequelize.literal('"referralCount"'), 'DESC']],
      limit: 10,
    });

    res.json({
      success: true,
      data: {
        totalReferrals,
        pendingReferrals,
        completedReferrals,
        totalReferrerRewards,
        totalReferredRewards,
        topReferrers,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
