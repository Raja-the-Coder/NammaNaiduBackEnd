const { Op } = require('sequelize');
const PrivacySettings = require('../models/PrivacySettings.model');
const Match = require('../models/Match.model');
const User = require('../models/User.model');

/**
 * Check if two users have a mutual acceptance (active match).
 * Returns true if a Match exists with status 'active'.
 */
const isAcceptedInterest = async (viewerAccountId, targetAccountId) => {
  if (!viewerAccountId || !targetAccountId) return false;
  if (viewerAccountId === targetAccountId) return true; // own profile

  const match = await Match.findOne({
    where: {
      status: 'active',
      [Op.or]: [
        { user1AccountId: viewerAccountId, user2AccountId: targetAccountId },
        { user1AccountId: targetAccountId, user2AccountId: viewerAccountId },
      ],
    },
    attributes: ['id'],
  });

  return !!match;
};

/**
 * Check if viewer is a premium user (has an active, non-expired subscription).
 */
const isPremiumUser = async (viewerAccountId) => {
  const user = await User.findOne({
    where: { accountId: viewerAccountId },
    attributes: ['subscriptionExpiresAt', 'gracePeriodEndsAt'],
  });

  if (!user) return false;

  const now = new Date();
  return (
    (user.subscriptionExpiresAt && user.subscriptionExpiresAt > now) ||
    (user.gracePeriodEndsAt && user.gracePeriodEndsAt > now)
  );
};

/**
 * Get or create PrivacySettings for a user account.
 */
const getOrCreateSettings = async (accountId) => {
  let settings = await PrivacySettings.findOne({ where: { accountId } });
  if (!settings) {
    settings = await PrivacySettings.create({ accountId });
  }
  return settings;
};

/**
 * Evaluate a visibility rule (everyone / accepted_only / premium_only / nobody)
 * against the viewer's relationship and premium status.
 *
 * Returns { allowed: boolean, reason: string }
 */
const evaluateRule = (rule, isAccepted, isPremium) => {
  switch (rule) {
    case 'everyone':
      return { allowed: true, reason: null };
    case 'accepted_only':
      return isAccepted
        ? { allowed: true, reason: null }
        : { allowed: false, reason: 'Visible to accepted interests only' };
    case 'premium_only':
      return isPremium
        ? { allowed: true, reason: null }
        : { allowed: false, reason: 'Visible to premium members only' };
    case 'nobody':
      return { allowed: false, reason: 'Hidden by user' };
    default:
      return { allowed: true, reason: null };
  }
};

/**
 * Check if the viewer can see the target user's photos.
 *
 * @returns {{ allowed: boolean, blurred: boolean, reason: string|null }}
 */
const canViewPhotos = async (viewerAccountId, targetAccountId) => {
  if (viewerAccountId === targetAccountId) {
    return { allowed: true, blurred: false, reason: null };
  }

  const settings = await getOrCreateSettings(targetAccountId);

  const isAccepted = await isAcceptedInterest(viewerAccountId, targetAccountId);
  const isPremium = await isPremiumUser(viewerAccountId);

  const result = evaluateRule(settings.showPhotosTo, isAccepted, isPremium);

  if (!result.allowed && settings.blurPhotos) {
    return { allowed: false, blurred: true, reason: result.reason };
  }

  return {
    allowed: result.allowed,
    blurred: !result.allowed && settings.blurPhotos,
    reason: result.reason,
  };
};

/**
 * Check if the viewer can see a contact field (phone or email).
 *
 * @param {'phone'|'email'} field
 * @returns {{ allowed: boolean, reason: string|null }}
 */
const canViewContact = async (viewerAccountId, targetAccountId, field) => {
  if (viewerAccountId === targetAccountId) {
    return { allowed: true, reason: null };
  }

  const settings = await getOrCreateSettings(targetAccountId);

  const rule = field === 'phone' ? settings.showPhone : settings.showEmail;

  const isAccepted = await isAcceptedInterest(viewerAccountId, targetAccountId);
  const isPremium = await isPremiumUser(viewerAccountId);

  return evaluateRule(rule, isAccepted, isPremium);
};

/**
 * Get the full privacy context for a viewer looking at a target profile.
 * Batches all checks into one call to reduce repeated DB queries.
 *
 * @returns {{ photoResult, phoneResult, emailResult, isAccepted, isPremium, settings }}
 */
const getPrivacyContext = async (viewerAccountId, targetAccountId) => {
  if (viewerAccountId === targetAccountId) {
    return {
      isOwnProfile: true,
      photoResult: { allowed: true, blurred: false, reason: null },
      phoneResult: { allowed: true, reason: null },
      emailResult: { allowed: true, reason: null },
      isAccepted: true,
      isPremium: false,
      settings: null,
    };
  }

  const [settings, isAccepted, isPremium] = await Promise.all([
    getOrCreateSettings(targetAccountId),
    isAcceptedInterest(viewerAccountId, targetAccountId),
    isPremiumUser(viewerAccountId),
  ]);

  const photoRule = evaluateRule(settings.showPhotosTo, isAccepted, isPremium);
  const phoneRule = evaluateRule(settings.showPhone, isAccepted, isPremium);
  const emailRule = evaluateRule(settings.showEmail, isAccepted, isPremium);

  return {
    isOwnProfile: false,
    photoResult: {
      allowed: photoRule.allowed,
      blurred: !photoRule.allowed && settings.blurPhotos,
      reason: photoRule.reason,
    },
    phoneResult: phoneRule,
    emailResult: emailRule,
    isAccepted,
    isPremium,
    settings,
  };
};

module.exports = {
  isAcceptedInterest,
  isPremiumUser,
  getOrCreateSettings,
  canViewPhotos,
  canViewContact,
  getPrivacyContext,
};
