/**
 * Matchmaking Controller
 *
 * Endpoints:
 * - GET  /api/users/matches          (enhanced - uses matches table)
 * - GET  /api/users/recommendations   (daily recommendations)
 * - GET  /api/users/compatibility/:accountId  (score between two users)
 * - POST /api/users/matches/:matchId/unmatch  (unmatch)
 * - PUT  /api/users/recommendations/:id/action (mark action on recommendation)
 */

const { Op } = require('sequelize');
const User = require('../../models/User.model');
const BasicDetail = require('../../models/BasicDetail.model');
const PersonPhoto = require('../../models/PersonPhoto.model');
const PartnerPreference = require('../../models/PartnerPreference.model');
const Match = require('../../models/Match.model');
const DailyRecommendation = require('../../models/DailyRecommendation.model');
const { getBlockedAccountIds } = require('./safety.controller');
const PrivacySettings = require('../../models/PrivacySettings.model');
const {
  computeCompatibility,
  generateRecommendationsForUser,
} = require('../../services/matchmaking.service');

// ─── GET /api/users/matches ──────────────────────────────
// Returns all active matches from the matches table
const getMatches = async (req, res) => {
  try {
    const accountId = req.accountId;

    const matches = await Match.findAll({
      where: {
        [Op.or]: [
          { user1AccountId: accountId },
          { user2AccountId: accountId },
        ],
        status: 'active',
      },
      order: [['createdAt', 'DESC']],
    });

    // Collect the "other" user's accountIds
    const otherIds = matches.map((m) =>
      m.user1AccountId === accountId ? m.user2AccountId : m.user1AccountId
    );

    if (otherIds.length === 0) {
      return res.json({ success: true, count: 0, data: [] });
    }

    // Fetch user profiles
    const users = await User.findAll({
      where: { accountId: { [Op.in]: otherIds } },
      include: [
        { model: BasicDetail, as: 'basicDetail', required: false },
        { model: PersonPhoto, as: 'personPhoto', required: false },
      ],
      attributes: { exclude: ['password'] },
    });

    // Build a lookup
    const userMap = {};
    users.forEach((u) => { userMap[u.accountId] = u.toJSON(); });

    // Combine match data with user profiles
    const data = matches.map((m) => {
      const mJson = m.toJSON();
      const otherAccountId = mJson.user1AccountId === accountId ? mJson.user2AccountId : mJson.user1AccountId;
      return {
        matchId: mJson.id,
        matchScore: mJson.matchScore,
        matchType: mJson.matchType,
        matchedAt: mJson.createdAt,
        user: userMap[otherAccountId] || { accountId: otherAccountId },
      };
    });

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('Error getting matches:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to get matches' });
  }
};

// ─── GET /api/users/recommendations ──────────────────────
// Returns today's daily recommendations
const getRecommendations = async (req, res) => {
  try {
    const accountId = req.accountId;
    const today = new Date().toISOString().split('T')[0];

    // Check if recommendations exist for today; if not, generate on-the-fly
    let recs = await DailyRecommendation.findAll({
      where: { accountId, date: today },
      order: [['score', 'DESC']],
    });

    if (recs.length === 0) {
      // Generate recommendations for this user
      const user = await User.findOne({ where: { accountId }, attributes: ['id', 'accountId', 'gender'] });
      if (user) {
        await generateRecommendationsForUser(user, 10);
        recs = await DailyRecommendation.findAll({
          where: { accountId, date: today },
          order: [['score', 'DESC']],
        });
      }
    }

    // Fetch recommended user profiles, excluding blocked, paused, and privacy-hidden
    const blockedIds = await getBlockedAccountIds(accountId);
    const recIds = recs
      .map((r) => r.recommendedAccountId)
      .filter((id) => !blockedIds.includes(id));
    const users = await User.findAll({
      where: {
        accountId: { [Op.in]: recIds },
        isActive: true,
        profilePaused: { [Op.or]: [false, null] },
      },
      include: [
        { model: BasicDetail, as: 'basicDetail', required: false },
        { model: PersonPhoto, as: 'personPhoto', required: false },
        {
          model: PrivacySettings,
          as: 'privacySettings',
          required: false,
          where: {
            [Op.or]: [
              { profileVisibility: { [Op.in]: ['public', 'members'] } },
              { profileVisibility: null },
            ],
            [Op.and]: [
              { [Op.or]: [{ hideFromSearch: false }, { hideFromSearch: null }] },
            ],
          },
        },
      ],
      attributes: { exclude: ['password'] },
    });
    const userMap = {};
    users.forEach((u) => { userMap[u.accountId] = u.toJSON(); });

    // Mark as seen
    await DailyRecommendation.update({ seen: true }, { where: { accountId, date: today, seen: false } });

    const data = recs.map((r) => {
      const rJson = r.toJSON();
      return {
        id: rJson.id,
        score: rJson.score,
        reason: rJson.reason,
        date: rJson.date,
        actionTaken: rJson.actionTaken,
        user: userMap[rJson.recommendedAccountId] || { accountId: rJson.recommendedAccountId },
      };
    });

    res.json({ success: true, count: data.length, date: today, data });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to get recommendations' });
  }
};

// ─── GET /api/users/compatibility/:accountId ─────────────
// Returns compatibility score between current user and target
const getCompatibility = async (req, res) => {
  try {
    const myAccountId = req.accountId;
    const targetAccountId = req.params.accountId;

    if (myAccountId === targetAccountId) {
      return res.status(400).json({ success: false, message: 'Cannot check compatibility with yourself' });
    }

    // Get my preferences
    const myPrefs = await PartnerPreference.findOne({ where: { accountId: myAccountId } });

    // Get target profile
    const targetUser = await User.findOne({
      where: { accountId: targetAccountId },
      include: [{ model: BasicDetail, as: 'basicDetail', required: false }],
      attributes: { exclude: ['password'] },
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const targetJson = targetUser.toJSON();
    const result = computeCompatibility(myPrefs || {}, targetJson, targetJson.basicDetail);

    // Also compute reverse compatibility (how well I match their preferences)
    const theirPrefs = await PartnerPreference.findOne({ where: { accountId: targetAccountId } });
    const myUser = await User.findOne({
      where: { accountId: myAccountId },
      include: [{ model: BasicDetail, as: 'basicDetail', required: false }],
      attributes: { exclude: ['password'] },
    });
    const myJson = myUser ? myUser.toJSON() : {};
    const reverseResult = computeCompatibility(theirPrefs || {}, myJson, myJson.basicDetail);

    // Average of both directions
    const overallScore = Math.round((result.total + reverseResult.total) / 2);

    res.json({
      success: true,
      data: {
        overallScore,
        myScore: result.total,
        myBreakdown: result.breakdown,
        theirScore: reverseResult.total,
        theirBreakdown: reverseResult.breakdown,
        matchReason: result.reasons,
      },
    });
  } catch (error) {
    console.error('Error computing compatibility:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to compute compatibility' });
  }
};

// ─── POST /api/users/matches/:matchId/unmatch ────────────
// Unmatch a match
const unmatch = async (req, res) => {
  try {
    const accountId = req.accountId;
    const matchId = parseInt(req.params.matchId);

    const match = await Match.findOne({
      where: {
        id: matchId,
        [Op.or]: [
          { user1AccountId: accountId },
          { user2AccountId: accountId },
        ],
        status: 'active',
      },
    });

    if (!match) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }

    await match.update({
      status: 'unmatched',
      unmatchedBy: accountId,
      unmatchedAt: new Date(),
    });

    res.json({ success: true, message: 'Successfully unmatched' });
  } catch (error) {
    console.error('Error unmatching:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to unmatch' });
  }
};

// ─── PUT /api/users/recommendations/:id/action ──────────
// Record action taken on a recommendation
const updateRecommendationAction = async (req, res) => {
  try {
    const accountId = req.accountId;
    const recId = parseInt(req.params.id);
    const { action } = req.body;

    if (!['interest', 'shortlist', 'reject', 'skipped'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const rec = await DailyRecommendation.findOne({
      where: { id: recId, accountId },
    });

    if (!rec) {
      return res.status(404).json({ success: false, message: 'Recommendation not found' });
    }

    await rec.update({ actionTaken: action });

    res.json({ success: true, message: `Recommendation marked as ${action}` });
  } catch (error) {
    console.error('Error updating recommendation action:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update' });
  }
};

module.exports = {
  getMatches,
  getRecommendations,
  getCompatibility,
  unmatch,
  updateRecommendationAction,
};
