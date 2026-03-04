// WhatsApp Service — Fast2SMS WABA (WhatsApp Business API via BSP)
// Fast2SMS owns an approved WhatsApp Business number and relays messages on our behalf.
// Docs: https://www.fast2sms.com/

const FAST2SMS_BASE_URL = 'https://www.fast2sms.com/dev';

// ─────────────────────────────────────────────
// Config & Helpers
// ─────────────────────────────────────────────

const getFast2SMSConfig = () => {
  const apiKey = process.env.FAST2SMS_API_KEY;
  const templateName = process.env.FAST2SMS_OTP_TEMPLATE_NAME || 'otp_verification';
  const templateLanguage = process.env.FAST2SMS_OTP_TEMPLATE_LANGUAGE || 'en';
  return { apiKey, templateName, templateLanguage };
};

const isWhatsAppConfigured = () => {
  const { apiKey } = getFast2SMSConfig();
  return !!apiKey;
};

/**
 * Normalize phone number to 10-digit Indian mobile number.
 * Fast2SMS WABA expects: "9876543210" (no country code, no +)
 */
const normalizePhone = (phone) => {
  return `${phone}`.replace(/^\+?91/, '').replace(/\D/g, '').slice(-10);
};

/**
 * Core function to call Fast2SMS WhatsApp API
 */
const callFast2SMS = async (payload) => {
  const { apiKey } = getFast2SMSConfig();

  if (!apiKey) {
    throw new Error('WhatsApp is not configured. Set FAST2SMS_API_KEY in .env');
  }

  const url = `${FAST2SMS_BASE_URL}/whatsapp`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (response.ok && (data.return === true || data.status_code === 200 || data.message_id || data?.data?.message_id)) {
    const messageId = data?.data?.message_id || data?.message_id || data?.id || null;
    return { success: true, messageId };
  }

  const errorMsg =
    data?.message ||
    data?.error ||
    data?.error_message ||
    'Fast2SMS API request failed';

  throw new Error(errorMsg);
};

// ─────────────────────────────────────────────
// 1. OTP — Send via Authentication Template
// ─────────────────────────────────────────────

/**
 * Send OTP via WhatsApp using Fast2SMS WABA.
 * Template must be approved in Fast2SMS dashboard before use.
 *
 * @param {string} phone - Phone number with country code (e.g., "+919876543210")
 * @param {string} otp - The 6-digit OTP code
 * @returns {Promise<{ success, messageId, provider }>}
 */
const sendOtpViaWhatsApp = async (phone, otp) => {
  const { templateName, templateLanguage } = getFast2SMSConfig();
  const normalizedPhone = normalizePhone(phone);

  try {
    const result = await callFast2SMS({
      phone_number: normalizedPhone,
      template_name: templateName,
      template_language: templateLanguage,
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: String(otp) }],
        },
      ],
    });

    console.log('✅ WhatsApp OTP sent to:', normalizedPhone, '| MsgID:', result.messageId);
    return { success: true, message: 'OTP sent via WhatsApp', messageId: result.messageId, provider: 'fast2sms_waba' };
  } catch (error) {
    console.error('❌ WhatsApp OTP send failed:', error.message);
    throw new Error(`WhatsApp OTP Error: ${error.message}`);
  }
};

// ─────────────────────────────────────────────
// 2. Marketing — Send via Approved Template
// ─────────────────────────────────────────────

/**
 * Send a marketing/utility message via a pre-approved WhatsApp template.
 *
 * @param {string} phone - Recipient phone number with country code
 * @param {string} templateName - Name of the approved Fast2SMS template
 * @param {string} templateLanguage - Template language code (e.g., 'en')
 * @param {Array<string>} bodyParams - Array of variable values for {{1}}, {{2}}, etc.
 * @param {string|null} headerImageUrl - Optional image URL for template header
 * @returns {Promise<{ success, messageId, provider }>}
 */
const sendMarketingTemplate = async (phone, templateName, templateLanguage = 'en', bodyParams = [], headerImageUrl = null) => {
  const normalizedPhone = normalizePhone(phone);

  const components = [];

  // Add header image if provided
  if (headerImageUrl) {
    components.push({
      type: 'header',
      parameters: [{ type: 'image', image: { link: headerImageUrl } }],
    });
  }

  // Add body parameters
  if (bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((param) => ({ type: 'text', text: String(param) })),
    });
  }

  try {
    const result = await callFast2SMS({
      phone_number: normalizedPhone,
      template_name: templateName,
      template_language: templateLanguage,
      components,
    });

    console.log('✅ WhatsApp marketing message sent to:', normalizedPhone, '| MsgID:', result.messageId);
    return { success: true, messageId: result.messageId, provider: 'fast2sms_waba' };
  } catch (error) {
    console.error('❌ WhatsApp marketing send failed to:', normalizedPhone, '|', error.message);
    throw new Error(`WhatsApp Marketing Error: ${error.message}`);
  }
};

// ─────────────────────────────────────────────
// 3. Broadcast — Send to Multiple Users
// ─────────────────────────────────────────────

/**
 * Broadcast a WhatsApp marketing template to a list of recipients.
 *
 * @param {Array<{ phone: string, params: string[] }>} recipients
 * @param {string} templateName
 * @param {string} templateLanguage
 * @param {string|null} headerImageUrl
 * @param {number} delayMs - Delay between messages in ms (default: 500ms)
 * @returns {Promise<{ total, sent, failed, results }>}
 */
const broadcastWhatsApp = async (recipients, templateName, templateLanguage = 'en', headerImageUrl = null, delayMs = 500) => {
  const results = [];
  let sent = 0;
  let failed = 0;

  console.log(`📢 Starting WhatsApp broadcast to ${recipients.length} recipients...`);

  for (const recipient of recipients) {
    try {
      const result = await sendMarketingTemplate(
        recipient.phone,
        templateName,
        templateLanguage,
        recipient.params || [],
        headerImageUrl
      );

      results.push({
        phone: recipient.phone,
        success: true,
        messageId: result.messageId,
      });
      sent++;
    } catch (error) {
      results.push({
        phone: recipient.phone,
        success: false,
        error: error.message,
      });
      failed++;
      console.error(`❌ Broadcast failed for ${recipient.phone}:`, error.message);
    }

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.log(`📢 Broadcast complete — Sent: ${sent}, Failed: ${failed}, Total: ${recipients.length}`);
  return { total: recipients.length, sent, failed, results };
};

// ─────────────────────────────────────────────
// 4. Simple Text Message
// ─────────────────────────────────────────────

const sendTextViaWhatsApp = async (phone, text) => {
  const normalizedPhone = normalizePhone(phone);
  try {
    const result = await callFast2SMS({
      phone_number: normalizedPhone,
      type: 'text',
      message: text,
    });
    console.log('✅ WhatsApp text sent to:', normalizedPhone);
    return { success: true, messageId: result.messageId, provider: 'fast2sms_waba' };
  } catch (error) {
    throw new Error(`WhatsApp Text Error: ${error.message}`);
  }
};

// ─────────────────────────────────────────────
// 5. Image Message
// ─────────────────────────────────────────────

const sendImageViaWhatsApp = async (phone, imageUrl, caption) => {
  const normalizedPhone = normalizePhone(phone);
  try {
    const payload = {
      phone_number: normalizedPhone,
      type: 'image',
      image: { link: imageUrl },
    };
    if (caption) payload.image.caption = caption;
    const result = await callFast2SMS(payload);
    console.log('✅ WhatsApp image sent to:', normalizedPhone);
    return { success: true, messageId: result.messageId, provider: 'fast2sms_waba' };
  } catch (error) {
    throw new Error(`WhatsApp Image Error: ${error.message}`);
  }
};

// ─────────────────────────────────────────────
// 6. Video Message
// ─────────────────────────────────────────────

const sendVideoViaWhatsApp = async (phone, videoUrl, caption) => {
  const normalizedPhone = normalizePhone(phone);
  try {
    const payload = {
      phone_number: normalizedPhone,
      type: 'video',
      video: { link: videoUrl },
    };
    if (caption) payload.video.caption = caption;
    const result = await callFast2SMS(payload);
    console.log('✅ WhatsApp video sent to:', normalizedPhone);
    return { success: true, messageId: result.messageId, provider: 'fast2sms_waba' };
  } catch (error) {
    throw new Error(`WhatsApp Video Error: ${error.message}`);
  }
};

module.exports = {
  isWhatsAppConfigured,
  normalizePhone,
  sendOtpViaWhatsApp,
  sendMarketingTemplate,
  broadcastWhatsApp,
  sendTextViaWhatsApp,
  sendImageViaWhatsApp,
  sendVideoViaWhatsApp,
};
