const UserReport = require('../../models/UserReport.model');
const UserBlock = require('../../models/UserBlock.model');
const User = require('../../models/User.model');
const { Op } = require('sequelize');

// ─── List all user reports (with filters + pagination) ────────────────────────
const getReports = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { status, reason, from, to } = req.query;

    const where = {};
    if (status) where.status = status;
    if (reason) where.reason = reason;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(from);
      if (to) where.createdAt[Op.lte] = new Date(to);
    }

    const { count, rows } = await UserReport.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'reporter',
          attributes: ['accountId', 'name', 'userCode', 'phone', 'gender'],
        },
        {
          model: User,
          as: 'reported',
          attributes: ['accountId', 'name', 'userCode', 'phone', 'gender', 'isActive', 'isFlagged', 'reportCount'],
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
    console.error('Error fetching reports:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Get single report detail ─────────────────────────────────────────────────
const getReportDetail = async (req, res) => {
  try {
    const report = await UserReport.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'reporter',
          attributes: ['accountId', 'name', 'userCode', 'phone', 'email', 'gender'],
        },
        {
          model: User,
          as: 'reported',
          attributes: ['accountId', 'name', 'userCode', 'phone', 'email', 'gender', 'isActive', 'isFlagged', 'reportCount'],
        },
      ],
    });

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    return res.json({ success: true, data: report });
  } catch (error) {
    console.error('Error fetching report detail:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Update report (admin review) ────────────────────────────────────────────
const updateReport = async (req, res) => {
  try {
    const { status, adminNotes, actionTaken } = req.body;
    const report = await UserReport.findByPk(req.params.id);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const updateFields = {};
    if (status) updateFields.status = status;
    if (adminNotes !== undefined) updateFields.adminNotes = adminNotes;
    if (actionTaken) updateFields.actionTaken = actionTaken;
    updateFields.reviewedBy = req.adminId;
    updateFields.reviewedAt = new Date();

    await report.update(updateFields);

    // If action is to block the reported user
    if (actionTaken === 'blocked') {
      await User.update(
        { isActive: false },
        { where: { accountId: report.reportedAccountId } }
      );
    }

    return res.json({ success: true, message: 'Report updated', data: report });
  } catch (error) {
    console.error('Error updating report:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── List flagged users ───────────────────────────────────────────────────────
const getFlaggedUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { count, rows } = await User.findAndCountAll({
      where: { isFlagged: true },
      attributes: ['id', 'accountId', 'name', 'userCode', 'phone', 'email', 'gender', 'isActive', 'isFlagged', 'flagReason', 'reportCount', 'createdAt'],
      order: [['reportCount', 'DESC']],
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
    console.error('Error fetching flagged users:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Review flagged user (clear flag, warn, or block) ────────────────────────
const reviewFlaggedUser = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { action, adminNotes } = req.body; // action: 'clear', 'warn', 'block'

    const user = await User.findOne({ where: { accountId } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const updateFields = {};
    let message = '';

    switch (action) {
      case 'clear':
        updateFields.isFlagged = false;
        updateFields.flagReason = null;
        message = 'Flag cleared';
        break;
      case 'warn':
        updateFields.isFlagged = false;
        updateFields.flagReason = `Warned by admin on ${new Date().toISOString()}`;
        message = 'User warned, flag cleared';
        break;
      case 'block':
        updateFields.isActive = false;
        updateFields.isFlagged = false;
        updateFields.flagReason = `Blocked by admin on ${new Date().toISOString()}`;
        message = 'User blocked';
        break;
      default:
        return res.status(400).json({ success: false, message: 'action must be clear, warn, or block' });
    }

    await user.update(updateFields);

    // Update all pending reports for this user to 'action_taken'
    if (action === 'block' || action === 'warn') {
      await UserReport.update(
        {
          status: 'action_taken',
          actionTaken: action === 'block' ? 'blocked' : 'warned',
          adminNotes: adminNotes || null,
          reviewedBy: req.adminId,
          reviewedAt: new Date(),
        },
        { where: { reportedAccountId: accountId, status: 'pending' } }
      );
    }

    return res.json({ success: true, message, data: { accountId, action } });
  } catch (error) {
    console.error('Error reviewing flagged user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── List all blocks ──────────────────────────────────────────────────────────
const getBlocksList = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { count, rows } = await UserBlock.findAndCountAll({
      include: [
        { model: User, as: 'blocker', attributes: ['accountId', 'name', 'userCode', 'gender'] },
        { model: User, as: 'blocked', attributes: ['accountId', 'name', 'userCode', 'gender'] },
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
    console.error('Error fetching blocks:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Abuse dashboard stats ────────────────────────────────────────────────────
const getAbuseStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalReports, pendingReports, flaggedUsers, blocksToday, reportsToday] = await Promise.all([
      UserReport.count(),
      UserReport.count({ where: { status: 'pending' } }),
      User.count({ where: { isFlagged: true } }),
      UserBlock.count({ where: { createdAt: { [Op.gte]: today } } }),
      UserReport.count({ where: { createdAt: { [Op.gte]: today } } }),
    ]);

    return res.json({
      success: true,
      data: {
        totalReports,
        pendingReports,
        flaggedUsers,
        blocksToday,
        reportsToday,
      },
    });
  } catch (error) {
    console.error('Error fetching abuse stats:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getReports,
  getReportDetail,
  updateReport,
  getFlaggedUsers,
  reviewFlaggedUser,
  getBlocksList,
  getAbuseStats,
};
