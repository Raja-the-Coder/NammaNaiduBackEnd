const UserBlock = require('../../models/UserBlock.model');
const UserReport = require('../../models/UserReport.model');
const User = require('../../models/User.model');
const Match = require('../../models/Match.model');
const ProfileAction = require('../../models/ProfileAction.model');
const { sequelize } = require('../../config/database');
const { Op } = require('sequelize');

// ─── Block a user platform-wide ───────────────────────────────────────────────
const blockUser = async (req, res) => {
  try {
    const blockerAccountId = req.accountId;
    const { targetAccountId, reason } = req.body;

    if (!targetAccountId) {
      return res.status(400).json({ success: false, message: 'targetAccountId is required' });
    }
    if (blockerAccountId === targetAccountId) {
      return res.status(400).json({ success: false, message: 'You cannot block yourself' });
    }

    // Check target user exists
    const targetUser = await User.findOne({ where: { accountId: targetAccountId } });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Create block (upsert — ignore if already blocked)
    const [block, created] = await UserBlock.findOrCreate({
      where: { blockerAccountId, blockedAccountId: targetAccountId },
      defaults: { reason },
    });

    if (!created) {
      return res.status(200).json({ success: true, message: 'User is already blocked' });
    }

    // Side-effects in a transaction
    await sequelize.transaction(async (t) => {
      // 1. Set any mutual match to 'blocked'
      await Match.update(
        { status: 'blocked', unmatchedBy: blockerAccountId, unmatchedAt: new Date() },
        {
          where: {
            status: 'active',
            [Op.or]: [
              { user1AccountId: blockerAccountId, user2AccountId: targetAccountId },
              { user1AccountId: targetAccountId, user2AccountId: blockerAccountId },
            ],
          },
          transaction: t,
        }
      );

      // 2. Remove all pending profile actions between the two users
      await ProfileAction.destroy({
        where: {
          [Op.or]: [
            { userId: blockerAccountId, targetUserId: targetAccountId },
            { userId: targetAccountId, targetUserId: blockerAccountId },
          ],
        },
        transaction: t,
      });
    });

    return res.status(201).json({
      success: true,
      message: 'User blocked successfully',
      data: { id: block.id },
    });
  } catch (error) {
    console.error('Error blocking user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Unblock a user ───────────────────────────────────────────────────────────
const unblockUser = async (req, res) => {
  try {
    const blockerAccountId = req.accountId;
    const { targetAccountId } = req.body;

    if (!targetAccountId) {
      return res.status(400).json({ success: false, message: 'targetAccountId is required' });
    }

    const deleted = await UserBlock.destroy({
      where: { blockerAccountId, blockedAccountId: targetAccountId },
    });

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Block not found' });
    }

    return res.json({ success: true, message: 'User unblocked successfully' });
  } catch (error) {
    console.error('Error unblocking user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── List users I've blocked ──────────────────────────────────────────────────
const getBlockedUsers = async (req, res) => {
  try {
    const blockerAccountId = req.accountId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { count, rows } = await UserBlock.findAndCountAll({
      where: { blockerAccountId },
      include: [
        {
          model: User,
          as: 'blocked',
          attributes: ['accountId', 'name', 'userCode', 'gender', 'dateOfBirth'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching blocked users:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Report a user ────────────────────────────────────────────────────────────
const reportUser = async (req, res) => {
  try {
    const reporterAccountId = req.accountId;
    const { targetAccountId, reason, description } = req.body;

    if (!targetAccountId) {
      return res.status(400).json({ success: false, message: 'targetAccountId is required' });
    }
    if (!reason) {
      return res.status(400).json({ success: false, message: 'reason is required' });
    }
    if (reporterAccountId === targetAccountId) {
      return res.status(400).json({ success: false, message: 'You cannot report yourself' });
    }

    const validReasons = ['fake_profile', 'harassment', 'inappropriate', 'scam', 'underage', 'spam', 'other'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ success: false, message: `reason must be one of: ${validReasons.join(', ')}` });
    }

    // Check target user exists
    const targetUser = await User.findOne({ where: { accountId: targetAccountId } });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check for duplicate report (same reporter + reported + pending)
    const existingReport = await UserReport.findOne({
      where: {
        reporterAccountId,
        reportedAccountId: targetAccountId,
        status: 'pending',
      },
    });
    if (existingReport) {
      return res.status(409).json({ success: false, message: 'You already have a pending report for this user' });
    }

    // Create the report
    const report = await UserReport.create({
      reporterAccountId,
      reportedAccountId: targetAccountId,
      reason,
      description: description || null,
    });

    // ─── Auto-flag / Auto-block logic ───
    const newReportCount = (targetUser.reportCount || 0) + 1;
    const updateFields = { reportCount: newReportCount };

    if (newReportCount >= 5) {
      // Auto-block: disable the user pending admin review
      updateFields.isActive = false;
      updateFields.isFlagged = true;
      updateFields.flagReason = `Auto-blocked: ${newReportCount} reports received`;
    } else if (newReportCount >= 3) {
      // Auto-flag: mark for admin review
      updateFields.isFlagged = true;
      updateFields.flagReason = `Auto-flagged: ${newReportCount} reports received`;
    }

    await User.update(updateFields, { where: { accountId: targetAccountId } });

    return res.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      data: { id: report.id },
    });
  } catch (error) {
    console.error('Error reporting user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Get safety settings ─────────────────────────────────────────────────────
const getSafetySettings = async (req, res) => {
  try {
    const user = await User.findOne({
      where: { accountId: req.accountId },
      attributes: ['profilePaused', 'verifiedOnlyChat', 'profileVisibility'],
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      data: {
        profilePaused: user.profilePaused || false,
        verifiedOnlyChat: user.verifiedOnlyChat || false,
        profileVisibility: user.profileVisibility || 'members',
      },
    });
  } catch (error) {
    console.error('Error fetching safety settings:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Update safety settings ──────────────────────────────────────────────────
const updateSafetySettings = async (req, res) => {
  try {
    const { profilePaused, verifiedOnlyChat } = req.body;
    const updateFields = {};

    if (typeof profilePaused === 'boolean') updateFields.profilePaused = profilePaused;
    if (typeof verifiedOnlyChat === 'boolean') updateFields.verifiedOnlyChat = verifiedOnlyChat;

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    await User.update(updateFields, { where: { accountId: req.accountId } });

    return res.json({
      success: true,
      message: 'Safety settings updated',
      data: updateFields,
    });
  } catch (error) {
    console.error('Error updating safety settings:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Helper: Get blocked account IDs for a user (used by other controllers) ──
const getBlockedAccountIds = async (accountId) => {
  const blocks = await UserBlock.findAll({
    where: {
      [Op.or]: [
        { blockerAccountId: accountId },
        { blockedAccountId: accountId },
      ],
    },
    attributes: ['blockerAccountId', 'blockedAccountId'],
    raw: true,
  });

  const blockedIds = new Set();
  blocks.forEach((b) => {
    if (b.blockerAccountId !== accountId) blockedIds.add(b.blockerAccountId);
    if (b.blockedAccountId !== accountId) blockedIds.add(b.blockedAccountId);
  });

  return Array.from(blockedIds);
};

module.exports = {
  blockUser,
  unblockUser,
  getBlockedUsers,
  reportUser,
  getSafetySettings,
  updateSafetySettings,
  getBlockedAccountIds,
};
