const User = require('../../models/User.model');
const BasicDetail = require('../../models/BasicDetail.model');
const Otp = require('../../models/Otp.model');
const Admin = require('../../models/Admin.model');
const { generateToken } = require('../../config/jwt');
const {
  getFirebaseAdmin,
  initializeFirebaseAdmin,
} = require('../../config/firebase-admin');

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

    // Send OTP via email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Email OTP Verification Code',
      html: `<h2>Your OTP is ${otpCode}</h2><p>Valid for ${OTP_EXPIRY_MINUTES} minutes.</p>`,
    });

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

    // Validate email presence
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const phone = formatPhone(countryCode, mobile);
    console.log('📱 Sending OTP - phone:', phone, 'email:', email);

    // Check if mobile already registered
    const existingPhoneUser = await User.findOne({ where: { phone } });
    if (existingPhoneUser) {
      return res.status(400).json({ message: 'Mobile number is already registered' });
    }

    // Check if email already registered
    const existingEmailUser = await User.findOne({ where: { email } });
    if (existingEmailUser) {
      return res.status(400).json({ message: 'Email is already registered' });
    }

    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await Otp.upsert({
      phone,
      email,
      code: OTP_STATIC_CODE,
      expiresAt,
      verified: false,
      payload: {
        name,
        gender,
        profileFor,
        countryCode,
      },
    });
    console.log('✅ OTP record upserted for', { phone, email, expiresAt });

    res.json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        otp: OTP_STATIC_CODE,
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

    const otpRecord = await Otp.findOne({ where: { phone } });
    if (!otpRecord || otpRecord.code !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (otpRecord.expiresAt < new Date()) {
      return res.status(400).json({ message: 'OTP has expired' });
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
      name: name || otpRecord.payload?.name,
      gender: gender || otpRecord.payload?.gender,
      profileFor: profileFor || otpRecord.payload?.profileFor,
      countryCode: countryCode || otpRecord.payload?.countryCode,
      phone,
      otpVerifiedAt: new Date(),
      userCode: userCode, // Explicitly set userCode
    });

    await otpRecord.destroy();

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

    const decoded = await firebaseAuth.verifyIdToken(idToken);
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
};


