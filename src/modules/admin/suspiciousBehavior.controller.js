const User = require('../../models/User.model');
const UserBlock = require('../../models/UserBlock.model');
const UserReport = require('../../models/UserReport.model');
const ProfileAction = require('../../models/ProfileAction.model');
const { Op, fn, col, literal } = require('sequelize');

// ─── Get suspicious users (aggregated from multiple signals) ─────────────────
const getSuspiciousUsers = async (req, res) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let suspiciousUsers = [];

    // Interest spammers: 50+ profile actions in last 24h
    if (!type || type === 'spammer') {
      const spammers = await ProfileAction.findAll({
        attributes: [
          'userId',
          [fn('COUNT', col('id')), 'actionCount'],
        ],
        where: { createdAt: { [Op.gte]: yesterday } },
        group: ['userId'],
        having: literal('COUNT(id) >= 50'),
        order: [[fn('COUNT', col('id')), 'DESC']],
        raw: true,
      });

      for (const s of spammers) {
        const user = await User.findOne({
          where: { accountId: s.userId },
          attributes: ['id', 'accountId', 'name', 'userCode', 'email', 'phone', 'gender', 'isActive', 'reportCount'],
        });
        if (user) {
          suspiciousUsers.push({
            ...user.toJSON(),
            behaviorType: 'spammer',
            metric: parseInt(s.actionCount),
            metricLabel: `${s.actionCount} interests/24h`,
            riskScore: Math.min(100, Math.round((parseInt(s.actionCount) / 50) * 60)),
          });
        }
      }
    }

    // Frequently blocked: 5+ blocks in last 7 days
    if (!type || type === 'blocked') {
      const frequentlyBlocked = await UserBlock.findAll({
        attributes: [
          'blockedAccountId',
          [fn('COUNT', col('id')), 'blockCount'],
        ],
        where: { createdAt: { [Op.gte]: lastWeek } },
        group: ['blockedAccountId'],
        having: literal('COUNT(id) >= 5'),
        order: [[fn('COUNT', col('id')), 'DESC']],
        raw: true,
      });

      for (const b of frequentlyBlocked) {
        // Skip if already added as spammer
        if (suspiciousUsers.find(u => u.accountId === b.blockedAccountId)) continue;
        const user = await User.findOne({
          where: { accountId: b.blockedAccountId },
          attributes: ['id', 'accountId', 'name', 'userCode', 'email', 'phone', 'gender', 'isActive', 'reportCount'],
        });
        if (user) {
          suspiciousUsers.push({
            ...user.toJSON(),
            behaviorType: 'frequently_blocked',
            metric: parseInt(b.blockCount),
            metricLabel: `${b.blockCount} blocks/7d`,
            riskScore: Math.min(100, Math.round((parseInt(b.blockCount) / 5) * 70)),
          });
        }
      }
    }

    // Report magnets: 3+ reports in last 7 days
    if (!type || type === 'reported') {
      const reportMagnets = await UserReport.findAll({
        attributes: [
          'reportedAccountId',
          [fn('COUNT', col('id')), 'reportCount'],
        ],
        where: { createdAt: { [Op.gte]: lastWeek } },
        group: ['reportedAccountId'],
        having: literal('COUNT(id) >= 3'),
        order: [[fn('COUNT', col('id')), 'DESC']],
        raw: true,
      });

      for (const r of reportMagnets) {
        if (suspiciousUsers.find(u => u.accountId === r.reportedAccountId)) continue;
        const user = await User.findOne({
          where: { accountId: r.reportedAccountId },
          attributes: ['id', 'accountId', 'name', 'userCode', 'email', 'phone', 'gender', 'isActive', 'reportCount'],
        });
        if (user) {
          suspiciousUsers.push({
            ...user.toJSON(),
            behaviorType: 'report_magnet',
            metric: parseInt(r.reportCount),
            metricLabel: `${r.reportCount} reports/7d`,
            riskScore: Math.min(100, Math.round((parseInt(r.reportCount) / 3) * 50)),
          });
        }
      }
    }

    // Sort by risk score descending
    suspiciousUsers.sort((a, b) => b.riskScore - a.riskScore);

    const total = suspiciousUsers.length;
    const paginatedUsers = suspiciousUsers.slice(offset, offset + parseInt(limit));

    return res.json({
      success: true,
      data: paginatedUsers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching suspicious users:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Suspicious behavior summary stats ───────────────────────────────────────
const getSuspiciousBehaviorStats = async (req, res) => {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [spammerCount, frequentlyBlockedCount, reportMagnetCount] = await Promise.all([
      // Users with 50+ actions in 24h
      ProfileAction.findAll({
        attributes: ['userId'],
        where: { createdAt: { [Op.gte]: yesterday } },
        group: ['userId'],
        having: literal('COUNT(id) >= 50'),
        raw: true,
      }).then(rows => rows.length),
      // Users blocked by 5+ in 7 days
      UserBlock.findAll({
        attributes: ['blockedAccountId'],
        where: { createdAt: { [Op.gte]: lastWeek } },
        group: ['blockedAccountId'],
        having: literal('COUNT(id) >= 5'),
        raw: true,
      }).then(rows => rows.length),
      // Users with 3+ reports in 7 days
      UserReport.findAll({
        attributes: ['reportedAccountId'],
        where: { createdAt: { [Op.gte]: lastWeek } },
        group: ['reportedAccountId'],
        having: literal('COUNT(id) >= 3'),
        raw: true,
      }).then(rows => rows.length),
    ]);

    return res.json({
      success: true,
      data: {
        spammerCount,
        frequentlyBlockedCount,
        reportMagnetCount,
        totalSuspicious: spammerCount + frequentlyBlockedCount + reportMagnetCount,
      },
    });
  } catch (error) {
    console.error('Error fetching suspicious behavior stats:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Take action on a suspicious user ────────────────────────────────────────
const actionSuspiciousUser = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { action } = req.body; // 'warn', 'block'

    const user = await User.findOne({ where: { accountId } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (action === 'block') {
      await user.update({
        isActive: false,
        isFlagged: true,
        flagReason: `Blocked for suspicious behavior by admin on ${new Date().toISOString()}`,
      });
      return res.json({ success: true, message: 'User blocked for suspicious behavior' });
    } else if (action === 'warn') {
      await user.update({
        isFlagged: true,
        flagReason: `Warned for suspicious behavior by admin on ${new Date().toISOString()}`,
      });
      return res.json({ success: true, message: 'User warned for suspicious behavior' });
    } else {
      return res.status(400).json({ success: false, message: 'action must be warn or block' });
    }
  } catch (error) {
    console.error('Error actioning suspicious user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getSuspiciousUsers,
  getSuspiciousBehaviorStats,
  actionSuspiciousUser,
};
