const bcrypt = require('bcryptjs');
const User = require('../../models/User.model');
const BasicDetail = require('../../models/BasicDetail.model');
const Otp = require('../../models/Otp.model');
const Admin = require('../../models/Admin.model');
const { generateToken, getRefreshTokenExpiry } = require('../../config/jwt');
const RefreshToken = require('../../models/RefreshToken.model');
const {
  getFirebaseAdmin,
  initializeFirebaseAdmin,
} = require('../../config/firebase-admin');
const transporter = require('../../mailer');
const { sendEmail } = require('../../services/email.service');
const {
  isMsg91Configured,
  sendOtpViaMSG91,
  verifyOtpViaMSG91,
  resendOtpViaMSG91,
} = require('../../services/sms.service');

// Helper: hash an OTP code before storing in DB
const hashOtp = async (otpCode) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(otpCode, salt);
};

// Helper: compare plain OTP with stored hash
const compareOtp = async (plainOtp, hashedOtp) => {
  return bcrypt.compare(plainOtp, hashedOtp);
};

// Helper: issue access + refresh token pair and update lastLoginAt
const issueTokenPair = async (user, deviceInfo = null) => {
  const accessToken = generateToken(user.accountId);
  const refreshTokenStr = RefreshToken.generateTokenString();
  const expiresAt = getRefreshTokenExpiry();

  await RefreshToken.create({
    userId: user.id,
    token: refreshTokenStr,
    expiresAt,
    deviceInfo,
    isRevoked: false,
  });

  // Update lastLoginAt
  user.lastLoginAt = new Date();
  await user.save();

  return { accessToken, refreshToken: refreshTokenStr };
};

const OTP_STATIC_CODE = process.env.OTP_STATIC_CODE || '12345';
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 10);
const MAX_OTP_ATTEMPTS = Number(process.env.MAX_OTP_ATTEMPTS || 5);
const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 30);

const formatPhone = (countryCode = '+91', mobile) => {
  const trimmedMobile = `${mobile}`.replace(/\s+/g, '');
  return `${countryCode}${trimmedMobile}`;
};

const getFirebaseAuth = () => {
  try {
    const app = getFirebaseAdmin();
    return app.auth();
  } catch (error) {
    const app = initializeFirebaseAdmin();
    return app.auth();
  }
};

// Register user
const register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user
    const user = await User.create({
      name,
      email,
      password,
      phone,
    });

    // Generate OTP for email verification
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const hashedCode = await hashOtp(otpCode);

    await Otp.upsert({
      email,
      code: hashedCode,
      expiresAt,
      verified: false,
      payload: { name },
    });

    // Send OTP via email (supports Resend API and SMTP)
    try {
      await sendEmail(
        email,
        'Your Email OTP Verification Code',
        `<h2>Your OTP is ${otpCode}</h2><p>Valid for ${OTP_EXPIRY_MINUTES} minutes.</p>`
      );
      console.log('✅ Registration OTP email sent successfully');
    } catch (emailError) {
      console.error('⚠️  Failed to send registration OTP email:', emailError.message);
      // Don't throw - user is still created, OTP is stored in database
    }

    const deviceInfo = req.headers['user-agent'] || null;
    const { accessToken, refreshToken } = await issueTokenPair(user, deviceInfo);

    res.status(201).json({
      success: true,
      message: 'User registered successfully, OTP sent to email',
      data: {
        user: {
          accountId: user.accountId,
          userCode: user.userCode,
          name: user.name,
          email: user.email,
          phone: user.phone,
        },
        token: accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Login user or admin
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Determine if input is email or phone
    const isEmail = email && email.includes('@');
    const isPhone = email && !email.includes('@');

    // First, check if email exists in Admin table (admins only use email)
    if (isEmail) {
      let admin = await Admin.findOne({ where: { email } });

      if (admin) {
        // Handle admin login
        // Verify password
        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
          return res.status(401).json({
            success: false,
            message: 'Invalid credentials',
          });
        }

        // Check if admin is active
        if (admin.status !== 'active') {
          return res.status(403).json({
            success: false,
            message: 'Your account has been deactivated. Please contact administrator.',
          });
        }

        // Update last login
        admin.lastLogin = new Date();
        await admin.save();

        // Generate token (admin still uses id for now)
        const token = generateToken(admin.id);

        return res.json({
          success: true,
          message: 'Admin login successful',
          data: {
            admin: {
              id: admin.id,
              name: admin.name,
              email: admin.email,
              role: admin.role,
            },
            token,
            isAdmin: true,
          },
        });
      }
    }

    // Handle regular user login - support both email and phone
    let user;
    if (isEmail) {
      user = await User.findOne({ where: { email } });
    } else if (isPhone) {
      // Format phone number with country code if not present
      const phone = email.startsWith('+') ? email : `+91${email}`;
      user = await User.findOne({ where: { phone } });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password (only if user has password - OTP users might not have password)
    if (user.password) {
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
    } else {
      // If no password set, reject login attempt
      return res.status(401).json({
        success: false,
        message: 'Please use OTP login for this account'
      });
    }

    // Check if basicDetails exists
    let hasBasicDetails = false;
    try {
      const basicDetail = await BasicDetail.findOne({
        where: { accountId: user.accountId },
        attributes: ['id', 'accountId'] // Only select columns that definitely exist
      });
      hasBasicDetails = !!basicDetail;
    } catch (error) {
      // If query fails (e.g., missing columns), assume no basicDetails
      console.warn('Error checking basicDetails:', error.message);
      hasBasicDetails = false;
    }

    const deviceInfo = req.headers['user-agent'] || null;
    const { accessToken, refreshToken } = await issueTokenPair(user, deviceInfo);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          accountId: user.accountId,
          userCode: user.userCode,
          name: user.name,
          email: user.email,
          phone: user.phone,
        },
        token: accessToken,
        refreshToken,
        isAdmin: false,
        hasBasicDetails,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const sendRegistrationOtp = async (req, res) => {
  try {
    const { name, gender, mobile, countryCode = '+91', profileFor, email } = req.body;

    const phone = formatPhone(countryCode, mobile);
    
    // Auto-generate email if not provided
    const userEmail = email || `user_${mobile}@nammamatrimony.app`;
    
    console.log('📱 Sending OTP - phone:', phone, 'email:', userEmail);

    // Check if mobile already registered
    const existingPhoneUser = await User.findOne({ where: { phone } });
    if (existingPhoneUser) {
      return res.status(400).json({ message: 'Mobile number is already registered' });
    }

    // Check if email already registered (only if provided)
    if (email) {
      const existingEmailUser = await User.findOne({ where: { email } });
      if (existingEmailUser) {
        return res.status(400).json({ message: 'Email is already registered' });
      }
    }

    // Generate random 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const hashedCode = await hashOtp(otpCode);

    await Otp.upsert({
      phone,
      email: userEmail,
      code: hashedCode,
      expiresAt,
      verified: false,
      payload: {
        name,
        gender,
        profileFor,
        countryCode,
      },
    });
    console.log('✅ OTP record upserted for', { phone, email: userEmail, expiresAt });

    res.json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        otp: otpCode,
        expiresAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const verifyRegistrationOtp = async (req, res) => {
  try {
    const {
      mobile,
      countryCode = '+91',
      otp,
      name,
      gender,
      profileFor,
    } = req.body;

    const phone = formatPhone(countryCode, mobile);

    // Default test OTP - only allowed in non-production environments
    const DEFAULT_TEST_OTP = '150599';
    const isTestOtpAllowed = process.env.NODE_ENV !== 'production';
    let otpRecord = null;
    
    if (isTestOtpAllowed && otp === DEFAULT_TEST_OTP) {
      console.log('✅ Default test OTP used for registration verification:', phone);
      // Skip OTP validation, use request data directly
    } else {
      otpRecord = await Otp.findOne({ where: { phone } });
      if (!otpRecord) {
        return res.status(400).json({ message: 'Invalid OTP' });
      }

      const otpMatch = await compareOtp(otp, otpRecord.code);
      if (!otpMatch) {
        return res.status(400).json({ message: 'Invalid OTP' });
      }

      if (otpRecord.expiresAt < new Date()) {
        return res.status(400).json({ message: 'OTP has expired' });
      }
      
      // Mark OTP as verified
      otpRecord.verified = true;
      await otpRecord.save();
    }

    const existingUser = await User.findOne({ where: { phone } });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this mobile number' });
    }

    // Generate userCode before creating user
    let userCode = 'NN#00001';
    try {
      const lastUser = await User.findOne({
        order: [['id', 'DESC']],
        attributes: ['userCode', 'id'],
        where: {
          userCode: {
            [require('sequelize').Op.ne]: null
          }
        }
      });

      if (lastUser && lastUser.userCode) {
        const match = lastUser.userCode.match(/(\d+)$/);
        if (match) {
          const currentNumber = parseInt(match[1], 10);
          if (!isNaN(currentNumber)) {
            const nextNumber = currentNumber + 1;
            userCode = `NN#${String(nextNumber).padStart(5, '0')}`;
          }
        }
      }
    } catch (error) {
      console.error('Error generating userCode in controller:', error);
      // Use default userCode
    }

    const user = await User.create({
      name: name || otpRecord?.payload?.name,
      gender: gender || otpRecord?.payload?.gender,
      profileFor: profileFor || otpRecord?.payload?.profileFor,
      countryCode: countryCode || otpRecord?.payload?.countryCode,
      phone,
      otpVerifiedAt: new Date(),
      userCode: userCode, // Explicitly set userCode
    });

    if (otpRecord) {
      await otpRecord.destroy();
    }

    const deviceInfo = req.headers['user-agent'] || null;
    const { accessToken, refreshToken } = await issueTokenPair(user, deviceInfo);

    res.status(201).json({
      success: true,
      message: 'OTP verified and user registered successfully',
      data: {
        user: {
          id: user.id,
          accountId: user.accountId,
          userCode: user.userCode,
          name: user.name,
          phone: user.phone,
        },
        token: accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Send OTP (new API - supports both mobile and email)
const sendOtp = async (req, res) => {
  try {
    const { mobileno, mailid, isemailid, retryType } = req.body;

    // Validate input
    if (!isemailid && !mobileno) {
      return res.status(400).json({ 
        status: false,
        message: 'Mobile number is required when isemailid is false' 
      });
    }

    if (isemailid && !mailid) {
      return res.status(400).json({ 
        status: false,
        message: 'Email is required when isemailid is true' 
      });
    }

    const identifier = isemailid ? mailid : mobileno;
    const identifierType = isemailid ? 'email' : 'phone';
    
    console.log('📱 Sending OTP - identifier:', identifier, 'type:', identifierType);

    // --- Resend cooldown check ---
    const existingOtp = isemailid
      ? await Otp.findOne({ where: { email: mailid } })
      : await Otp.findOne({ where: { phone: mobileno } });

    if (existingOtp && existingOtp.updatedAt) {
      const secondsSinceLastSend = (Date.now() - new Date(existingOtp.updatedAt).getTime()) / 1000;
      if (secondsSinceLastSend < OTP_RESEND_COOLDOWN_SECONDS) {
        const waitSeconds = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLastSend);
        return res.status(429).json({
          success: false,
          message: `Please wait ${waitSeconds} seconds before requesting a new OTP.`,
          data: { retryAfterSeconds: waitSeconds },
          error: 'OTP_COOLDOWN',
          status: false,
        });
      }
    }

    // Generate random 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const hashedCode = await hashOtp(otpCode);

    // Variables to track sending status
    let emailSent = false;
    let smsSent = false;
    let emailError = null;
    let smsError = null;

    if (isemailid) {
      // Find or create OTP record for email
      const [otpRecord, created] = await Otp.findOrCreate({
        where: { email: mailid },
        defaults: {
          email: mailid,
          phone: null,
          code: hashedCode,
          expiresAt,
          attempts: 0,
          verified: false,
          payload: {},
        },
      });

      if (!created) {
        otpRecord.code = hashedCode;
        otpRecord.expiresAt = expiresAt;
        otpRecord.attempts = 0;
        otpRecord.verified = false;
        await otpRecord.save();
      }

      // Send OTP via email
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #FB34AA;">OTP Verification Code</h2>
          <p>Hello,</p>
          <p>Your OTP verification code is:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
            <h1 style="color: #FB34AA; font-size: 32px; margin: 0; letter-spacing: 5px;">${otpCode}</h1>
          </div>
          <p>This OTP is valid for ${OTP_EXPIRY_MINUTES} minutes.</p>
          <p>If you didn't request this OTP, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">This is an automated message from Namma Naidu Matrimony.</p>
        </div>
      `;

      if (!process.env.SENDGRID_API_KEY && !process.env.RESEND_API_KEY && !process.env.EMAIL_USER) {
        console.warn('⚠️  No email provider configured. Email OTP will not be sent.');
        console.log('📧 OTP generated but email not sent. OTP:', otpCode);
      } else {
        try {
          const emailResult = await sendEmail(
            mailid,
            'Your OTP Verification Code - Namma Naidu',
            emailHtml
          );
          emailSent = true;
          console.log('✅ OTP email sent successfully! Provider:', emailResult.provider || 'unknown');
        } catch (err) {
          emailError = err;
          console.error('❌ Failed to send OTP email:', err.message);
        }
      }
    } else {
      // ========== MOBILE OTP via MSG91 ==========
      const useMsg91 = isMsg91Configured();

      if (useMsg91) {
        try {
          // Check if this is a resend/retry request
          if (retryType && existingOtp) {
            // Use MSG91 resend (does not need new OTP record)
            const retryResult = await resendOtpViaMSG91(mobileno, retryType === 'voice' ? 'voice' : 'text');
            console.log('✅ MSG91 OTP resent via', retryType, 'to:', mobileno);

            // Update attempts reset in our DB
            if (existingOtp) {
              existingOtp.attempts = 0;
              existingOtp.verified = false;
              existingOtp.expiresAt = expiresAt;
              await existingOtp.save();
            }

            smsSent = true;
          } else {
            // Send fresh OTP via MSG91
            // MSG91 generates and delivers OTP via their template
            const msg91Result = await sendOtpViaMSG91(mobileno, otpCode);
            smsSent = true;
            console.log('✅ MSG91 OTP sent to:', mobileno);

            // Store hashed OTP in our DB as well (for fallback verification & tracking)
            const [otpRecord, created] = await Otp.findOrCreate({
              where: { phone: mobileno },
              defaults: {
                phone: mobileno,
                email: null,
                code: hashedCode,
                expiresAt,
                attempts: 0,
                verified: false,
                payload: { provider: 'msg91', requestId: msg91Result.requestId },
              },
            });

            if (!created) {
              otpRecord.code = hashedCode;
              otpRecord.expiresAt = expiresAt;
              otpRecord.attempts = 0;
              otpRecord.verified = false;
              otpRecord.payload = { provider: 'msg91', requestId: msg91Result.requestId };
              await otpRecord.save();
            }
          }
        } catch (msg91Err) {
          smsError = msg91Err;
          console.error('❌ MSG91 OTP sending failed:', msg91Err.message);
          console.log('⚠️  Falling back to DB-only OTP storage...');

          // Fallback: store hashed OTP in DB even if MSG91 fails
          const [otpRecord, created] = await Otp.findOrCreate({
            where: { phone: mobileno },
            defaults: {
              phone: mobileno,
              email: null,
              code: hashedCode,
              expiresAt,
              attempts: 0,
              verified: false,
              payload: { provider: 'fallback' },
            },
          });

          if (!created) {
            otpRecord.code = hashedCode;
            otpRecord.expiresAt = expiresAt;
            otpRecord.attempts = 0;
            otpRecord.verified = false;
            otpRecord.payload = { provider: 'fallback' };
            await otpRecord.save();
          }
        }
      } else {
        // MSG91 not configured — store hashed OTP in DB only (dev/test mode)
        const [otpRecord, created] = await Otp.findOrCreate({
          where: { phone: mobileno },
          defaults: {
            phone: mobileno,
            email: null,
            code: hashedCode,
            expiresAt,
            attempts: 0,
            verified: false,
            payload: { provider: 'none' },
          },
        });

        if (!created) {
          otpRecord.code = hashedCode;
          otpRecord.expiresAt = expiresAt;
          otpRecord.attempts = 0;
          otpRecord.verified = false;
          otpRecord.payload = { provider: 'none' };
          await otpRecord.save();
        }

        console.log('📱 MSG91 not configured. OTP stored in DB only.');
        console.log('   Mobile:', mobileno, '| OTP:', otpCode);
        console.log('   Set MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID in .env to enable SMS.');
      }
    }

    console.log('✅ OTP record processed for', { identifier, expiresAt });

    const isDev = process.env.NODE_ENV !== 'production';

    let message;
    if (isemailid) {
      message = emailSent ? 'OTP sent successfully to your email.' : emailError ? 'OTP generated but email sending failed.' : 'OTP sent successfully.';
    } else {
      message = smsSent ? 'OTP sent successfully to your mobile.' : smsError ? 'OTP generated but SMS sending failed.' : 'OTP sent successfully.';
    }

    const data = {
      [isemailid ? 'mailid' : 'mobileno']: identifier,
      expiresAt: expiresAt.toISOString(),
    };
    if (isemailid) data.emailSent = !!emailSent;
    if (!isemailid) data.smsSent = !!smsSent;
    // Only expose OTP in development mode or if SMS provider is not configured
    if (isDev || (!isemailid && !smsSent)) data.otp = otpCode;

    res.json({
      success: true,
      message,
      data,
      error: null,
      status: true,
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send OTP',
      data: null,
      error: error.message,
      status: false,
    });
  }
};

// Standard API response helper
const apiResponse = (res, success, message, data = null, error = null, statusCode = 200) => {
  const payload = { success, message, data: data ?? null, error: error ?? null };
  return res.status(success ? statusCode : (statusCode >= 400 ? statusCode : 400)).json(payload);
};

// Verify OTP (unified API - supports mobile/email, registration and login)
const verifyOtp = async (req, res) => {
  try {
    const { mobileno, mailid, otp, isemailid, name, gender, profileFor, mobile, countryCode } = req.body;

    // Normalize phone: accept mobileno (E.164) or mobile + countryCode
    const phone = mobileno || (mobile && countryCode ? formatPhone(countryCode, mobile) : null);

    if (!otp) {
      return apiResponse(res, false, 'OTP is required', null, 'OTP is required', 400);
    }

    if (!isemailid && !phone) {
      return apiResponse(res, false, 'Mobile number is required when isemailid is false', null, 'Mobile number is required', 400);
    }

    if (isemailid && !mailid) {
      return apiResponse(res, false, 'Email is required when isemailid is true', null, 'Email is required', 400);
    }

    const identifier = isemailid ? mailid : phone;
    const isRegistration = !isemailid && (name != null && String(name).trim() !== '');

    // Default test OTP - only allowed in non-production environments
    const DEFAULT_TEST_OTP = '150599';
    const isTestOtpAllowed = process.env.NODE_ENV !== 'production';
    let otpRecord = null;
    const deviceInfo = req.headers['user-agent'] || null;
    if (isTestOtpAllowed && otp === DEFAULT_TEST_OTP) {
      console.log('✅ Default test OTP used for verification:', identifier);
      if (isRegistration && phone) {
        const existingUser = await User.findOne({ where: { phone } });
        if (existingUser) {
          let hasBasicDetails = false;
          try {
            const basicDetail = await BasicDetail.findOne({ where: { accountId: existingUser.accountId }, attributes: ['id'] });
            hasBasicDetails = !!basicDetail;
          } catch (_) {}
          const { accessToken, refreshToken: rToken } = await issueTokenPair(existingUser, deviceInfo);
          return apiResponse(res, true, 'OTP verified', {
            user: { id: existingUser.id, accountId: existingUser.accountId, userCode: existingUser.userCode, name: existingUser.name, phone: existingUser.phone },
            token: accessToken,
            refreshToken: rToken,
            isNewUser: false,
            hasBasicDetails,
          });
        }
        const displayName = (name && String(name).trim()) || 'User';
        const user = await User.create({
          name: displayName,
          gender: gender || null,
          profileFor: profileFor || null,
          countryCode: countryCode || '+91',
          phone,
          otpVerifiedAt: new Date(),
        });
        const { accessToken, refreshToken: rToken } = await issueTokenPair(user, deviceInfo);
        return res.status(201).json({
          success: true,
          message: 'OTP verified and account created',
          data: {
            user: { id: user.id, accountId: user.accountId, userCode: user.userCode, name: user.name, phone: user.phone },
            token: accessToken,
            refreshToken: rToken,
            isNewUser: true,
            hasBasicDetails: false,
          },
          error: null,
        });
      }
      if (!isRegistration && isemailid) {
        return apiResponse(res, true, 'Verified successfully', { verified: true });
      }
      if (!isRegistration && !isemailid && phone) {
        const existingUser = await User.findOne({ where: { phone } });
        if (existingUser) {
          let hasBasicDetails = false;
          try {
            const basicDetail = await BasicDetail.findOne({ where: { accountId: existingUser.accountId }, attributes: ['id'] });
            hasBasicDetails = !!basicDetail;
          } catch (_) {}
          const { accessToken, refreshToken: rToken } = await issueTokenPair(existingUser, deviceInfo);
          return apiResponse(res, true, 'OTP verified', {
            user: { id: existingUser.id, accountId: existingUser.accountId, userCode: existingUser.userCode, name: existingUser.name, phone: existingUser.phone },
            token: accessToken,
            refreshToken: rToken,
            isNewUser: false,
            hasBasicDetails,
          });
        }
        return apiResponse(res, false, 'No account found with this number. Please register first.', null, 'User not found', 404);
      }
      return apiResponse(res, true, 'Verified successfully', { verified: true });
    }

    // Find OTP record
    if (isemailid) {
      otpRecord = await Otp.findOne({ where: { email: mailid } });
    } else {
      otpRecord = await Otp.findOne({ where: { phone } });
    }

    if (!otpRecord) {
      return apiResponse(res, false, 'OTP not found. Please request a new OTP.', null, 'OTP not found', 400);
    }

    // --- Brute-force protection: check attempt count ---
    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      return apiResponse(res, false, `Too many failed attempts. Please request a new OTP.`, null, 'MAX_ATTEMPTS_EXCEEDED', 429);
    }

    if (otpRecord.expiresAt < new Date()) {
      return apiResponse(res, false, 'OTP has expired. Please request a new OTP.', null, 'OTP expired', 400);
    }

    // --- Verify OTP ---
    // Try MSG91 verification first for mobile (if MSG91 was used to send)
    let verified = false;
    if (!isemailid && isMsg91Configured() && otpRecord.payload?.provider === 'msg91') {
      try {
        const msg91Result = await verifyOtpViaMSG91(phone, otp);
        verified = msg91Result.success;
        if (!verified) {
          // Increment attempts on failed verification
          otpRecord.attempts = (otpRecord.attempts || 0) + 1;
          await otpRecord.save();
          return apiResponse(res, false, 'Invalid OTP', null, 'Invalid OTP', 400);
        }
      } catch (msg91Err) {
        console.warn('⚠️  MSG91 verify failed, falling back to DB verification:', msg91Err.message);
        // Fall through to DB-based verification
      }
    }

    // Fallback: DB-based OTP verification using bcrypt compare
    if (!verified) {
      const otpMatch = await compareOtp(otp, otpRecord.code);
      if (!otpMatch) {
        // Increment attempts on failed verification
        otpRecord.attempts = (otpRecord.attempts || 0) + 1;
        await otpRecord.save();
        const remaining = MAX_OTP_ATTEMPTS - otpRecord.attempts;
        return apiResponse(res, false, `Invalid OTP. ${remaining > 0 ? remaining + ' attempts remaining.' : 'Please request a new OTP.'}`, null, 'Invalid OTP', 400);
      }
    }

    otpRecord.verified = true;
    await otpRecord.save();

    // ----- Mobile verification: registration (create user) or login (return token) -----
    if (!isemailid) {
      const existingUser = await User.findOne({ where: { phone } });
      if (existingUser) {
        let hasBasicDetails = false;
        try {
          const basicDetail = await BasicDetail.findOne({ where: { accountId: existingUser.accountId }, attributes: ['id'] });
          hasBasicDetails = !!basicDetail;
        } catch (_) {}
        const { accessToken, refreshToken: rToken } = await issueTokenPair(existingUser, deviceInfo);
        return apiResponse(res, true, 'OTP verified', {
          user: { id: existingUser.id, accountId: existingUser.accountId, userCode: existingUser.userCode, name: existingUser.name, phone: existingUser.phone },
          token: accessToken,
          refreshToken: rToken,
          isNewUser: false,
          hasBasicDetails,
        });
      }
      if (isRegistration) {
        const displayName = (name && String(name).trim()) || 'User';
        const user = await User.create({
          name: displayName,
          gender: gender || null,
          profileFor: profileFor || null,
          countryCode: countryCode || '+91',
          phone,
          otpVerifiedAt: new Date(),
        });
        try { await otpRecord.destroy(); } catch (_) {}
        const { accessToken, refreshToken: rToken } = await issueTokenPair(user, deviceInfo);
        return res.status(201).json({
          success: true,
          message: 'OTP verified and account created',
          data: {
            user: { id: user.id, accountId: user.accountId, userCode: user.userCode, name: user.name, phone: user.phone },
            token: accessToken,
            refreshToken: rToken,
            isNewUser: true,
            hasBasicDetails: false,
          },
          error: null,
        });
      }
      return apiResponse(res, false, 'No account found with this number. Please register first.', null, 'User not found', 404);
    }

    // Email verification only
    return apiResponse(res, true, 'Verified successfully', { verified: true });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return apiResponse(res, false, error.message || 'Verification failed', null, error.message, 500);
  }
};


const firebaseLogin = async (req, res) => {
  try {
    const {
      idToken,
      name,
      gender,
      profileFor,
      countryCode = '+91',
    } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'Firebase ID token is required'
      });
    }

    // Check if Firebase Admin is initialized
    let firebaseAuth;
    try {
      firebaseAuth = getFirebaseAuth();
    } catch (error) {
      console.error('Firebase Admin not initialized:', error.message);
      return res.status(503).json({
        success: false,
        message: 'Firebase Admin SDK is not configured. Please set FIREBASE_SERVICE_ACCOUNT environment variable in Railway.',
      });
    }

    // Log incoming token
    console.log('🔐 firebaseLogin - received idToken:', idToken);
    const decoded = await firebaseAuth.verifyIdToken(idToken);
    console.log('🔐 Decoded Firebase token in firebaseLogin:', decoded);

    console.log('🔐 Decoded Firebase token:', decoded);

    const phone = decoded.phone_number;
    console.log('📞 Phone extracted from token:', phone);
    if (!phone) {
      return res.status(400).json({ message: 'Phone number not found in token' });
    }

    let user = await User.findOne({ where: { phone } });
    console.log('🔎 User lookup by phone:', phone, 'found:', !!user);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      const displayName = name && name.trim() ? name.trim() : 'User';
      user = await User.create({
        name: displayName,
        gender,
        profileFor,
        countryCode,
        phone,
        otpVerifiedAt: new Date(),
      });
    } else if (!user.otpVerifiedAt) {
      user.otpVerifiedAt = new Date();
      await user.save();
    }

    let hasBasicDetails = false;
    try {
      const basicDetail = await BasicDetail.findOne({
        where: { accountId: user.accountId },
        attributes: ['id', 'accountId'],
      });
      hasBasicDetails = !!basicDetail;
    } catch (error) {
      console.warn('Error checking basicDetails:', error.message);
      hasBasicDetails = false;
    }

    const deviceInfo = req.headers['user-agent'] || null;
    const { accessToken, refreshToken } = await issueTokenPair(user, deviceInfo);

    return res.json({
      success: true,
      message: 'Firebase login successful',
      data: {
        user: {
          id: user.id,
          accountId: user.accountId,
          userCode: user.userCode,
          name: user.name,
          phone: user.phone,
          email: user.email,
          gender: user.gender,
          profileFor: user.profileFor,
        },
        token: accessToken,
        refreshToken,
        isAdmin: false,
        hasBasicDetails,
        isNewUser,
      },
    });
  } catch (error) {
    console.error('Firebase login error:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Invalid Firebase token',
    });
  }
};

// Refresh Token - exchange refresh token for new access token
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: tokenStr } = req.body;

    if (!tokenStr) {
      return apiResponse(res, false, 'Refresh token is required', null, 'MISSING_REFRESH_TOKEN', 400);
    }

    const storedToken = await RefreshToken.findOne({ where: { token: tokenStr } });

    if (!storedToken) {
      return apiResponse(res, false, 'Invalid refresh token', null, 'INVALID_REFRESH_TOKEN', 401);
    }

    if (storedToken.isRevoked) {
      return apiResponse(res, false, 'Refresh token has been revoked', null, 'REVOKED_REFRESH_TOKEN', 401);
    }

    if (storedToken.expiresAt < new Date()) {
      return apiResponse(res, false, 'Refresh token has expired. Please login again.', null, 'EXPIRED_REFRESH_TOKEN', 401);
    }

    const user = await User.findOne({ where: { id: storedToken.userId } });
    if (!user) {
      return apiResponse(res, false, 'User not found', null, 'USER_NOT_FOUND', 401);
    }

    // Revoke old refresh token (rotate)
    storedToken.isRevoked = true;
    await storedToken.save();

    // Issue new token pair
    const deviceInfo = req.headers['user-agent'] || storedToken.deviceInfo;
    const newAccessToken = generateToken(user.accountId);
    const newRefreshTokenStr = RefreshToken.generateTokenString();
    const expiresAt = getRefreshTokenExpiry();

    await RefreshToken.create({
      userId: user.id,
      token: newRefreshTokenStr,
      expiresAt,
      deviceInfo,
      isRevoked: false,
    });

    return apiResponse(res, true, 'Token refreshed successfully', {
      token: newAccessToken,
      refreshToken: newRefreshTokenStr,
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    return apiResponse(res, false, 'Failed to refresh token', null, error.message, 500);
  }
};

// Logout - revoke refresh token
const logout = async (req, res) => {
  try {
    const { refreshToken: tokenStr } = req.body;

    if (tokenStr) {
      // Revoke the specific refresh token
      await RefreshToken.update(
        { isRevoked: true },
        { where: { token: tokenStr } }
      );
    }

    // Optionally revoke ALL refresh tokens for this user (full logout)
    if (req.body.allDevices && req.userId) {
      await RefreshToken.update(
        { isRevoked: true },
        { where: { userId: req.userId, isRevoked: false } }
      );
    }

    return apiResponse(res, true, 'Logged out successfully');
  } catch (error) {
    console.error('Error during logout:', error);
    return apiResponse(res, false, 'Logout failed', null, error.message, 500);
  }
};

// Forgot Password - send reset OTP to email
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return apiResponse(res, false, 'Email is required', null, 'EMAIL_REQUIRED', 400);
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Don't reveal whether email exists (security best practice)
      return apiResponse(res, true, 'If this email is registered, you will receive a password reset OTP.');
    }

    // Generate OTP for password reset
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const hashedCode = await hashOtp(otpCode);

    const [otpRecord, created] = await Otp.findOrCreate({
      where: { email },
      defaults: {
        email,
        phone: null,
        code: hashedCode,
        expiresAt,
        attempts: 0,
        verified: false,
        payload: { purpose: 'password_reset' },
      },
    });

    if (!created) {
      // Cooldown check
      if (otpRecord.updatedAt) {
        const secondsSinceLastSend = (Date.now() - new Date(otpRecord.updatedAt).getTime()) / 1000;
        if (secondsSinceLastSend < OTP_RESEND_COOLDOWN_SECONDS) {
          const waitSeconds = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLastSend);
          return res.status(429).json({
            success: false,
            message: `Please wait ${waitSeconds} seconds before requesting a new OTP.`,
            data: { retryAfterSeconds: waitSeconds },
            error: 'OTP_COOLDOWN',
          });
        }
      }
      otpRecord.code = hashedCode;
      otpRecord.expiresAt = expiresAt;
      otpRecord.attempts = 0;
      otpRecord.verified = false;
      otpRecord.payload = { purpose: 'password_reset' };
      await otpRecord.save();
    }

    // Send reset OTP via email
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #FB34AA;">Password Reset OTP</h2>
        <p>Hello ${user.name || ''},</p>
        <p>You requested a password reset. Your OTP code is:</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
          <h1 style="color: #FB34AA; font-size: 32px; margin: 0; letter-spacing: 5px;">${otpCode}</h1>
        </div>
        <p>This OTP is valid for ${OTP_EXPIRY_MINUTES} minutes.</p>
        <p>If you didn't request this, please ignore this email. Your password will remain unchanged.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated message from Namma Naidu Matrimony.</p>
      </div>
    `;

    try {
      await sendEmail(email, 'Password Reset OTP - Namma Naidu', emailHtml);
      console.log('✅ Password reset OTP email sent to:', email);
    } catch (emailError) {
      console.error('❌ Failed to send password reset email:', emailError.message);
    }

    return apiResponse(res, true, 'If this email is registered, you will receive a password reset OTP.');
  } catch (error) {
    console.error('Error in forgotPassword:', error);
    return apiResponse(res, false, 'Failed to process password reset request', null, error.message, 500);
  }
};

// Reset Password - verify OTP and set new password
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return apiResponse(res, false, 'Email, OTP, and new password are required', null, 'MISSING_FIELDS', 400);
    }

    if (newPassword.length < 6) {
      return apiResponse(res, false, 'Password must be at least 6 characters', null, 'WEAK_PASSWORD', 400);
    }

    const otpRecord = await Otp.findOne({ where: { email } });
    if (!otpRecord) {
      return apiResponse(res, false, 'OTP not found. Please request a new one.', null, 'OTP_NOT_FOUND', 400);
    }

    // Brute-force protection
    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      return apiResponse(res, false, 'Too many failed attempts. Please request a new OTP.', null, 'MAX_ATTEMPTS_EXCEEDED', 429);
    }

    if (otpRecord.expiresAt < new Date()) {
      return apiResponse(res, false, 'OTP has expired. Please request a new one.', null, 'OTP_EXPIRED', 400);
    }

    const otpMatch = await compareOtp(otp, otpRecord.code);
    if (!otpMatch) {
      otpRecord.attempts = (otpRecord.attempts || 0) + 1;
      await otpRecord.save();
      const remaining = MAX_OTP_ATTEMPTS - otpRecord.attempts;
      return apiResponse(res, false, `Invalid OTP. ${remaining > 0 ? remaining + ' attempts remaining.' : 'Please request a new OTP.'}`, null, 'INVALID_OTP', 400);
    }

    // OTP verified - update password
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return apiResponse(res, false, 'User not found', null, 'USER_NOT_FOUND', 404);
    }

    user.password = newPassword; // Will be hashed by beforeUpdate hook
    await user.save();

    // Cleanup OTP record
    await otpRecord.destroy();

    // Revoke all existing refresh tokens for security
    await RefreshToken.update(
      { isRevoked: true },
      { where: { userId: user.id, isRevoked: false } }
    );

    return apiResponse(res, true, 'Password reset successfully. Please login with your new password.');
  } catch (error) {
    console.error('Error in resetPassword:', error);
    return apiResponse(res, false, 'Failed to reset password', null, error.message, 500);
  }
};

module.exports = {
  register,
  login,
  sendRegistrationOtp,
  verifyRegistrationOtp,
  firebaseLogin,
  sendOtp,
  verifyOtp,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
};


