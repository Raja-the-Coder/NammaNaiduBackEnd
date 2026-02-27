// WhatsApp Broadcast & Marketing Controller
// Handles sending marketing templates and bulk broadcasts to users

const User = require('../../models/User.model');
const Otp = require('../../models/Otp.model');
const { Op } = require('sequelize');
const {
  isWhatsAppConfigured,
  sendMarketingTemplate,
  broadcastWhatsApp,
} = require('../../services/whatsapp.service');

// ─────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────

const apiResponse = (res, success, message, data = null, error = null, statusCode = 200) => {
  return res.status(success ? statusCode : (statusCode >= 400 ? statusCode : 400))
    .json({ success, message, data: data ?? null, error: error ?? null });
};

// ─────────────────────────────────────────────
// 1. OTP Delivery Stats
// GET /api/whatsapp/otp-stats
// ─────────────────────────────────────────────

const getOtpDeliveryStats = async (req, res) => {
  try {
    const { from, to } = req.query;
    const where = {};
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(from);
      if (to) where.createdAt[Op.lte] = new Date(to);
    }

    const { sequelize } = require('../../config/database');

    const statusCounts = await Otp.findAll({
      where,
      attributes: [
        'deliveryStatus',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      group: ['deliveryStatus'],
      raw: true,
    });

    const recentFailed = await Otp.findAll({
      where: { ...where, deliveryStatus: 'failed' },
      attributes: ['id', 'phone', 'email', 'deliveryError', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 20,
      raw: true,
    });

    const summary = { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
    statusCounts.forEach((row) => {
      if (summary.hasOwnProperty(row.deliveryStatus)) {
        summary[row.deliveryStatus] = parseInt(row.count, 10);
      }
    });
    summary.total = Object.values(summary).reduce((a, b) => a + b, 0);
    summary.successRate = summary.total > 0
      ? (((summary.sent + summary.delivered + summary.read) / summary.total) * 100).toFixed(1) + '%'
      : '0%';

    return apiResponse(res, true, 'OTP delivery stats fetched', { summary, recentFailed });
  } catch (error) {
    console.error('Error fetching OTP stats:', error);
    return apiResponse(res, false, 'Failed to fetch OTP stats', null, error.message, 500);
  }
};

// ─────────────────────────────────────────────
// 2. Send Marketing Message to Single User
// POST /api/whatsapp/send-marketing
// ─────────────────────────────────────────────

const sendMarketingMessage = async (req, res) => {
  try {
    if (!isWhatsAppConfigured()) {
      return apiResponse(res, false, 'WhatsApp is not configured', null, 'NOT_CONFIGURED', 503);
    }

    const { phone, templateName, templateLanguage = 'en', params = [], headerImageUrl = null } = req.body;

    if (!phone) return apiResponse(res, false, 'phone is required', null, 'MISSING_PHONE', 400);
    if (!templateName) return apiResponse(res, false, 'templateName is required', null, 'MISSING_TEMPLATE', 400);

    const result = await sendMarketingTemplate(phone, templateName, templateLanguage, params, headerImageUrl);

    return apiResponse(res, true, 'Marketing message sent successfully', {
      phone,
      templateName,
      messageId: result.messageId,
    });
  } catch (error) {
    console.error('Error sending marketing message:', error);
    return apiResponse(res, false, error.message || 'Failed to send marketing message', null, error.message, 500);
  }
};

// ─────────────────────────────────────────────
// 3. Broadcast to Users
// POST /api/whatsapp/broadcast
// ─────────────────────────────────────────────

const broadcastMessage = async (req, res) => {
  try {
    if (!isWhatsAppConfigured()) {
      return apiResponse(res, false, 'WhatsApp is not configured', null, 'NOT_CONFIGURED', 503);
    }

    const {
      templateName,
      templateLanguage = 'en',
      headerImageUrl = null,
      delayMs = 500,
      targetAll = false,
      phones = [],
      filter = {},
      params = [],
      dynamicParams = false,
    } = req.body;

    if (!templateName) return apiResponse(res, false, 'templateName is required', null, 'MISSING_TEMPLATE', 400);
    if (!targetAll && phones.length === 0 && Object.keys(filter).length === 0) {
      return apiResponse(res, false, 'Provide targetAll, phones, or filter', null, 'NO_TARGET', 400);
    }

    const where = { phone: { [Op.ne]: null } };
    if (filter.gender) where.gender = filter.gender;

    let users = [];
    if (phones.length > 0) {
      users = await User.findAll({
        where: { phone: { [Op.in]: phones } },
        attributes: ['id', 'name', 'phone', 'accountId'],
        raw: true,
      });
    } else {
      users = await User.findAll({
        where,
        attributes: ['id', 'name', 'phone', 'accountId'],
        raw: true,
      });
    }

    if (users.length === 0) {
      return apiResponse(res, false, 'No users found matching the criteria', null, 'NO_USERS', 404);
    }

    const recipients = users.map((user) => ({
      phone: user.phone,
      params: dynamicParams
        ? [user.name || 'User', `https://nammanaidu.cloud/profile/${user.accountId}`]
        : params,
    }));

    console.log(`📢 Broadcast initiated — Template: ${templateName}, Recipients: ${recipients.length}`);

    // Small broadcast — wait and return result
    if (recipients.length <= 50) {
      const result = await broadcastWhatsApp(recipients, templateName, templateLanguage, headerImageUrl, delayMs);
      return apiResponse(res, true, 'Broadcast completed', {
        templateName,
        total: result.total,
        sent: result.sent,
        failed: result.failed,
        results: result.results,
      });
    }

    // Large broadcast — run in background
    broadcastWhatsApp(recipients, templateName, templateLanguage, headerImageUrl, delayMs)
      .then((result) => console.log(`📢 Broadcast done — Sent: ${result.sent}/${result.total}`))
      .catch((err) => console.error('📢 Broadcast error:', err.message));

    return apiResponse(res, true, `Broadcast started for ${recipients.length} users. Running in background.`, {
      templateName,
      totalRecipients: recipients.length,
      status: 'running',
    });
  } catch (error) {
    console.error('Error in broadcast:', error);
    return apiResponse(res, false, error.message || 'Broadcast failed', null, error.message, 500);
  }
};

// ─────────────────────────────────────────────
// 4a. Webhook GET — Meta Verification Challenge
// GET /api/whatsapp/webhook
// ─────────────────────────────────────────────

const handleWebhookGet = (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'nammanaidu_whatsapp_webhook';

  console.log('📨 Webhook verification request received:', { mode, token, challenge });

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ WhatsApp Webhook verified successfully');
    // Must respond with plain text challenge — NOT JSON
    return res.status(200).send(challenge);
  }

  console.warn('❌ Webhook verification failed — token mismatch');
  return res.status(403).json({ error: 'Webhook verification failed. Token mismatch.' });
};

// ─────────────────────────────────────────────
// 4b. Webhook POST — Delivery Status Updates
// POST /api/whatsapp/webhook
// ─────────────────────────────────────────────

const handleWebhookPost = async (req, res) => {
  try {
    const body = req.body;

    if (body.object !== 'whatsapp_business_account') {
      return res.sendStatus(404);
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      for (const change of (entry.changes || [])) {
        for (const status of (change.value?.statuses || [])) {
          const messageId = status.id;
          const statusType = status.status; // sent, delivered, read, failed

          console.log(`📨 Webhook POST — MsgID: ${messageId}, Status: ${statusType}`);

          try {
            const otpRecord = await Otp.findOne({ where: { whatsappMessageId: messageId } });
            if (otpRecord) {
              otpRecord.deliveryStatus = statusType;
              if (statusType === 'failed' && status.errors?.length > 0) {
                otpRecord.deliveryError = status.errors[0]?.title || 'Delivery failed';
              }
              await otpRecord.save();
              console.log(`✅ OTP status updated — Phone: ${otpRecord.phone}, Status: ${statusType}`);
            }
          } catch (dbErr) {
            console.error('Error updating OTP delivery status:', dbErr.message);
          }
        }
      }
    }

    // Always respond 200 quickly — Meta will retry if you don't
    return res.sendStatus(200);
  } catch (error) {
    console.error('Webhook POST error:', error);
    return res.sendStatus(500);
  }
};

module.exports = {
  getOtpDeliveryStats,
  sendMarketingMessage,
  broadcastMessage,
  handleWebhookGet,
  handleWebhookPost,
};
