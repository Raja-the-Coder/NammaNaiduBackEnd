// SMS service with MSG91 OTP integration (India DLT–compliant)
// Docs: https://docs.msg91.com/otp/sendotp

const MSG91_BASE_URL = 'https://control.msg91.com/api/v5';

/**
 * Get MSG91 config from environment
 */
const getMsg91Config = () => {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID;
  const otpLength = Number(process.env.MSG91_OTP_LENGTH || 6);
  const otpExpiry = Number(process.env.MSG91_OTP_EXPIRY_MINUTES || 10);

  return { authKey, templateId, otpLength, otpExpiry };
};

/**
 * Check if MSG91 is configured
 */
const isMsg91Configured = () => {
  const { authKey, templateId } = getMsg91Config();
  return !!(authKey && templateId);
};

/**
 * Send OTP via MSG91
 * MSG91 generates and sends the OTP automatically via their template.
 * 
 * @param {string} mobile - Phone number with country code (e.g., "919876543210")
 * @param {string|null} otp - Optional: custom OTP to send (MSG91 auto-generates if not passed)
 * @returns {Promise<object>} - { success, message, requestId }
 */
const sendOtpViaMSG91 = async (mobile, otp = null) => {
  const { authKey, templateId, otpLength, otpExpiry } = getMsg91Config();

  if (!authKey || !templateId) {
    throw new Error(
      'MSG91 is not configured. Set MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID in .env'
    );
  }

  // Normalize phone: remove '+' prefix if present (MSG91 expects digits only with country code)
  const normalizedMobile = mobile.replace(/^\+/, '');

  const url = `${MSG91_BASE_URL}/otp?template_id=${templateId}&mobile=${normalizedMobile}&otp_length=${otpLength}&otp_expiry=${otpExpiry}`;

  const body = {};
  if (otp) {
    body.otp = otp;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authkey': authKey,
      },
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (data.type === 'success' || response.ok) {
      console.log('✅ MSG91 OTP sent successfully to:', normalizedMobile);
      console.log('   Request ID:', data.request_id || data.message);
      return {
        success: true,
        message: 'OTP sent successfully',
        requestId: data.request_id || data.message,
        provider: 'msg91',
      };
    } else {
      console.error('❌ MSG91 Send OTP failed:', data.message || JSON.stringify(data));
      throw new Error(data.message || 'MSG91 failed to send OTP');
    }
  } catch (error) {
    if (error.message.includes('MSG91')) throw error;
    console.error('❌ MSG91 API Error:', error.message);
    throw new Error(`MSG91 API Error: ${error.message}`);
  }
};

/**
 * Verify OTP via MSG91
 * 
 * @param {string} mobile - Phone number with country code (e.g., "919876543210")
 * @param {string} otp - OTP code to verify
 * @returns {Promise<object>} - { success, message }
 */
const verifyOtpViaMSG91 = async (mobile, otp) => {
  const { authKey } = getMsg91Config();

  if (!authKey) {
    throw new Error('MSG91 is not configured. Set MSG91_AUTH_KEY in .env');
  }

  const normalizedMobile = mobile.replace(/^\+/, '');

  const url = `${MSG91_BASE_URL}/otp/verify?mobile=${normalizedMobile}&otp=${otp}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'authkey': authKey,
      },
    });

    const data = await response.json();

    if (data.type === 'success') {
      console.log('✅ MSG91 OTP verified successfully for:', normalizedMobile);
      return {
        success: true,
        message: 'OTP verified successfully',
        provider: 'msg91',
      };
    } else {
      console.log('❌ MSG91 OTP verification failed for:', normalizedMobile, '-', data.message);
      return {
        success: false,
        message: data.message || 'Invalid OTP',
        provider: 'msg91',
      };
    }
  } catch (error) {
    console.error('❌ MSG91 Verify API Error:', error.message);
    throw new Error(`MSG91 Verify API Error: ${error.message}`);
  }
};

/**
 * Resend OTP via MSG91
 * 
 * @param {string} mobile - Phone number with country code
 * @param {string} retryType - "text" (SMS) or "voice" (voice call)
 * @returns {Promise<object>} - { success, message }
 */
const resendOtpViaMSG91 = async (mobile, retryType = 'text') => {
  const { authKey } = getMsg91Config();

  if (!authKey) {
    throw new Error('MSG91 is not configured. Set MSG91_AUTH_KEY in .env');
  }

  const normalizedMobile = mobile.replace(/^\+/, '');

  const url = `${MSG91_BASE_URL}/otp/retry?mobile=${normalizedMobile}&retrytype=${retryType}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'authkey': authKey,
      },
    });

    const data = await response.json();

    if (data.type === 'success') {
      console.log(`✅ MSG91 OTP resent (${retryType}) to:`, normalizedMobile);
      return {
        success: true,
        message: `OTP resent via ${retryType}`,
        provider: 'msg91',
      };
    } else {
      console.error('❌ MSG91 Resend OTP failed:', data.message);
      throw new Error(data.message || 'MSG91 failed to resend OTP');
    }
  } catch (error) {
    if (error.message.includes('MSG91')) throw error;
    console.error('❌ MSG91 Resend API Error:', error.message);
    throw new Error(`MSG91 Resend API Error: ${error.message}`);
  }
};

/**
 * Send SMS (non-OTP) via MSG91 Flow API
 * For transactional messages like welcome, interest notifications, etc.
 * 
 * @param {string} mobile - Phone number with country code
 * @param {string} flowId - MSG91 Flow/Template ID for the message
 * @param {object} variables - Template variables (e.g., { name: "John", code: "NN#00001" })
 * @returns {Promise<object>}
 */
const sendSmsViaMSG91 = async (mobile, flowId, variables = {}) => {
  const { authKey } = getMsg91Config();

  if (!authKey) {
    throw new Error('MSG91 is not configured. Set MSG91_AUTH_KEY in .env');
  }

  const normalizedMobile = mobile.replace(/^\+/, '');

  const url = `${MSG91_BASE_URL}/flow/`;

  const body = {
    template_id: flowId,
    short_url: '0',
    recipients: [
      {
        mobiles: normalizedMobile,
        ...variables,
      },
    ],
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authkey': authKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (data.type === 'success' || response.ok) {
      console.log('✅ MSG91 SMS sent successfully to:', normalizedMobile);
      return {
        success: true,
        message: 'SMS sent successfully',
        requestId: data.request_id || data.message,
        provider: 'msg91',
      };
    } else {
      throw new Error(data.message || 'MSG91 failed to send SMS');
    }
  } catch (error) {
    if (error.message.includes('MSG91')) throw error;
    console.error('❌ MSG91 SMS API Error:', error.message);
    throw new Error(`MSG91 SMS API Error: ${error.message}`);
  }
};

module.exports = {
  isMsg91Configured,
  sendOtpViaMSG91,
  verifyOtpViaMSG91,
  resendOtpViaMSG91,
  sendSmsViaMSG91,
};
