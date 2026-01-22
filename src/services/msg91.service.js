const https = require('https');
const http = require('http');
const querystring = require('querystring');

// MSG91 Configuration
const MSG91_BASE_URL = 'https://control.msg91.com';
const MSG91_AUTH_KEY = '489428AGbdetF92za69723550P1';
const MSG91_WIDGET_ID = '366174697953393937363533';
const MSG91_VERIFY_ACCESS_TOKEN_ENDPOINT = '/api/v5/widget/verifyAccessToken';
const MSG91_SEND_OTP_ENDPOINT = '/api/sendotp.php';
const MSG91_SEND_OTP_BASE_URL = 'api.msg91.com';

/**
 * Verify MSG91 access token
 * @param {string} accessToken - JWT token received from MSG91 OTP widget
 * @returns {Promise<{success: boolean, message?: string, data?: object}>}
 */
const verifyAccessToken = async (accessToken) => {
  return new Promise((resolve) => {
    try {
      if (!accessToken || typeof accessToken !== 'string' || accessToken.trim() === '') {
        return resolve({
          success: false,
          message: 'Access token is required',
        });
      }

      const postData = JSON.stringify({
        authkey: MSG91_AUTH_KEY,
        'access-token': accessToken.trim(),
      });

      const options = {
        hostname: 'control.msg91.com',
        port: 443,
        path: MSG91_VERIFY_ACCESS_TOKEN_ENDPOINT,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 30000, // 30 seconds timeout
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const responseData = JSON.parse(data);

            if (res.statusCode === 200) {
              // Check if verification was successful
              const isSuccess = 
                responseData.type === 'success' || 
                (responseData.message && 
                 responseData.message.toString().toLowerCase().includes('success'));

              return resolve({
                success: isSuccess,
                message: responseData.message || (isSuccess ? 'OTP verified successfully' : 'OTP verification failed'),
                data: {
                  type: responseData.type,
                  message: responseData.message,
                  mobile: responseData.mobile || responseData.data?.mobile,
                  email: responseData.email || responseData.data?.email,
                  ...responseData,
                },
              });
            }

            return resolve({
              success: false,
              message: responseData.message || 'Failed to verify OTP token',
            });
          } catch (parseError) {
            console.error('Error parsing MSG91 response:', parseError);
            return resolve({
              success: false,
              message: 'Invalid response from MSG91 server',
            });
          }
        });
      });

      req.on('error', (error) => {
        console.error('MSG91 verifyAccessToken error:', error);
        let message = 'An error occurred while verifying OTP token';
        
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
          message = 'Connection timeout. Please check your internet connection.';
        } else if (error.message) {
          message = error.message;
        }

        return resolve({
          success: false,
          message,
          error: error.message,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        return resolve({
          success: false,
          message: 'Connection timeout. Please check your internet connection.',
        });
      });

      req.write(postData);
      req.end();
    } catch (error) {
      console.error('MSG91 verifyAccessToken error:', error);
      return resolve({
        success: false,
        message: error.message || 'An error occurred while verifying OTP token',
        error: error.message,
      });
    }
  });
};

/**
 * Send OTP via SMS using MSG91
 * @param {string} mobile - Phone number in international format (e.g., "919876543210")
 * @param {string} otp - OTP code to send
 * @param {string} message - Custom message (optional, will use default if not provided)
 * @param {string} sender - Sender ID (optional, default: "SMSIND")
 * @param {number} otpExpiry - OTP expiry in minutes (optional, default: 10)
 * @returns {Promise<{success: boolean, message?: string, data?: object}>}
 */
const sendOtpSms = async (mobile, otp, message = null, sender = 'SMSIND', otpExpiry = 10) => {
  return new Promise((resolve) => {
    try {
      if (!mobile || typeof mobile !== 'string' || mobile.trim() === '') {
        return resolve({
          success: false,
          message: 'Mobile number is required',
        });
      }

      if (!otp || typeof otp !== 'string' || otp.trim() === '') {
        return resolve({
          success: false,
          message: 'OTP is required',
        });
      }

      // Remove any non-digit characters except + and ensure proper format
      let formattedMobile = mobile.replace(/\s+/g, '').replace(/^\+/, '');
      
      // Default message if not provided
      const defaultMessage = `Your verification code is ${otp}.`;
      const smsMessage = message || defaultMessage;

      // Build query parameters
      const params = {
        authkey: MSG91_AUTH_KEY,
        mobile: formattedMobile,
        message: smsMessage,
        sender: sender,
        otp: otp,
        otp_expiry: otpExpiry,
        otp_length: otp.length,
      };

      const queryString = querystring.stringify(params);
      const path = `${MSG91_SEND_OTP_ENDPOINT}?${queryString}`;

      const options = {
        hostname: MSG91_SEND_OTP_BASE_URL,
        port: 80,
        path: path,
        method: 'GET',
        timeout: 30000, // 30 seconds timeout
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const responseData = JSON.parse(data);

            if (res.statusCode === 200) {
              // Check if sending was successful
              const isSuccess = 
                responseData.type === 'success' || 
                (responseData.message && 
                 responseData.message.toString().toLowerCase().includes('success'));

              return resolve({
                success: isSuccess,
                message: responseData.message || (isSuccess ? 'OTP sent successfully' : 'Failed to send OTP'),
                data: {
                  type: responseData.type,
                  message: responseData.message,
                  requestId: responseData.message, // MSG91 returns request ID in message field
                  ...responseData,
                },
              });
            }

            return resolve({
              success: false,
              message: responseData.message || 'Failed to send OTP',
            });
          } catch (parseError) {
            console.error('Error parsing MSG91 send OTP response:', parseError);
            console.error('Raw response:', data);
            return resolve({
              success: false,
              message: 'Invalid response from MSG91 server',
            });
          }
        });
      });

      req.on('error', (error) => {
        console.error('MSG91 sendOtpSms error:', error);
        let message = 'An error occurred while sending OTP';
        
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
          message = 'Connection timeout. Please check your internet connection.';
        } else if (error.message) {
          message = error.message;
        }

        return resolve({
          success: false,
          message,
          error: error.message,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        return resolve({
          success: false,
          message: 'Connection timeout. Please check your internet connection.',
        });
      });

      req.end();
    } catch (error) {
      console.error('MSG91 sendOtpSms error:', error);
      return resolve({
        success: false,
        message: error.message || 'An error occurred while sending OTP',
        error: error.message,
      });
    }
  });
};

module.exports = {
  verifyAccessToken,
  sendOtpSms,
  MSG91_AUTH_KEY,
  MSG91_WIDGET_ID,
  MSG91_BASE_URL,
};
