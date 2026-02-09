const { Op } = require('sequelize');
const Conversation = require('../../models/Conversation.model');
const Message = require('../../models/Message.model');
const User = require('../../models/User.model');
const ProfileAction = require('../../models/ProfileAction.model');

// GET /api/messages/conversations - list my conversations
const getConversations = async (req, res) => {
  try {
    const accountId = req.accountId;
    const conversations = await Conversation.findAll({
      where: { [Op.or]: [{ user1Id: accountId }, { user2Id: accountId }] },
      order: [['lastMessageAt', 'DESC']],
      include: [
        { model: User, as: 'user1', attributes: ['accountId', 'name', 'userCode'] },
        { model: User, as: 'user2', attributes: ['accountId', 'name', 'userCode'] },
      ],
    });
    const list = conversations.map((c) => {
      const j = c.toJSON();
      const other = j.user1Id === accountId ? j.user2 : j.user1;
      return {
        id: j.id,
        otherUser: other,
        lastMessageAt: j.lastMessageAt,
      };
    });
    res.json({ success: true, data: list });
  } catch (error) {
    console.error('Error getting conversations:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to get conversations' });
  }
};

// GET /api/messages/conversations/:conversationId - get messages in a conversation
const getMessages = async (req, res) => {
  try {
    const accountId = req.accountId;
    const { conversationId } = req.params;
    const conv = await Conversation.findByPk(conversationId);
    if (!conv) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }
    if (conv.user1Id !== accountId && conv.user2Id !== accountId) {
      return res.status(403).json({ success: false, message: 'Not allowed to access this conversation' });
    }
    const messages = await Message.findAll({
      where: { conversationId },
      order: [['createdAt', 'ASC']],
      include: [{ model: User, as: 'sender', attributes: ['accountId', 'name'] }],
    });
    res.json({ success: true, data: messages.map((m) => m.toJSON()) });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to get messages' });
  }
};

// POST /api/messages/conversations - find or create conversation with another user (only if mutual match)
const findOrCreateConversation = async (req, res) => {
  try {
    const accountId = req.accountId;
    const { otherAccountId } = req.body;
    if (!otherAccountId) {
      return res.status(400).json({ success: false, message: 'otherAccountId is required' });
    }
    if (otherAccountId === accountId) {
      return res.status(400).json({ success: false, message: 'Cannot message yourself' });
    }
    const other = await User.findOne({ where: { accountId: otherAccountId }, attributes: ['accountId'] });
    if (!other) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const u1 = accountId < otherAccountId ? accountId : otherAccountId;
    const u2 = accountId < otherAccountId ? otherAccountId : accountId;
    let conv = await Conversation.findOne({ where: { user1Id: u1, user2Id: u2 } });
    if (!conv) {
      const otherSentInterest = await ProfileAction.findOne({
        where: { userId: otherAccountId, targetUserId: accountId, actionType: 'interest' },
      });
      const iSentInterest = await ProfileAction.findOne({
        where: { userId: accountId, targetUserId: otherAccountId, actionType: 'interest' },
      });
      const otherAccepted = await ProfileAction.findOne({
        where: { userId: otherAccountId, targetUserId: accountId, actionType: 'accept' },
      });
      const iAccepted = await ProfileAction.findOne({
        where: { userId: accountId, targetUserId: otherAccountId, actionType: 'accept' },
      });
      const mutualMatch = (iSentInterest && otherAccepted) || (otherSentInterest && iAccepted) || (iSentInterest && otherSentInterest);
      if (!mutualMatch) {
        return res.status(403).json({
          success: false,
          message: 'You can only message after mutual interest or acceptance.',
        });
      }
      conv = await Conversation.create({ user1Id: u1, user2Id: u2 });
    }
    res.json({ success: true, data: conv.toJSON() });
  } catch (error) {
    console.error('Error finding/creating conversation:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create conversation' });
  }
};

// POST /api/messages/conversations/:conversationId/messages - send a message
const sendMessage = async (req, res) => {
  try {
    const accountId = req.accountId;
    const { conversationId } = req.params;
    const { body } = req.body;
    if (!body || typeof body !== 'string' || !body.trim()) {
      return res.status(400).json({ success: false, message: 'Message body is required' });
    }
    const conv = await Conversation.findByPk(conversationId);
    if (!conv) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }
    if (conv.user1Id !== accountId && conv.user2Id !== accountId) {
      return res.status(403).json({ success: false, message: 'Not allowed to send in this conversation' });
    }
    const msg = await Message.create({
      conversationId,
      senderId: accountId,
      body: body.trim().slice(0, 5000),
    });
    conv.lastMessageAt = new Date();
    await conv.save();
    const withSender = await Message.findByPk(msg.id, {
      include: [{ model: User, as: 'sender', attributes: ['accountId', 'name'] }],
    });
    res.status(201).json({ success: true, data: withSender.toJSON() });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to send message' });
  }
};

// PUT /api/messages/conversations/:conversationId/messages/:messageId/read - mark as read
const markMessageRead = async (req, res) => {
  try {
    const accountId = req.accountId;
    const { conversationId, messageId } = req.params;
    const conv = await Conversation.findByPk(conversationId);
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });
    if (conv.user1Id !== accountId && conv.user2Id !== accountId) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }
    const msg = await Message.findOne({ where: { id: messageId, conversationId } });
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    if (msg.senderId !== accountId) {
      msg.isRead = true;
      await msg.save();
    }
    res.json({ success: true, data: msg.toJSON() });
  } catch (error) {
    console.error('Error marking message read:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to mark read' });
  }
};

module.exports = {
  getConversations,
  getMessages,
  findOrCreateConversation,
  sendMessage,
  markMessageRead,
};
