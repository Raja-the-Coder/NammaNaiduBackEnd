const { getUserSubscriptionStatus } = require('../services/subscription.service');

/**
 * Middleware: requireSubscription
 * Blocks access unless user has an active (or grace-period) subscription.
 * Must come AFTER `authenticate` middleware (needs req.userId).
 */
const requireSubscription = async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const status = await getUserSubscriptionStatus(userId);

    if (!status.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Active subscription required to access this feature',
        code: 'SUBSCRIPTION_REQUIRED',
        data: {
          planName: status.planName,
          expiresAt: status.expiresAt,
        },
      });
    }

    // Attach subscription info to request for downstream use
    req.subscription = status;

    // If in grace period, add warning header
    if (status.isGracePeriod) {
      res.set('X-Subscription-Warning', 'grace-period');
      res.set('X-Grace-Period-Ends', status.gracePeriodEndsAt);
    }

    next();
  } catch (error) {
    console.error('[requireSubscription] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify subscription status',
    });
  }
};

/**
 * Middleware: requireTokens(count)
 * Checks that the user has enough profileViewTokens.
 * Must come AFTER `authenticate` middleware.
 * @param {number} count - Number of tokens required (default 1)
 */
const requireTokens = (count = 1) => {
  return async (req, res, next) => {
    try {
      const User = require('../models/User.model');
      const user = await User.findByPk(req.userId);

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      if ((user.profileViewTokens || 0) < count) {
        return res.status(403).json({
          success: false,
          message: `Insufficient profile view tokens. Required: ${count}, Available: ${user.profileViewTokens || 0}`,
          code: 'INSUFFICIENT_TOKENS',
          data: {
            required: count,
            available: user.profileViewTokens || 0,
          },
        });
      }

      next();
    } catch (error) {
      console.error('[requireTokens] Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify tokens',
      });
    }
  };
};

/**
 * Middleware: optionalSubscriptionInfo
 * Attaches subscription status to req but does NOT block.
 * Useful for routes that behave differently for paid vs free users.
 */
const optionalSubscriptionInfo = async (req, res, next) => {
  try {
    if (req.userId) {
      req.subscription = await getUserSubscriptionStatus(req.userId);
    }
  } catch (error) {
    // Non-blocking — don't fail the request
    console.warn('[optionalSubscriptionInfo] Error:', error.message);
  }
  next();
};

module.exports = {
  requireSubscription,
  requireTokens,
  optionalSubscriptionInfo,
};
