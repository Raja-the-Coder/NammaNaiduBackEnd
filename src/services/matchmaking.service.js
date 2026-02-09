/**
 * Matchmaking Engine Service
 * 
 * Provides:
 * - Compatibility scoring (0-100) between two users based on partner preferences
 * - Preference-based filtering for profile discovery
 * - Daily recommendation generation
 * - Daily action limit enforcement
 */

const { Op } = require('sequelize');
const User = require('../models/User.model');
const BasicDetail = require('../models/BasicDetail.model');
const HoroscopeDetail = require('../models/HoroscopeDetail.model');
const PartnerPreference = require('../models/PartnerPreference.model');
const ProfileAction = require('../models/ProfileAction.model');
const PersonPhoto = require('../models/PersonPhoto.model');
const Match = require('../models/Match.model');
const DailyRecommendation = require('../models/DailyRecommendation.model');

// ───────────────────────────────────────────────
//  SCORING WEIGHTS (total = 100)
// ───────────────────────────────────────────────
const WEIGHTS = {
  age: 15,
  religion: 15,
  caste: 10,
  education: 10,
  occupation: 8,
  income: 10,
  location: 12,
  maritalStatus: 8,
  dosham: 6,
  diet: 6,
};

// ───────────────────────────────────────────────
//  COMPATIBILITY SCORING
// ───────────────────────────────────────────────

/**
 * Compute compatibility score between a user (with their preferences) and a candidate profile.
 *
 * @param {Object} prefs  - PartnerPreference of the "viewer"
 * @param {Object} candidate - User record of the candidate
 * @param {Object} candidateBasic - BasicDetail record of the candidate
 * @returns {{ total: number, breakdown: Object, reasons: string[] }}
 */
const computeCompatibility = (prefs, candidate, candidateBasic) => {
  if (!prefs || !candidate) return { total: 0, breakdown: {}, reasons: [] };

  const breakdown = {};
  const reasons = [];

  // 1. Age match (15 pts)
  breakdown.age = 0;
  if (prefs.ageMin || prefs.ageMax) {
    const dob = candidate.dateOfBirth || candidateBasic?.dateOfBirth;
    if (dob) {
      const age = calculateAge(dob);
      const min = prefs.ageMin || 18;
      const max = prefs.ageMax || 100;
      if (age >= min && age <= max) {
        breakdown.age = WEIGHTS.age;
        reasons.push('age');
      } else {
        // Partial credit if within 3 years of range
        const diff = age < min ? min - age : age - max;
        if (diff <= 3) breakdown.age = Math.round(WEIGHTS.age * 0.5);
      }
    }
  } else {
    breakdown.age = WEIGHTS.age; // No preference = full score
  }

  // 2. Religion match (15 pts)
  breakdown.religion = 0;
  const prefReligions = prefs.religions || [];
  if (prefReligions.length > 0) {
    const candidateReligion = candidateBasic?.religion;
    if (candidateReligion && prefReligions.some((r) => r.toLowerCase() === candidateReligion.toLowerCase())) {
      breakdown.religion = WEIGHTS.religion;
      reasons.push('religion');
    }
  } else {
    breakdown.religion = WEIGHTS.religion;
  }

  // 3. Caste match (10 pts)
  breakdown.caste = 0;
  const prefCastes = prefs.castes || [];
  if (prefs.willingToMarryFromAnyCaste) {
    breakdown.caste = WEIGHTS.caste;
  } else if (prefCastes.length > 0) {
    const candidateCaste = candidateBasic?.caste;
    if (candidateCaste && prefCastes.some((c) => c.toLowerCase() === candidateCaste.toLowerCase())) {
      breakdown.caste = WEIGHTS.caste;
      reasons.push('caste');
    }
  } else {
    breakdown.caste = WEIGHTS.caste;
  }

  // 4. Education match (10 pts)
  breakdown.education = 0;
  const prefEducations = prefs.educations || [];
  if (prefEducations.length > 0) {
    const candidateEdu = candidateBasic?.education;
    if (candidateEdu && prefEducations.some((e) => e.toLowerCase() === candidateEdu.toLowerCase())) {
      breakdown.education = WEIGHTS.education;
      reasons.push('education');
    }
  } else {
    breakdown.education = WEIGHTS.education;
  }

  // 5. Occupation match (8 pts)
  breakdown.occupation = 0;
  const prefOccupations = prefs.occupations || [];
  if (prefOccupations.length > 0) {
    const candidateOcc = candidateBasic?.occupation;
    if (candidateOcc && prefOccupations.some((o) => o.toLowerCase() === candidateOcc.toLowerCase())) {
      breakdown.occupation = WEIGHTS.occupation;
      reasons.push('occupation');
    }
  } else {
    breakdown.occupation = WEIGHTS.occupation;
  }

  // 6. Income match (10 pts)
  breakdown.income = 0;
  if (prefs.incomeMin || prefs.incomeMax) {
    const candidateIncome = candidateBasic?.annualIncome;
    if (candidateIncome) {
      const incomeRank = getIncomeRank(candidateIncome);
      const minRank = prefs.incomeMin ? getIncomeRank(prefs.incomeMin) : 0;
      const maxRank = prefs.incomeMax ? getIncomeRank(prefs.incomeMax) : 100;
      if (incomeRank >= minRank && incomeRank <= maxRank) {
        breakdown.income = WEIGHTS.income;
        reasons.push('income');
      } else if (Math.abs(incomeRank - minRank) <= 1 || Math.abs(incomeRank - maxRank) <= 1) {
        breakdown.income = Math.round(WEIGHTS.income * 0.5);
      }
    }
  } else {
    breakdown.income = WEIGHTS.income;
  }

  // 7. Location match (12 pts)
  breakdown.location = 0;
  const prefLocations = prefs.locations || [];
  if (prefLocations.length > 0) {
    const candidateCity = (candidateBasic?.city || '').toLowerCase();
    const candidateState = (candidateBasic?.state || '').toLowerCase();
    const matched = prefLocations.some((loc) => {
      const l = (typeof loc === 'string' ? loc : '').toLowerCase();
      return l === candidateCity || l === candidateState;
    });
    if (matched) {
      breakdown.location = WEIGHTS.location;
      reasons.push('location');
    } else {
      // Partial credit if same state
      if (candidateState) {
        breakdown.location = Math.round(WEIGHTS.location * 0.3);
      }
    }
  } else {
    breakdown.location = WEIGHTS.location;
  }

  // 8. Marital Status match (8 pts)
  breakdown.maritalStatus = 0;
  const prefMarital = prefs.maritalStatuses || [];
  if (prefMarital.length > 0) {
    const candidateMarital = candidateBasic?.maritalStatus;
    if (candidateMarital && prefMarital.some((m) => m.toLowerCase() === candidateMarital.toLowerCase())) {
      breakdown.maritalStatus = WEIGHTS.maritalStatus;
      reasons.push('marital status');
    }
  } else {
    breakdown.maritalStatus = WEIGHTS.maritalStatus;
  }

  // 9. Dosham match (6 pts)
  breakdown.dosham = 0;
  if (prefs.dosham && prefs.dosham !== 'Does not matter') {
    const candidateDosham = candidateBasic?.dosham;
    if (candidateDosham) {
      if (prefs.dosham.toLowerCase() === candidateDosham.toLowerCase()) {
        breakdown.dosham = WEIGHTS.dosham;
      }
    }
  } else {
    breakdown.dosham = WEIGHTS.dosham;
  }

  // 10. Diet match (6 pts)
  breakdown.diet = 0;
  if (prefs.diet && prefs.diet !== 'Does not matter') {
    const candidateDiet = candidateBasic?.diet;
    if (candidateDiet && prefs.diet.toLowerCase() === candidateDiet.toLowerCase()) {
      breakdown.diet = WEIGHTS.diet;
    }
  } else {
    breakdown.diet = WEIGHTS.diet;
  }

  const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  const reasonStr = reasons.length > 0 ? `Matches your ${reasons.join(', ')} preferences` : 'General compatibility';

  return { total: Math.min(total, 100), breakdown, reasons: reasonStr };
};

// ───────────────────────────────────────────────
//  PREFERENCE-BASED FILTERING
// ───────────────────────────────────────────────

/**
 * Build a Sequelize WHERE clause for basic_details from a PartnerPreference object.
 * Returns { basicWhere, hasFilter }
 */
const buildPreferenceFilter = (prefs) => {
  const basicWhere = {};
  let hasFilter = false;

  if (!prefs) return { basicWhere, hasFilter };

  // Religion filter
  const religions = prefs.religions || [];
  if (religions.length > 0) {
    basicWhere.religion = { [Op.in]: religions };
    hasFilter = true;
  }

  // Caste filter (only if NOT willing to marry any caste)
  const castes = prefs.castes || [];
  if (castes.length > 0 && !prefs.willingToMarryFromAnyCaste) {
    basicWhere.caste = { [Op.in]: castes };
    hasFilter = true;
  }

  // Marital Status filter
  const maritalStatuses = prefs.maritalStatuses || [];
  if (maritalStatuses.length > 0) {
    basicWhere.maritalStatus = { [Op.in]: maritalStatuses };
    hasFilter = true;
  }

  // Education filter
  const educations = prefs.educations || [];
  if (educations.length > 0) {
    basicWhere.education = { [Op.in]: educations };
    hasFilter = true;
  }

  // Occupation filter
  const occupations = prefs.occupations || [];
  if (occupations.length > 0) {
    basicWhere.occupation = { [Op.in]: occupations };
    hasFilter = true;
  }

  // Dosham filter
  if (prefs.dosham && prefs.dosham !== 'Does not matter') {
    basicWhere.dosham = prefs.dosham;
    hasFilter = true;
  }

  return { basicWhere, hasFilter };
};

// ───────────────────────────────────────────────
//  DAILY RECOMMENDATIONS GENERATOR
// ───────────────────────────────────────────────

/**
 * Generate daily recommendations for a single user.
 * Returns the count of recommendations generated.
 */
const generateRecommendationsForUser = async (user, limit = 10) => {
  const today = new Date().toISOString().split('T')[0];

  // Check if already generated today
  const existing = await DailyRecommendation.count({
    where: { accountId: user.accountId, date: today },
  });
  if (existing >= limit) return existing;

  // Get partner preferences
  const prefs = await PartnerPreference.findOne({ where: { accountId: user.accountId } });

  // Determine opposite gender
  const oppositeGender = user.gender === 'Male' ? 'Female' : user.gender === 'Female' ? 'Male' : null;
  if (!oppositeGender) return 0;

  // Get users already interacted with (so we don't recommend them)
  const actedOnIds = await ProfileAction.findAll({
    where: { userId: user.accountId },
    attributes: ['targetUserId'],
  });
  const excludeIds = new Set(actedOnIds.map((a) => a.targetUserId));
  excludeIds.add(user.accountId);

  // Already recommended today
  const alreadyRecIds = await DailyRecommendation.findAll({
    where: { accountId: user.accountId, date: today },
    attributes: ['recommendedAccountId'],
  });
  alreadyRecIds.forEach((r) => excludeIds.add(r.recommendedAccountId));

  // Build preference filter
  const { basicWhere, hasFilter } = prefs ? buildPreferenceFilter(prefs) : { basicWhere: {}, hasFilter: false };

  // Fetch candidate profiles
  const candidates = await User.findAll({
    where: {
      gender: oppositeGender,
      isActive: true,
      accountId: { [Op.notIn]: [...excludeIds] },
      profileVisibility: { [Op.or]: ['public', 'members', null] },
    },
    include: [
      {
        model: BasicDetail,
        as: 'basicDetail',
        required: true,
        where: hasFilter ? basicWhere : undefined,
      },
    ],
    attributes: { exclude: ['password'] },
    limit: 100, // Fetch more than needed to score and rank
  });

  // Score each candidate
  const scored = candidates.map((c) => {
    const cJson = c.toJSON();
    const result = computeCompatibility(prefs || {}, cJson, cJson.basicDetail);
    return { candidate: cJson, score: result.total, reason: result.reasons };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Take top N
  const topN = scored.slice(0, limit - existing);

  // Bulk create
  if (topN.length > 0) {
    await DailyRecommendation.bulkCreate(
      topN.map((s) => ({
        accountId: user.accountId,
        recommendedAccountId: s.candidate.accountId,
        score: s.score,
        reason: s.reason,
        date: today,
      })),
      { ignoreDuplicates: true }
    );
  }

  return topN.length;
};

/**
 * Generate daily recommendations for ALL active users.
 * Called by the cron job.
 */
const generateAllRecommendations = async () => {
  console.log('[Matchmaking] Starting daily recommendations generation...');
  const startTime = Date.now();

  const users = await User.findAll({
    where: { isActive: true, gender: { [Op.in]: ['Male', 'Female'] } },
    attributes: ['id', 'accountId', 'gender'],
  });

  let totalGenerated = 0;
  let processed = 0;

  for (const user of users) {
    try {
      const count = await generateRecommendationsForUser(user, 10);
      totalGenerated += count;
      processed++;
    } catch (err) {
      console.error(`[Matchmaking] Error generating recs for user ${user.accountId}:`, err.message);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Matchmaking] Done. Processed ${processed} users, generated ${totalGenerated} recommendations in ${duration}s`);
  return { processed, totalGenerated, durationSeconds: duration };
};

// ───────────────────────────────────────────────
//  MUTUAL MATCH DETECTION
// ───────────────────────────────────────────────

/**
 * Check if two users have a mutual interest and create a Match record if so.
 * Called after a profile action is created.
 *
 * @param {string} actorAccountId - UUID of user who performed the action
 * @param {string} targetAccountId - UUID of target user
 * @param {string} actionType - 'interest' or 'accept'
 * @returns {Object|null} Match record if created, null otherwise
 */
const detectAndCreateMatch = async (actorAccountId, targetAccountId, actionType) => {
  try {
    // Check if a match already exists (in either direction)
    const existingMatch = await Match.findOne({
      where: {
        [Op.or]: [
          { user1AccountId: actorAccountId, user2AccountId: targetAccountId },
          { user1AccountId: targetAccountId, user2AccountId: actorAccountId },
        ],
        status: 'active',
      },
    });
    if (existingMatch) return existingMatch;

    let shouldMatch = false;
    let matchType = 'mutual_interest';

    if (actionType === 'accept') {
      // accept always creates a match (the target had already sent interest)
      shouldMatch = true;
      matchType = 'accepted';
    } else if (actionType === 'interest') {
      // Check if target also sent interest to actor
      const reverseInterest = await ProfileAction.findOne({
        where: {
          userId: targetAccountId,
          targetUserId: actorAccountId,
          actionType: { [Op.in]: ['interest', 'accept'] },
        },
      });
      if (reverseInterest) {
        shouldMatch = true;
        matchType = reverseInterest.actionType === 'accept' ? 'accepted' : 'mutual_interest';
      }
    }

    if (!shouldMatch) return null;

    // Compute compatibility score
    const prefs = await PartnerPreference.findOne({ where: { accountId: actorAccountId } });
    const targetUser = await User.findOne({
      where: { accountId: targetAccountId },
      include: [{ model: BasicDetail, as: 'basicDetail', required: false }],
    });
    const targetJson = targetUser ? targetUser.toJSON() : {};
    const { total: score } = computeCompatibility(prefs || {}, targetJson, targetJson.basicDetail);

    // Create match (sort accountIds to avoid duplicate pairs)
    const [firstId, secondId] =
      actorAccountId < targetAccountId
        ? [actorAccountId, targetAccountId]
        : [targetAccountId, actorAccountId];

    const [match, created] = await Match.findOrCreate({
      where: { user1AccountId: firstId, user2AccountId: secondId },
      defaults: {
        user1AccountId: firstId,
        user2AccountId: secondId,
        matchScore: score,
        matchType,
        status: 'active',
      },
    });

    if (created) {
      console.log(`[Matchmaking] New match created: ${firstId} <-> ${secondId} (score: ${score}, type: ${matchType})`);
    }

    return match;
  } catch (err) {
    console.error('[Matchmaking] Error detecting match:', err.message);
    return null;
  }
};

// ───────────────────────────────────────────────
//  DAILY ACTION LIMITS
// ───────────────────────────────────────────────

/**
 * Check if a user has exceeded their daily action limit.
 * Free users get 10 actions/day, subscribed users get more based on plan.
 *
 * @param {string} accountId - UUID
 * @returns {{ allowed: boolean, used: number, limit: number }}
 */
const checkDailyActionLimit = async (accountId) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Count today's actions
  const used = await ProfileAction.count({
    where: {
      userId: accountId,
      createdAt: { [Op.gte]: todayStart },
    },
  });

  // Check subscription for higher limit
  let limit = 10; // Free tier default
  try {
    const SubscriptionTransaction = require('../models/SubscriptionTransaction.model');
    const SubscriptionPlan = require('../models/SubscriptionPlan.model');

    const user = await User.findOne({ where: { accountId }, attributes: ['id'] });
    if (user) {
      const activeSub = await SubscriptionTransaction.findOne({
        where: {
          userId: user.id,
          status: 'success',
        },
        include: [{ model: SubscriptionPlan, as: 'plan' }],
        order: [['createdAt', 'DESC']],
      });
      if (activeSub && activeSub.plan) {
        limit = activeSub.plan.dailyActionLimit || activeSub.plan.maxProfile || 50;
      }
    }
  } catch (err) {
    // If subscription tables don't have the column yet, use default
    console.warn('[Matchmaking] Could not check subscription limit:', err.message);
  }

  return { allowed: used < limit, used, limit };
};

// ───────────────────────────────────────────────
//  HELPERS
// ───────────────────────────────────────────────

function calculateAge(dateOfBirth) {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function getIncomeRank(incomeStr) {
  const ranks = {
    'no income': 0,
    'below 2 lakh': 1,
    '2-4 lakh': 2,
    '4-7 lakh': 3,
    '7-10 lakh': 4,
    '10-15 lakh': 5,
    '15-25 lakh': 6,
    '25-50 lakh': 7,
    '50 lakh - 1 crore': 8,
    'above 1 crore': 9,
  };
  return ranks[(incomeStr || '').toLowerCase()] ?? 5;
}

module.exports = {
  computeCompatibility,
  buildPreferenceFilter,
  generateRecommendationsForUser,
  generateAllRecommendations,
  detectAndCreateMatch,
  checkDailyActionLimit,
  WEIGHTS,
};
