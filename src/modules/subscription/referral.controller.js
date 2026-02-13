const User = require('../../models/User.model');
const Referral = require('../../models/Referral.model');
const AppSetting = require('../../models/AppSetting.model');
const crypto = require('crypto');

// Fallback defaults (used if DB setting not found)
const DEFAULT_REFERRER_TOKEN_REWARD = 3;
const DEFAULT_REFERRED_TOKEN_REWARD = 2;

/**
 * Read reward amounts from app_settings table, with fallback to defaults
 */
const getRewardConfig = async () => {
  try {
    const referrerSetting = await AppSetting.findOne({ where: { key: 'referral_referrer_reward' } });
    const referredSetting = await AppSetting.findOne({ where: { key: 'referral_referred_reward' } });
    return {
      REFERRER_TOKEN_REWARD: parseInt(referrerSetting?.value || String(DEFAULT_REFERRER_TOKEN_REWARD), 10),
      REFERRED_TOKEN_REWARD: parseInt(referredSetting?.value || String(DEFAULT_REFERRED_TOKEN_REWARD), 10),
    };
  } catch {
    return {
      REFERRER_TOKEN_REWARD: DEFAULT_REFERRER_TOKEN_REWARD,
      REFERRED_TOKEN_REWARD: DEFAULT_REFERRED_TOKEN_REWARD,
    };
  }
};

/**
 * GET /api/subscription/referral - Get current user's referral info
 */
const getReferralInfo = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Generate referral code if not exists
    if (!user.referralCode) {
      user.referralCode = generateReferralCode(user.userCode);
      await user.save();
    }

    const rewards = await getRewardConfig();

    // Get referral stats
    const totalReferrals = await Referral.count({ where: { referrerId: user.id } });
    const completedReferrals = await Referral.count({
      where: { referrerId: user.id, status: ['completed', 'rewarded'] },
    });
    const pendingReferrals = await Referral.count({
      where: { referrerId: user.id, status: 'pending' },
    });
    const totalTokensEarned = await Referral.sum('referrerReward', {
      where: { referrerId: user.id, status: 'rewarded' },
    }) || 0;

    // Get recent referrals
    const recentReferrals = await Referral.findAll({
      where: { referrerId: user.id },
      include: [{ model: User, as: 'referred', attributes: ['id', 'name', 'userCode', 'createdAt'] }],
      order: [['createdAt', 'DESC']],
      limit: 10,
    });

    res.json({
      success: true,
      data: {
        referralCode: user.referralCode,
        referralLink: `https://nammanaidu.cloud/register?ref=${user.referralCode}`,
        stats: {
          totalReferrals,
          completedReferrals,
          pendingReferrals,
          totalTokensEarned,
        },
        rewards: {
          referrerTokens: rewards.REFERRER_TOKEN_REWARD,
          referredTokens: rewards.REFERRED_TOKEN_REWARD,
        },
        recentReferrals: recentReferrals.map(r => ({
          id: r.id,
          referredUser: r.referred ? { name: r.referred.name, userCode: r.referred.userCode } : null,
          status: r.status,
          referrerReward: r.referrerReward,
          createdAt: r.createdAt,
          rewardedAt: r.rewardedAt,
        })),
      },
    });
  } catch (error) {
    console.error('Error getting referral info:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/subscription/referral/apply
 * Apply a referral code during registration (or first-time setup)
 */
const applyReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;
    const user = await User.findByPk(req.userId);

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Check if user was already referred
    if (user.referredBy) {
      return res.status(400).json({ success: false, message: 'You have already applied a referral code' });
    }

    // Can't refer yourself
    if (user.referralCode === referralCode) {
      return res.status(400).json({ success: false, message: 'You cannot use your own referral code' });
    }

    // Find referrer
    const referrer = await User.findOne({ where: { referralCode } });
    if (!referrer) {
      return res.status(404).json({ success: false, message: 'Invalid referral code' });
    }

    // Check if already exists
    const existingReferral = await Referral.findOne({ where: { referredId: user.id } });
    if (existingReferral) {
      return res.status(400).json({ success: false, message: 'Referral already applied' });
    }

    // Create referral record
    const referral = await Referral.create({
      referrerId: referrer.id,
      referredId: user.id,
      status: 'pending',
    });

    // Update user's referredBy
    user.referredBy = referrer.id;
    await user.save();

    // Give immediate reward to referred user (new signup bonus)
    const rewards = await getRewardConfig();
    user.profileViewTokens = (user.profileViewTokens || 0) + rewards.REFERRED_TOKEN_REWARD;
    await user.save();
    referral.referredReward = rewards.REFERRED_TOKEN_REWARD;
    await referral.save();

    res.json({
      success: true,
      message: `Referral applied! You received ${rewards.REFERRED_TOKEN_REWARD} profile view tokens.`,
      data: {
        tokensReceived: rewards.REFERRED_TOKEN_REWARD,
        newBalance: user.profileViewTokens,
        referrerCode: referralCode,
      },
    });
  } catch (error) {
    console.error('Error applying referral:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Called internally after a referred user makes their first purchase
 * Rewards the referrer with tokens
 */
const rewardReferrer = async (userId) => {
  try {
    const referral = await Referral.findOne({
      where: { referredId: userId, status: 'pending' },
    });

    if (!referral) return null;

    const rewards = await getRewardConfig();

    // Mark as completed
    referral.status = 'rewarded';
    referral.referrerReward = rewards.REFERRER_TOKEN_REWARD;
    referral.rewardedAt = new Date();
    await referral.save();

    // Credit referrer
    const referrer = await User.findByPk(referral.referrerId);
    if (referrer) {
      referrer.profileViewTokens = (referrer.profileViewTokens || 0) + rewards.REFERRER_TOKEN_REWARD;
      await referrer.save();
      console.log(`[Referral] Rewarded user ${referrer.id} with ${rewards.REFERRER_TOKEN_REWARD} tokens for referral`);
    }

    return referral;
  } catch (error) {
    console.error('[Referral] Error rewarding referrer:', error);
    return null;
  }
};

// ─── Helpers ───

function generateReferralCode(userCode) {
  // e.g., "NN#00015" → "NN00015" + 4 random chars
  const base = userCode.replace('#', '');
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${base}${random}`;
}

module.exports = {
  getReferralInfo,
  applyReferralCode,
  rewardReferrer,
};
