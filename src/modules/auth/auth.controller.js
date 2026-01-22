const User = require('../../models/User.model');
const BasicDetail = require('../../models/BasicDetail.model');
const Otp = require('../../models/Otp.model');
const Admin = require('../../models/Admin.model');
const { generateToken } = require('../../config/jwt');
const {
  getFirebaseAdmin,
  initializeFirebaseAdmin,
} = require('../../config/firebase-admin');
const transporter = require('../../mailer');
const { verifyAccessToken, sendOtpSms } = require('../../services/msg91.service');
const { sendEmail } = require('../../services/email.service');

const OTP_STATIC_CODE = process.env.OTP_STATIC_CODE || '12345';
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 10);

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

    await Otp.upsert({
      email,
      code: otpCode,
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

    const token = generateToken(user.accountId);

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
        token,
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

    const token = generateToken(user.accountId);

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
        token,
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

    await Otp.upsert({
      phone,
      email: userEmail,
      code: otpCode,
      expiresAt,
      verified: false,
      payload: {
        name,
        gender,
        profileFor,
        countryCode,
      },
    });
    console.log('✅ OTP record upserted for', { phone, email: userEmail, expiresAt, otp: otpCode });

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

    // Default test OTP - always verify successfully
    const DEFAULT_TEST_OTP = '150599';
    let otpRecord = null;
    
    if (otp === DEFAULT_TEST_OTP) {
      console.log('✅ Default test OTP used for registration verification:', phone);
      // Skip OTP validation, use request data directly
    } else {
      otpRecord = await Otp.findOne({ where: { phone } });
      if (!otpRecord || otpRecord.code !== otp) {
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

    const token = generateToken(user.accountId);

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
        token,
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
    const { mobileno, mailid, isemailid } = req.body;

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

    // Generate random 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Variables to track email sending status
    let emailSent = false;
    let emailError = null;

    if (isemailid) {
      // Find or create OTP record for email
      const [otpRecord, created] = await Otp.findOrCreate({
        where: { email: mailid },
        defaults: {
          email: mailid,
          phone: null,
          code: otpCode,
          expiresAt,
          verified: false,
          payload: {},
        },
      });

      if (!created) {
        // Update existing record
        otpRecord.code = otpCode;
        otpRecord.expiresAt = expiresAt;
        otpRecord.verified = false;
        await otpRecord.save();
      }

      // Send OTP via email (supports Resend API and SMTP)
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
        console.warn('   Please set one of:');
        console.warn('   - SENDGRID_API_KEY (recommended for Render Free)');
        console.warn('   - RESEND_API_KEY (recommended for Railway/VPS)');
        console.warn('   - OR EMAIL_USER and EMAIL_PASS (SMTP - may not work on cloud platforms)');
        console.log('📧 OTP generated but email not sent. OTP:', otpCode);
      } else {
        console.log('📧 Attempting to send OTP email...');
        if (process.env.SENDGRID_API_KEY) {
          console.log('   Provider: SendGrid API (recommended for Render Free)');
        } else if (process.env.RESEND_API_KEY) {
          console.log('   Provider: Resend API');
        } else {
          console.log('   Provider: SMTP');
        }
        console.log('   To:', mailid);
        console.log('   OTP:', otpCode);
        
        try {
          // Use email service that supports both Resend API and SMTP
          const emailResult = await sendEmail(
            mailid,
            'Your OTP Verification Code - Namma Naidu',
            emailHtml
          );
          
          emailSent = true;
          console.log('✅ OTP email sent successfully!');
          console.log('   Provider:', emailResult.provider || 'unknown');
          console.log('   Message ID:', emailResult.messageId);
          console.log('   To:', mailid);
          console.log('   OTP:', otpCode);
        } catch (err) {
          emailError = err;
          // Enhanced error logging for server debugging
          console.error('═══════════════════════════════════════════════════════');
          console.error('❌ ERROR SENDING OTP EMAIL');
          console.error('═══════════════════════════════════════════════════════');
          console.error('Error Message:', err.message);
          console.error('Error Code:', err.code || 'N/A');
          console.error('Error Stack:', err.stack);
          console.error('To Email:', mailid);
          console.error('OTP (for testing):', otpCode);
          
          // Provide helpful suggestions based on error
          if (err.message.includes('SMTP') || err.code === 'ECONNECTION' || err.code === 'ETIMEDOUT') {
            console.error('⚠️  SMTP CONNECTION ERROR:');
            console.error('   - SMTP ports (587/465) may be blocked on your hosting provider');
            console.error('   - Solution: Use an Email API instead:');
            console.error('     • SendGrid (Render Free): https://sendgrid.com - Set SENDGRID_API_KEY');
            console.error('     • Resend (Railway/VPS): https://resend.com - Set RESEND_API_KEY');
            console.error('   - Email APIs work without SMTP ports and are more reliable on cloud platforms');
          } else if (err.code === 'EAUTH') {
            console.error('⚠️  AUTHENTICATION ERROR:');
            console.error('   - Check if EMAIL_USER and EMAIL_PASS are correct');
            console.error('   - Verify App Password is valid (not regular password)');
            console.error('   - Ensure 2-Step Verification is enabled in Google Account');
          }
          console.error('═══════════════════════════════════════════════════════');
          // Don't throw - still return OTP to user even if email fails
        }
      }
    } else {
      // Find or create OTP record for phone
      const [otpRecord, created] = await Otp.findOrCreate({
        where: { phone: mobileno },
        defaults: {
          phone: mobileno,
          email: null,
          code: otpCode,
          expiresAt,
          verified: false,
          payload: {},
        },
      });

      if (!created) {
        // Update existing record
        otpRecord.code = otpCode;
        otpRecord.expiresAt = expiresAt;
        otpRecord.verified = false;
        await otpRecord.save();
      }

      // Send OTP via MSG91 SMS
      let smsSent = false;
      let smsError = null;

      console.log('📱 Attempting to send OTP SMS via MSG91...');
      console.log('   To:', mobileno);
      console.log('   OTP:', otpCode);

      try {
        const smsResult = await sendOtpSms(
          mobileno,
          otpCode,
          `Your OTP verification code for Namma Naidu is ${otpCode}. Valid for ${OTP_EXPIRY_MINUTES} minutes.`,
          'NNMATRI', // Sender ID
          OTP_EXPIRY_MINUTES
        );

        if (smsResult.success) {
          smsSent = true;
          console.log('✅ OTP SMS sent successfully via MSG91!');
          console.log('   Request ID:', smsResult.data?.requestId);
          console.log('   To:', mobileno);
          console.log('   OTP:', otpCode);
        } else {
          smsError = new Error(smsResult.message || 'Failed to send SMS');
          console.error('❌ Failed to send OTP SMS via MSG91:');
          console.error('   Error:', smsResult.message);
          console.error('   To:', mobileno);
          console.error('   OTP (for testing):', otpCode);
        }
      } catch (err) {
        smsError = err;
        console.error('═══════════════════════════════════════════════════════');
        console.error('❌ ERROR SENDING OTP SMS VIA MSG91');
        console.error('═══════════════════════════════════════════════════════');
        console.error('Error Message:', err.message);
        console.error('Error Stack:', err.stack);
        console.error('To Mobile:', mobileno);
        console.error('OTP (for testing):', otpCode);
        console.error('═══════════════════════════════════════════════════════');
        // Don't throw - still return OTP to user even if SMS fails
      }
    }

    console.log('✅ OTP record upserted for', { identifier, expiresAt, otp: otpCode });

    const response = {
      status: true,
      [isemailid ? 'mailid' : 'mobileno']: identifier,
      otp: otpCode,
    };

    // Add email sending status if it's an email OTP
    if (isemailid) {
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        response.emailSent = false;
        response.message = 'OTP generated but email not configured. Please check server configuration.';
      } else if (emailSent) {
        response.emailSent = true;
        response.message = 'OTP sent successfully to your email.';
      } else if (emailError) {
        response.emailSent = false;
        response.message = 'OTP generated but email sending failed. Please check server logs. OTP is available in response for testing.';
        response.emailError = emailError.message;
      }
    } else {
      // Add SMS sending status for mobile OTP
      if (smsSent) {
        response.smsSent = true;
        response.message = 'OTP sent successfully to your mobile number.';
      } else if (smsError) {
        response.smsSent = false;
        response.message = 'OTP generated but SMS sending failed. Please check server logs. OTP is available in response for testing.';
        response.smsError = smsError.message;
      } else {
        response.smsSent = false;
        response.message = 'OTP generated. SMS sending status unknown.';
      }
    }

    res.json(response);
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

// Verify OTP (new API - supports both mobile and email, and MSG91 token)
const verifyOtp = async (req, res) => {
  try {
    const { mobileno, mailid, otp, isemailid, msg91AccessToken } = req.body;

    // If MSG91 access token is provided, verify with MSG91 first
    if (msg91AccessToken) {
      console.log('🔐 Verifying MSG91 access token...');
      const msg91Result = await verifyAccessToken(msg91AccessToken);
      
      if (!msg91Result.success) {
        return res.status(400).json({
          status: false,
          response: msg91Result.message || 'MSG91 OTP verification failed',
        });
      }

      console.log('✅ MSG91 token verified successfully');
      
      // If MSG91 verification succeeds, we can proceed with standard OTP verification
      // or return success if only MSG91 verification is needed
      // For now, we'll still require OTP to be provided for additional security
      if (!otp) {
        return res.status(400).json({
          status: false,
          response: 'OTP is required even after MSG91 verification',
        });
      }
    }

    // Validate input
    if (!otp) {
      return res.status(400).json({ 
        status: false,
        response: 'OTP is required' 
      });
    }

    if (!isemailid && !mobileno) {
      return res.status(400).json({ 
        status: false,
        response: 'Mobile number is required when isemailid is false' 
      });
    }

    if (isemailid && !mailid) {
      return res.status(400).json({ 
        status: false,
        response: 'Email is required when isemailid is true' 
      });
    }

    const identifier = isemailid ? mailid : mobileno;
    
    // Default test OTP - always verify successfully
    const DEFAULT_TEST_OTP = '150599';
    if (otp === DEFAULT_TEST_OTP) {
      console.log('✅ Default test OTP used for verification:', identifier);
      return res.json({
        status: true,
        response: 'Verified Successfully',
      });
    }
    
    // Find OTP record
    let otpRecord;
    if (isemailid) {
      otpRecord = await Otp.findOne({ where: { email: mailid } });
    } else {
      otpRecord = await Otp.findOne({ where: { phone: mobileno } });
    }

    if (!otpRecord) {
      return res.status(400).json({ 
        status: false,
        response: 'OTP not found. Please request a new OTP.' 
      });
    }

    if (otpRecord.code !== otp) {
      return res.status(400).json({ 
        status: false,
        response: 'Invalid OTP' 
      });
    }

    if (otpRecord.expiresAt < new Date()) {
      return res.status(400).json({ 
        status: false,
        response: 'OTP has expired. Please request a new OTP.' 
      });
    }

    // Mark OTP as verified
    otpRecord.verified = true;
    await otpRecord.save();

    console.log('✅ OTP verified for', identifier);

    res.json({
      status: true,
      response: 'Verified Successfully',
    });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({
      status: false,
      response: error.message,
    });
  }
};

// Verify MSG91 access token (standalone endpoint)
const verifyMsg91Token = async (req, res) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        status: false,
        response: 'Access token is required',
      });
    }

    console.log('🔐 Verifying MSG91 access token...');
    const result = await verifyAccessToken(accessToken);

    if (result.success) {
      console.log('✅ MSG91 token verified successfully');
      return res.json({
        status: true,
        response: result.message || 'MSG91 token verified successfully',
        data: result.data,
      });
    } else {
      return res.status(400).json({
        status: false,
        response: result.message || 'MSG91 token verification failed',
      });
    }
  } catch (error) {
    console.error('Error verifying MSG91 token:', error);
    res.status(500).json({
      status: false,
      response: error.message,
    });
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

    const token = generateToken(user.accountId);

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
        token,
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

module.exports = {
  register,
  login,
  sendRegistrationOtp,
  verifyRegistrationOtp,
  firebaseLogin,
  sendOtp,
  verifyOtp,
  verifyMsg91Token,
};


