// WhatsApp Service — Meta Cloud API (Direct)
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/message-templates

const META_API_VERSION = 'v19.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// ─────────────────────────────────────────────
// Config & Helpers
// ─────────────────────────────────────────────

const getMetaConfig = () => {
  const accessToken = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const templateName = process.env.META_OTP_TEMPLATE_NAME || 'otp_verification';
  const templateLanguage = process.env.META_OTP_TEMPLATE_LANGUAGE || 'en';
  return { accessToken, phoneNumberId, templateName, templateLanguage };
};

const isWhatsAppConfigured = () => {
  const { accessToken, phoneNumberId } = getMetaConfig();
  return !!(accessToken && phoneNumberId);
};

/**
 * Normalize phone number to E.164 without '+' sign
 * Meta API expects: "919876543210" (no + prefix)
 */
const normalizePhone = (phone) => {
  return `${phone}`.replace(/^\+/, '').replace(/\s+/g, '');
};

/**
 * Core function to call Meta WhatsApp API
 */
const callMetaApi = async (payload) => {
  const { accessToken, phoneNumberId } = getMetaConfig();

  if (!accessToken || !phoneNumberId) {
    throw new Error('WhatsApp is not configured. Set META_WHATSAPP_TOKEN and META_PHONE_NUMBER_ID in .env');
  }

  const url = `${META_BASE_URL}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (response.ok && data.messages && data.messages.length > 0) {
    return { success: true, messageId: data.messages[0].id };
  }

  const errorMsg =
    data?.error?.message ||
    data?.error?.error_user_msg ||
    'Meta WhatsApp API request failed';

  throw new Error(errorMsg);
};

// ─────────────────────────────────────────────
// 1. OTP — Send via Authentication Template
// ─────────────────────────────────────────────

/**
 * Send OTP via WhatsApp using Meta Cloud API authentication template.
 * Template must be approved by Meta before use.
 *
 * @param {string} phone - Phone number with country code (e.g., "+919876543210")
 * @param {string} otp - The 6-digit OTP code
 * @returns {Promise<{ success, messageId, provider }>}
 */
const sendOtpViaWhatsApp = async (phone, otp) => {
  const { templateName, templateLanguage } = getMetaConfig();
  const normalizedPhone = normalizePhone(phone);

  try {
    const result = await callMetaApi({
      messaging_product: 'whatsapp',
      to: normalizedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLanguage },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: otp }],
          },
        ],
      },
    });

    console.log('✅ WhatsApp OTP sent to:', normalizedPhone, '| MsgID:', result.messageId);
    return { success: true, message: 'OTP sent via WhatsApp', messageId: result.messageId, provider: 'whatsapp_meta' };
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
 * @param {string} templateName - Name of the approved Meta template
 * @param {string} templateLanguage - Template language code (e.g., 'en', 'en_US')
 * @param {Array<string>} bodyParams - Array of variable values for {{1}}, {{2}}, etc.
 * @param {string|null} headerImageUrl - Optional image URL for template header
 * @returns {Promise<{ success, messageId, provider }>}
 *
 * @example
 * // Template: "Hi {{1}}! Your match {{2}} is waiting. View: {{3}}"
 * await sendMarketingTemplate('+919876543210', 'match_alert', 'en', ['Ravi', 'Priya', 'https://...']);
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
    const result = await callMetaApi({
      messaging_product: 'whatsapp',
      to: normalizedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLanguage },
        components,
      },
    });

    console.log('✅ WhatsApp marketing message sent to:', normalizedPhone, '| MsgID:', result.messageId);
    return { success: true, messageId: result.messageId, provider: 'whatsapp_meta' };
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
 * Sends with a delay between each message to respect Meta rate limits.
 *
 * @param {Array<{ phone: string, params: string[] }>} recipients - List of recipients with their template params
 * @param {string} templateName - Approved Meta template name
 * @param {string} templateLanguage - Template language code
 * @param {string|null} headerImageUrl - Optional header image URL
 * @param {number} delayMs - Delay between messages in ms (default: 500ms to avoid rate limits)
 * @returns {Promise<{ total, sent, failed, results }>}
 *
 * @example
 * const recipients = [
 *   { phone: '+919876543210', params: ['Ravi', 'https://nammanaidu.cloud/matches'] },
 *   { phone: '+918765432109', params: ['Priya', 'https://nammanaidu.cloud/matches'] },
 * ];
 * const result = await broadcastWhatsApp(recipients, 'match_alert', 'en');
 * console.log(result); // { total: 2, sent: 2, failed: 0, results: [...] }
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

    // Delay between messages to avoid Meta rate limits
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.log(`📢 Broadcast complete — Sent: ${sent}, Failed: ${failed}, Total: ${recipients.length}`);
  return { total: recipients.length, sent, failed, results };
};

// ─────────────────────────────────────────────
// 4. Simple Text Message (within 24hr window)
// ─────────────────────────────────────────────

const sendTextViaWhatsApp = async (phone, text) => {
  const normalizedPhone = normalizePhone(phone);
  try {
    const result = await callMetaApi({
      messaging_product: 'whatsapp',
      to: normalizedPhone,
      type: 'text',
      text: { body: text },
    });
    console.log('✅ WhatsApp text sent to:', normalizedPhone);
    return { success: true, messageId: result.messageId, provider: 'whatsapp_meta' };
  } catch (error) {
    throw new Error(`WhatsApp Text Error: ${error.message}`);
  }
};

// ─────────────────────────────────────────────
// 5. Image Message (within 24hr window)
// ─────────────────────────────────────────────

const sendImageViaWhatsApp = async (phone, imageUrl, caption) => {
  const normalizedPhone = normalizePhone(phone);
  const imageObj = { link: imageUrl };
  if (caption) imageObj.caption = caption;
  try {
    const result = await callMetaApi({
      messaging_product: 'whatsapp',
      to: normalizedPhone,
      type: 'image',
      image: imageObj,
    });
    console.log('✅ WhatsApp image sent to:', normalizedPhone);
    return { success: true, messageId: result.messageId, provider: 'whatsapp_meta' };
  } catch (error) {
    throw new Error(`WhatsApp Image Error: ${error.message}`);
  }
};

// ─────────────────────────────────────────────
// 6. Video Message (within 24hr window)
// ─────────────────────────────────────────────

const sendVideoViaWhatsApp = async (phone, videoUrl, caption) => {
  const normalizedPhone = normalizePhone(phone);
  const videoObj = { link: videoUrl };
  if (caption) videoObj.caption = caption;
  try {
    const result = await callMetaApi({
      messaging_product: 'whatsapp',
      to: normalizedPhone,
      type: 'video',
      video: videoObj,
    });
    console.log('✅ WhatsApp video sent to:', normalizedPhone);
    return { success: true, messageId: result.messageId, provider: 'whatsapp_meta' };
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
