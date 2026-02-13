const { getFirestore } = require('../../config/firebase-admin');
const ChatReport = require('../../models/ChatReport.model');
const User = require('../../models/User.model');
const { Op } = require('sequelize');

const db = () => getFirestore();

/**
 * List all conversations from Firestore (paginated)
 * GET /api/admin/chat/conversations
 */
const listConversations = async (req, res) => {
  try {
    const { limit = 20, startAfter, search } = req.query;
    const limitNum = Math.min(parseInt(limit) || 20, 100);

    let query = db().collection('conversations').orderBy('updatedAt', 'desc');

    if (startAfter) {
      const startDoc = await db().collection('conversations').doc(startAfter).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc);
      }
    }

    query = query.limit(limitNum);
    const snapshot = await query.get();

    const conversations = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      conversations.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt ? data.createdAt.toDate() : null,
        updatedAt: data.updatedAt ? data.updatedAt.toDate() : null,
        lastMessageTime: data.lastMessageTime ? data.lastMessageTime.toDate() : null,
      });
    }

    // If search is provided, filter by participant name (client-side for Firestore)
    let filtered = conversations;
    if (search) {
      const s = search.toLowerCase();
      filtered = conversations.filter((c) => {
        if (!c.participantsData) return false;
        return Object.values(c.participantsData).some(
          (p) => p.name && p.name.toLowerCase().includes(s)
        );
      });
    }

    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return res.json({
      success: true,
      data: {
        conversations: filtered,
        nextCursor: lastDoc ? lastDoc.id : null,
        hasMore: snapshot.docs.length === limitNum,
      },
    });
  } catch (error) {
    console.error('Error listing admin conversations:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get messages for a specific conversation
 * GET /api/admin/chat/conversations/:conversationId/messages
 */
const getConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, startAfter } = req.query;
    const limitNum = Math.min(parseInt(limit) || 50, 200);

    const conversationRef = db().collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    let query = conversationRef.collection('messages').orderBy('timestamp', 'asc');

    if (startAfter) {
      const startDoc = await conversationRef.collection('messages').doc(startAfter).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc);
      }
    }

    query = query.limit(limitNum);
    const snapshot = await query.get();

    const messages = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: data.timestamp ? data.timestamp.toDate() : null,
        readAt: data.readAt ? data.readAt.toDate() : null,
        deliveredAt: data.deliveredAt ? data.deliveredAt.toDate() : null,
      };
    });

    const convData = conversationDoc.data();

    return res.json({
      success: true,
      data: {
        conversation: {
          id: conversationDoc.id,
          ...convData,
          createdAt: convData.createdAt ? convData.createdAt.toDate() : null,
          updatedAt: convData.updatedAt ? convData.updatedAt.toDate() : null,
        },
        messages,
        hasMore: snapshot.docs.length === limitNum,
      },
    });
  } catch (error) {
    console.error('Error fetching admin conversation messages:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * List all chat reports (paginated, filterable)
 * GET /api/admin/chat/reports
 */
const listReports = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, reason } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) where.status = status;
    if (reason) where.reason = reason;

    const { count, rows: reports } = await ChatReport.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    // Enrich with user names
    const accountIds = new Set();
    reports.forEach((r) => {
      accountIds.add(r.reporterAccountId);
      accountIds.add(r.reportedAccountId);
    });

    const users = await User.findAll({
      where: { accountId: { [Op.in]: [...accountIds] } },
      attributes: ['accountId', 'name', 'userCode'],
    });

    const userMap = {};
    users.forEach((u) => {
      userMap[u.accountId] = { name: u.name, userCode: u.userCode };
    });

    const enriched = reports.map((r) => ({
      ...r.toJSON(),
      reporter: userMap[r.reporterAccountId] || null,
      reported: userMap[r.reportedAccountId] || null,
    }));

    return res.json({
      success: true,
      data: {
        reports: enriched,
        total: count,
        page: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error listing chat reports:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update a chat report (status, admin notes)
 * PUT /api/admin/chat/reports/:reportId
 */
const updateReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, adminNotes } = req.body;
    const adminId = req.adminId;

    const report = await ChatReport.findByPk(reportId);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (status) {
      const validStatuses = ['pending', 'reviewed', 'action_taken', 'dismissed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: `Invalid status. Must be: ${validStatuses.join(', ')}` });
      }
      report.status = status;
    }

    if (adminNotes !== undefined) {
      report.adminNotes = adminNotes;
    }

    report.reviewedBy = adminId;
    report.reviewedAt = new Date();
    await report.save();

    return res.json({ success: true, data: { report } });
  } catch (error) {
    console.error('Error updating chat report:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  listConversations,
  getConversationMessages,
  listReports,
  updateReport,
};
