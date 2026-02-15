const { v4: uuidv4 } = require('uuid');
const { getFirestore } = require('../../config/firebase-admin');
const admin = require('firebase-admin');
const { StreamChat } = require('stream-chat');
const User = require('../../models/User.model');
const PersonPhoto = require('../../models/PersonPhoto.model');
const ProfileAction = require('../../models/ProfileAction.model');
const ChatTokenUsage = require('../../models/ChatTokenUsage.model');
const ChatReport = require('../../models/ChatReport.model');
const { uploadBase64Image } = require('../../services/cloudinary.service');
const { successResponse, errorResponse } = require('../../utils/response');
const { Op } = require('sequelize');
const { getBlockedAccountIds } = require('../users/safety.controller');

const db = () => getFirestore();

const apiKey = process.env.STREAM_CHAT_API_KEY;
const apiSecret = process.env.STREAM_CHAT_API_SECRET;
const streamClient = apiKey && apiSecret ? new StreamChat(apiKey, apiSecret) : null;

/**
 * Get a Stream Chat user token for the authenticated user.
 * GET /api/chat/stream-token
 * Requires STREAM_CHAT_API_KEY and STREAM_CHAT_API_SECRET in env.
 */
const getStreamToken = async (req, res) => {
  if (!streamClient) {
    return errorResponse(
      res,
      'Stream Chat is not configured. Set STREAM_CHAT_API_KEY and STREAM_CHAT_API_SECRET.',
      503
    );
  }
  try {
    const userId = req.accountId;
    if (!userId) {
      return errorResponse(res, 'Unauthorized', 401);
    }
    const token = streamClient.createToken(userId);
    return successResponse(res, { token });
  } catch (err) {
    return errorResponse(res, err.message || 'Failed to create Stream token', 500);
  }
};
const FieldValue = admin.firestore.FieldValue;

/**
 * Create or get existing conversation between two users.
 * For new conversations: only allow if mutual match (interest accepted or both sent interest).
 * POST /api/chat/conversations
 */
const createConversation = async (req, res) => {
  try {
    const { otherUserId } = req.body;
    const currentUserId = req.accountId;

    if (!otherUserId) {
      return errorResponse(res, 'otherUserId is required', 400);
    }

    if (currentUserId === otherUserId) {
      return errorResponse(res, 'Cannot create conversation with yourself', 400);
    }

    // Block check: prevent conversation if either user has blocked the other
    const blockedIds = await getBlockedAccountIds(currentUserId);
    if (blockedIds.includes(otherUserId)) {
      return errorResponse(res, 'Cannot start conversation with this user', 403);
    }

    // Verified-only messaging check
    const targetUser = await User.findOne({ where: { accountId: otherUserId }, attributes: ['verifiedOnlyChat', 'profileveriffied'] });
    if (targetUser && targetUser.verifiedOnlyChat) {
      const currentUser = await User.findOne({ where: { accountId: currentUserId }, attributes: ['profileveriffied'] });
      if (!currentUser || currentUser.profileveriffied !== 1) {
        return errorResponse(res, 'This user only accepts messages from verified profiles. Please verify your profile first.', 403);
      }
    }

    const conversationsRef = db().collection('conversations');
    const existingSnapshot = await conversationsRef
      .where('participants', 'array-contains', currentUserId)
      .get();

    let conversationId = null;
    let conversationData = null;

    for (const doc of existingSnapshot.docs) {
      const data = doc.data();
      if (data.participants && data.participants.includes(otherUserId)) {
        conversationId = doc.id;
        conversationData = { id: doc.id, ...data };
        break;
      }
    }

    if (conversationId) {
      return successResponse(res, { conversationId, conversation: conversationData }, 200);
    }

    // New conversation: enforce mutual match
    const [iSent, theySent] = await Promise.all([
      ProfileAction.findOne({
        where: { userId: currentUserId, targetUserId: otherUserId, actionType: { [Op.in]: ['interest', 'accept'] } },
      }),
      ProfileAction.findOne({
        where: { userId: otherUserId, targetUserId: currentUserId, actionType: { [Op.in]: ['interest', 'accept'] } },
      }),
    ]);
    const mutualMatch = (iSent && theySent) &&
      ((iSent.actionType === 'interest' && theySent.actionType === 'accept') ||
       (iSent.actionType === 'accept' && theySent.actionType === 'interest') ||
       (iSent.actionType === 'interest' && theySent.actionType === 'interest'));

    if (!mutualMatch) {
      return errorResponse(res, 'You can only start a conversation after mutual interest or acceptance.', 403);
    }

    const [currentUser, otherUser] = await Promise.all([
      User.findOne({
        where: { accountId: currentUserId },
        include: [{ model: PersonPhoto, as: 'personPhoto', required: false, attributes: ['photo1'] }],
      }),
      User.findOne({
        where: { accountId: otherUserId },
        include: [{ model: PersonPhoto, as: 'personPhoto', required: false, attributes: ['photo1'] }],
      }),
    ]);

    if (!currentUser || !otherUser) {
      return errorResponse(res, 'User not found', 404);
    }

    conversationId = `conv_${uuidv4()}`;
    conversationData = {
      conversationId,
      participants: [currentUserId, otherUserId],
      participantsData: {
        [currentUserId]: {
          name: currentUser.name,
          userCode: currentUser.userCode || null,
          photoUrl: (currentUser.personPhoto && currentUser.personPhoto.photo1) || null,
        },
        [otherUserId]: {
          name: otherUser.name,
          userCode: otherUser.userCode || null,
          photoUrl: (otherUser.personPhoto && otherUser.personPhoto.photo1) || null,
        },
      },
      lastMessage: null,
      lastMessageTime: null,
      unreadCount: { [currentUserId]: 0, [otherUserId]: 0 },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      isBlocked: false,
      blockedBy: null,
    };

    await conversationsRef.doc(conversationId).set(conversationData);

    const userConvPayload = (otherU, otherName, otherPhoto) => ({
      conversationId,
      otherUserId: otherU,
      otherUserName: otherName,
      otherUserPhoto: otherPhoto || null,
      lastMessage: null,
      lastMessageTime: null,
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
      isArchived: false,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await Promise.all([
      db().collection('userConversations').doc(currentUserId).collection('conversations').doc(conversationId).set(
        userConvPayload(otherUserId, otherUser.name, otherUser.personPhoto && otherUser.personPhoto.photo1)
      ),
      db().collection('userConversations').doc(otherUserId).collection('conversations').doc(conversationId).set(
        userConvPayload(currentUserId, currentUser.name, currentUser.personPhoto && currentUser.personPhoto.photo1)
      ),
    ]);

    return successResponse(res, { conversationId, conversation: conversationData }, 201);
  } catch (error) {
    console.error('Error creating conversation:', error);
    return errorResponse(res, `Failed to create conversation: ${error.message}`, 500);
  }
};

/**
 * Send message
 * POST /api/chat/messages
 */
const sendMessage = async (req, res) => {
  try {
    const { conversationId, text, type = 'text', imageUrl = null, documentUrl = null } = req.body;
    const senderId = req.accountId;

    // For image messages, text can be empty
    if (!conversationId) {
      return errorResponse(res, 'conversationId is required', 400);
    }
    if (type === 'text' && (text == null || String(text).trim() === '')) {
      return errorResponse(res, 'text is required for text messages', 400);
    }

    const conversationRef = db().collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return errorResponse(res, 'Conversation not found', 404);
    }

    const conversationData = conversationDoc.data();

    if (!conversationData.participants.includes(senderId)) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    if (conversationData.isBlocked) {
      return errorResponse(res, 'This conversation is blocked', 403);
    }

    const receiverId = conversationData.participants.find((p) => p !== senderId);

    // Token deduction: check if this is the sender's first message in this conversation
    const existingUsage = await ChatTokenUsage.findOne({
      where: { userId: senderId, conversationId },
    });

    if (!existingUsage) {
      // First message in this conversation - deduct a token
      const sender = await User.findOne({ where: { accountId: senderId } });
      if (!sender || (sender.profileViewTokens || 0) < 1) {
        return errorResponse(res, 'Insufficient tokens. Please purchase a subscription to get more tokens.', 403, 'INSUFFICIENT_TOKENS');
      }
      sender.profileViewTokens = (sender.profileViewTokens || 0) - 1;
      await sender.save();

      await ChatTokenUsage.create({
        userId: senderId,
        conversationId,
        otherUserId: receiverId,
      });
    }

    const messageId = `msg_${uuidv4()}`;
    const textStr = text ? String(text).trim().slice(0, 5000) : '';

    const messageData = {
      messageId,
      conversationId,
      senderId,
      receiverId,
      text: textStr,
      type: type || 'text',
      imageUrl: imageUrl || null,
      documentUrl: documentUrl || null,
      timestamp: FieldValue.serverTimestamp(),
      isRead: false,
      readAt: null,
      isDelivered: true,
      deliveredAt: FieldValue.serverTimestamp(),
      isDeleted: false,
      deletedAt: null,
      metadata: {
        deviceType: req.body.deviceType || 'web',
        ipAddress: (req.ip || req.connection?.remoteAddress) || '',
      },
    };

    await conversationRef.collection('messages').doc(messageId).set(messageData);

    await conversationRef.update({
      lastMessage: { text: textStr, senderId, timestamp: FieldValue.serverTimestamp(), type: type || 'text' },
      lastMessageTime: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      [`unreadCount.${receiverId}`]: FieldValue.increment(1),
    });

    const previewText = type === 'image' ? '📷 Image' : textStr;

    await Promise.all([
      db().collection('userConversations').doc(senderId).collection('conversations').doc(conversationId).update({
        lastMessage: previewText,
        lastMessageTime: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }),
      db().collection('userConversations').doc(receiverId).collection('conversations').doc(conversationId).update({
        lastMessage: previewText,
        lastMessageTime: FieldValue.serverTimestamp(),
        unreadCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return successResponse(res, { messageId, message: { ...messageData, timestamp: new Date() } }, 201);
  } catch (error) {
    console.error('Error sending message:', error);
    return errorResponse(res, `Failed to send message: ${error.message}`, 500);
  }
};

/**
 * Mark messages as read
 * PUT /api/chat/conversations/:conversationId/read
 */
const markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.accountId;

    const conversationRef = db().collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return errorResponse(res, 'Conversation not found', 404);
    }

    const conversationData = conversationDoc.data();
    if (!conversationData.participants.includes(userId)) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    const unreadSnapshot = await conversationRef
      .collection('messages')
      .where('receiverId', '==', userId)
      .where('isRead', '==', false)
      .get();

    const batch = db().batch();
    unreadSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { isRead: true, readAt: FieldValue.serverTimestamp() });
    });
    batch.update(conversationRef, { [`unreadCount.${userId}`]: 0 });
    batch.update(
      db().collection('userConversations').doc(userId).collection('conversations').doc(conversationId),
      { unreadCount: 0 }
    );
    await batch.commit();

    return successResponse(res, { messagesMarkedAsRead: unreadSnapshot.size });
  } catch (error) {
    console.error('Error marking as read:', error);
    return errorResponse(res, `Failed to mark as read: ${error.message}`, 500);
  }
};

/**
 * Block conversation
 * PUT /api/chat/conversations/:conversationId/block
 */
const blockConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.accountId;

    const conversationRef = db().collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return errorResponse(res, 'Conversation not found', 404);
    }
    const conversationData = conversationDoc.data();
    if (!conversationData.participants.includes(userId)) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    await conversationRef.update({
      isBlocked: true,
      blockedBy: userId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return successResponse(res, { message: 'Conversation blocked successfully' });
  } catch (error) {
    console.error('Error blocking conversation:', error);
    return errorResponse(res, `Failed to block conversation: ${error.message}`, 500);
  }
};

/**
 * Unblock conversation
 * PUT /api/chat/conversations/:conversationId/unblock
 */
const unblockConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.accountId;

    const conversationRef = db().collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return errorResponse(res, 'Conversation not found', 404);
    }
    const conversationData = conversationDoc.data();
    if (!conversationData.participants.includes(userId)) {
      return errorResponse(res, 'Unauthorized', 403);
    }
    if (conversationData.blockedBy !== userId) {
      return errorResponse(res, 'Only the user who blocked can unblock', 403);
    }

    await conversationRef.update({
      isBlocked: false,
      blockedBy: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return successResponse(res, { message: 'Conversation unblocked successfully' });
  } catch (error) {
    console.error('Error unblocking conversation:', error);
    return errorResponse(res, `Failed to unblock conversation: ${error.message}`, 500);
  }
};

/**
 * Report a conversation
 * POST /api/chat/conversations/:conversationId/report
 */
const reportConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { reason, description } = req.body;
    const reporterAccountId = req.accountId;

    if (!reason) {
      return errorResponse(res, 'reason is required', 400);
    }

    const validReasons = ['inappropriate', 'harassment', 'spam', 'fake_profile', 'other'];
    if (!validReasons.includes(reason)) {
      return errorResponse(res, `reason must be one of: ${validReasons.join(', ')}`, 400);
    }

    const conversationRef = db().collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return errorResponse(res, 'Conversation not found', 404);
    }

    const conversationData = conversationDoc.data();
    if (!conversationData.participants.includes(reporterAccountId)) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    const reportedAccountId = conversationData.participants.find((p) => p !== reporterAccountId);

    // Check if already reported this conversation
    const existing = await ChatReport.findOne({
      where: { conversationId, reporterAccountId, status: 'pending' },
    });
    if (existing) {
      return errorResponse(res, 'You have already reported this conversation', 409);
    }

    const report = await ChatReport.create({
      conversationId,
      reporterAccountId,
      reportedAccountId,
      reason,
      description: description || null,
    });

    return successResponse(res, { report }, 201);
  } catch (error) {
    console.error('Error reporting conversation:', error);
    return errorResponse(res, `Failed to report conversation: ${error.message}`, 500);
  }
};

/**
 * Delete a conversation (soft delete for the requesting user)
 * DELETE /api/chat/conversations/:conversationId
 */
const deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.accountId;

    const conversationRef = db().collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return errorResponse(res, 'Conversation not found', 404);
    }

    const conversationData = conversationDoc.data();
    if (!conversationData.participants.includes(userId)) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    // Remove from user's conversation list (soft delete)
    const userConvRef = db()
      .collection('userConversations')
      .doc(userId)
      .collection('conversations')
      .doc(conversationId);

    await userConvRef.delete();

    // Check if the other user has also deleted the conversation
    const otherUserId = conversationData.participants.find((p) => p !== userId);
    const otherConvRef = db()
      .collection('userConversations')
      .doc(otherUserId)
      .collection('conversations')
      .doc(conversationId);

    const otherConvDoc = await otherConvRef.get();

    // If both users have deleted, remove the entire conversation and messages
    if (!otherConvDoc.exists) {
      // Delete all messages in the conversation
      const messagesRef = conversationRef.collection('messages');
      const messagesSnapshot = await messagesRef.get();
      const batch = db().batch();
      messagesSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
      batch.delete(conversationRef);
      await batch.commit();
    }

    return successResponse(res, { message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return errorResponse(res, `Failed to delete conversation: ${error.message}`, 500);
  }
};

/**
 * Upload a chat image to Cloudinary
 * POST /api/chat/upload-image
 */
const uploadChatImage = async (req, res) => {
  try {
    const { image, conversationId } = req.body;
    const userId = req.accountId;

    if (!image) {
      return errorResponse(res, 'image (base64) is required', 400);
    }
    if (!conversationId) {
      return errorResponse(res, 'conversationId is required', 400);
    }

    // Verify user is participant
    const conversationRef = db().collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return errorResponse(res, 'Conversation not found', 404);
    }
    const conversationData = conversationDoc.data();
    if (!conversationData.participants.includes(userId)) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    const folder = `nammanaidu/chat/${conversationId}`;
    const result = await uploadBase64Image(image, folder);

    return successResponse(res, { imageUrl: result.url, publicId: result.publicId }, 201);
  } catch (error) {
    console.error('Error uploading chat image:', error);
    return errorResponse(res, `Failed to upload image: ${error.message}`, 500);
  }
};

module.exports = {
  createConversation,
  sendMessage,
  markAsRead,
  blockConversation,
  unblockConversation,
  getStreamToken,
  reportConversation,
  deleteConversation,
  uploadChatImage,
};
