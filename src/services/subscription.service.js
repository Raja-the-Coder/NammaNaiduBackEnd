const { Op } = require('sequelize');
const User = require('../models/User.model');
const SubscriptionTransaction = require('../models/SubscriptionTransaction.model');
const SubscriptionPlan = require('../models/SubscriptionPlan.model');

const GRACE_PERIOD_DAYS = 7;

/**
 * Check and handle expired subscriptions
 * Called by cron job daily at 1:00 AM IST
 */
const checkExpiredSubscriptions = async () => {
  const now = new Date();
  let expiredCount = 0;
  let graceStartedCount = 0;
  let graceEndedCount = 0;

  try {
    // 1. Find users whose subscription has expired but grace period hasn't started
    const newlyExpired = await User.findAll({
      where: {
        subscriptionExpiresAt: {
          [Op.lt]: now,
          [Op.ne]: null,
        },
        gracePeriodEndsAt: null,
      },
    });

    for (const user of newlyExpired) {
      const graceEnd = new Date(user.subscriptionExpiresAt);
      graceEnd.setDate(graceEnd.getDate() + GRACE_PERIOD_DAYS);
      user.gracePeriodEndsAt = graceEnd;
      await user.save();
      graceStartedCount++;
    }

    // 2. Find users whose grace period has ended
    const graceExpired = await User.findAll({
      where: {
        gracePeriodEndsAt: {
          [Op.lt]: now,
          [Op.ne]: null,
        },
      },
    });

    for (const user of graceExpired) {
      // Reset premium features
      user.subscriptionExpiresAt = null;
      user.gracePeriodEndsAt = null;
      // Don't reset profileViewTokens — they're a lifetime earn
      await user.save();
      graceEndedCount++;
    }

    expiredCount = newlyExpired.length + graceExpired.length;

    return {
      checked: true,
      newlyExpired: graceStartedCount,
      graceEnded: graceEndedCount,
      totalProcessed: expiredCount,
    };
  } catch (error) {
    console.error('[SubscriptionService] checkExpiredSubscriptions error:', error);
    throw error;
  }
};

/**
 * Get the subscription status for a user (used by middleware & API)
 * Returns: { isActive, isGracePeriod, expiresAt, gracePeriodEndsAt, planName, daysRemaining }
 */
const getUserSubscriptionStatus = async (userId) => {
  const now = new Date();

  const user = await User.findByPk(userId);
  if (!user) return { isActive: false, isGracePeriod: false };

  // Check if user has a valid subscription via transaction
  const lastSuccess = await SubscriptionTransaction.findOne({
    where: { userId: user.id, status: 'success' },
    order: [['createdAt', 'DESC']],
    include: [{ model: SubscriptionPlan, as: 'plan', attributes: ['id', 'planName', 'maxProfile', 'validMonth'] }],
  });

  if (!lastSuccess || !lastSuccess.plan) {
    return {
      isActive: false,
      isGracePeriod: false,
      planName: 'Free',
      expiresAt: null,
      daysRemaining: 0,
    };
  }

  // Calculate expiry from transaction if subscriptionExpiresAt is not set
  let expiresAt = user.subscriptionExpiresAt;
  if (!expiresAt) {
    expiresAt = new Date(lastSuccess.createdAt);
    expiresAt.setMonth(expiresAt.getMonth() + (lastSuccess.plan.validMonth || 1));
  }

  const isExpired = now > expiresAt;

  if (!isExpired) {
    const daysRemaining = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
    return {
      isActive: true,
      isGracePeriod: false,
      planName: lastSuccess.plan.planName,
      expiresAt: expiresAt.toISOString(),
      daysRemaining,
    };
  }

  // Subscription expired — check grace period
  const gracePeriodEndsAt = user.gracePeriodEndsAt;
  if (gracePeriodEndsAt && now < gracePeriodEndsAt) {
    const daysRemaining = Math.ceil((gracePeriodEndsAt - now) / (1000 * 60 * 60 * 24));
    return {
      isActive: true,
      isGracePeriod: true,
      planName: lastSuccess.plan.planName,
      expiresAt: expiresAt.toISOString(),
      gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
      daysRemaining,
    };
  }

  // Fully expired
  return {
    isActive: false,
    isGracePeriod: false,
    planName: 'Expired',
    expiresAt: expiresAt.toISOString(),
    daysRemaining: 0,
  };
};

module.exports = {
  checkExpiredSubscriptions,
  getUserSubscriptionStatus,
  GRACE_PERIOD_DAYS,
};
