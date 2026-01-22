const { Op } = require('sequelize');
const User = require('../../models/User.model');
const BasicDetail = require('../../models/BasicDetail.model');
const ProfileAction = require('../../models/ProfileAction.model');
const ProfileView = require('../../models/ProfileView.model');
const Notification = require('../../models/Notification.model');
const PersonPhoto = require('../../models/PersonPhoto.model');
const HoroscopeDetail = require('../../models/HoroscopeDetail.model');
const Hobby = require('../../models/Hobby.model');

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findOne({
      where: { accountId: req.accountId },
      include: [{
        model: BasicDetail,
        as: 'basicDetail',
        required: false,
      }],
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Convert to plain object and include basicDetail
    const userData = user.toJSON();
    if (userData.basicDetail) {
      userData.basicDetail = userData.basicDetail;
    }

    res.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get user profile by accountId (for viewing other users' profiles)
// This endpoint returns basic profile info WITHOUT sensitive details
// Use viewProfileDetails endpoint to view full details (deducts token)
const getProfileByAccountId = async (req, res) => {
  try {
    const { accountId } = req.params;
    const currentUserId = req.accountId; // ID of the logged-in user making the request

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'Account ID is required',
      });
    }

    // Find requested user profile
    const user = await User.findOne({
      where: { accountId },
      include: [{
        model: BasicDetail,
        as: 'basicDetail',
        required: false,
      }],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Convert to plain object and include basicDetail
    const userData = user.toJSON();

    // Fetch BasicDetail separately if association fails
    if (!userData.basicDetail) {
      try {
        const basicDetail = await BasicDetail.findOne({
          where: { accountId },
        });
        if (basicDetail) {
          userData.basicDetail = basicDetail.toJSON();
        }
      } catch (basicDetailError) {
        console.error('Error fetching BasicDetail separately:', basicDetailError.message);
        // Continue without basicDetail
      }
    }

    // Check if viewing own profile
    const isOwnProfile = currentUserId === accountId;
    
    // Check if user has already viewed this profile
    let hasViewed = false;
    if (!isOwnProfile) {
      try {
        const existingView = await ProfileView.findOne({
          where: {
            viewerId: currentUserId,
            viewedUserId: accountId,
          },
        });
        hasViewed = !!existingView;
      } catch (profileViewError) {
        // If ProfileView table doesn't exist or query fails, assume not viewed
        console.error('Error checking ProfileView (table may not exist):', profileViewError.message);
        hasViewed = false;
      }
    }

    // Exclude sensitive information if not own profile and not viewed
    if (!isOwnProfile && !hasViewed) {
      // Hide sensitive fields
      if (userData.basicDetail) {
        delete userData.basicDetail.email;
        delete userData.basicDetail.dateOfBirth;
        delete userData.basicDetail.city;
        delete userData.basicDetail.state;
        delete userData.basicDetail.country;
        delete userData.basicDetail.pincode;
        // Keep other basic info visible (height, marital status, religion, etc.)
      }
      delete userData.email;
      delete userData.phone;
    }

    // Exclude password always
    delete userData.password;

    res.json({
      success: true,
      data: userData,
      hasViewedDetails: hasViewed || isOwnProfile,
      isOwnProfile: isOwnProfile,
    });
  } catch (error) {
    console.error('Error getting profile by accountId:', error);
    console.error('Full error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get user profile',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

// View profile details - deducts token and stores view history
const viewProfileDetails = async (req, res) => {
  try {
    const { accountId } = req.body;
    const currentUserId = req.accountId; // ID of the logged-in user making the request

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'Account ID is required',
      });
    }

    // Check if viewing own profile
    if (currentUserId === accountId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot view details of your own profile',
      });
    }

    // Check if already viewed
    let existingView = null;
    try {
      existingView = await ProfileView.findOne({
        where: {
          viewerId: currentUserId,
          viewedUserId: accountId,
        },
      });
    } catch (profileViewError) {
      // If ProfileView table doesn't exist, log and continue
      console.error('Error checking ProfileView (table may not exist):', profileViewError.message);
      // Continue without checking - will try to create view history later
    }

    if (existingView) {
      // Already viewed, return full profile without deducting token
      const user = await User.findOne({
        where: { accountId },
        include: [{
          model: BasicDetail,
          as: 'basicDetail',
          required: false,
        }],
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      const userData = user.toJSON();
      if (!userData.basicDetail) {
        try {
          const basicDetail = await BasicDetail.findOne({
            where: { accountId },
          });
          if (basicDetail) {
            userData.basicDetail = basicDetail.toJSON();
          }
        } catch (basicDetailError) {
          console.error('Error fetching BasicDetail separately:', basicDetailError.message);
        }
      }

      delete userData.password;

      return res.json({
        success: true,
        message: 'Profile details retrieved',
        data: userData,
        tokenDeducted: false,
        tokensRemaining: null,
      });
    }

    // Check available tokens for current user
    const currentUser = await User.findOne({ where: { accountId: currentUserId } });

    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'Current user not found' });
    }

    if (currentUser.profileViewTokens <= 0) {
      return res.status(403).json({
        success: false,
        code: 'NO_TOKENS',
        message: 'You have used all your profile view tokens. Please upgrade your subscription to view more profiles.',
      });
    }

    // Deduct token
    currentUser.profileViewTokens -= 1;
    await currentUser.save();

    // Store view history
    try {
      await ProfileView.findOrCreate({
        where: {
          viewerId: currentUserId,
          viewedUserId: accountId,
        },
        defaults: {
          viewerId: currentUserId,
          viewedUserId: accountId,
        },
      });
    } catch (profileViewError) {
      // If ProfileView table doesn't exist, log error but don't fail the request
      console.error('Error storing ProfileView (table may not exist):', profileViewError.message);
      console.error('Please run migration: node migrations/create-profile-views-table.js');
      // Continue without storing view history - token already deducted
    }

    // Find requested user profile with full details
    const user = await User.findOne({
      where: { accountId },
      include: [{
        model: BasicDetail,
        as: 'basicDetail',
        required: false,
      }],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Convert to plain object and include basicDetail
    const userData = user.toJSON();

    // Fetch BasicDetail separately if association fails
    if (!userData.basicDetail) {
      try {
        const basicDetail = await BasicDetail.findOne({
          where: { accountId },
        });
        if (basicDetail) {
          userData.basicDetail = basicDetail.toJSON();
        }
      } catch (basicDetailError) {
        console.error('Error fetching BasicDetail separately:', basicDetailError.message);
      }
    }

    // Exclude password
    delete userData.password;

    res.json({
      success: true,
      message: 'Profile details viewed successfully',
      data: userData,
      tokenDeducted: true,
      tokensRemaining: currentUser.profileViewTokens,
    });
  } catch (error) {
    console.error('Error viewing profile details:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to view profile details',
    });
  }
};

const resolveDateOfBirth = ({ dateOfBirth, dobDay, dobMonth, dobYear }) => {
  if (dateOfBirth) return dateOfBirth;
  if (dobDay && dobMonth && dobYear) {
    let monthNum = parseInt(dobMonth);
    if (isNaN(monthNum)) {
      const months = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
      ];
      const monthIdx = months.indexOf(String(dobMonth).toLowerCase());
      if (monthIdx !== -1) {
        monthNum = monthIdx + 1;
      }
    }
    if (monthNum >= 1 && monthNum <= 12) {
      const iso = `${dobYear}-${String(monthNum).padStart(2, '0')}-${String(dobDay).padStart(2, '0')}`;
      return iso;
    }
  }
  return null;
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const user = await User.findByPk(req.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.name = name || user.name;
    user.phone = phone || user.phone;
    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const saveBasicDetails = async (req, res) => {
  try {
    const accountId = req.accountId; // Use accountId (UUID) instead of userId
    const {
      email,
      password,
      dateOfBirth,
      dobDay,
      dobMonth,
      dobYear,
      height,
      physicalStatus,
      maritalStatus,
      religion,
      caste,
      subcaste,
      willingToMarryFromAnyCaste,
      dosham,
      vegetarian,
      country,
      state,
      city,
      education,
      employmentType,
      occupation,
      currency,
      annualIncome,
      familyStatus,
      familyType,
      familyValues,
      aboutFamily,
      pincode,
      district,
    } = req.body;

    const user = await User.findOne({ where: { accountId } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (email && email !== user.email) {
      const duplicateEmailUser = await User.findOne({
        where: { email },
        attributes: ['id', 'accountId'],
      });

      if (duplicateEmailUser && duplicateEmailUser.accountId !== accountId) {
        return res.status(400).json({ message: 'Email is already in use' });
      }
      user.email = email;
    }

    if (password) {
      user.password = password;
    }

    await user.save();

    // Build base payload without pincode/district (they may not exist in DB)
    const basePayload = {
      dateOfBirth: resolveDateOfBirth({ dateOfBirth, dobDay, dobMonth, dobYear }),
      height,
      physicalStatus,
      maritalStatus,
      religion,
      caste,
      subcaste,
      willingToMarryFromAnyCaste: typeof willingToMarryFromAnyCaste === 'boolean'
        ? willingToMarryFromAnyCaste
        : willingToMarryFromAnyCaste === 'true',
      dosham,
      vegetarian,
      country,
      state,
      city,
      education,
      employmentType,
      occupation,
      currency,
      annualIncome,
      familyStatus,
      familyType,
      familyValues,
      aboutFamily,
    };

    // Try to find or create basic detail record
    let basicDetail;
    try {
      [basicDetail] = await BasicDetail.findOrCreate({
        where: { accountId },
        defaults: { accountId },
      });
    } catch (findError) {
      // Check if error is due to missing or wrong column (migration not run)
      const errorMsg = (findError.message || '').toLowerCase();
      if (errorMsg.includes('column') && (errorMsg.includes('userid') || errorMsg.includes('accountid') || errorMsg.includes('does not exist'))) {
        console.error('Database schema mismatch detected. Migration required.');
        console.error('Error details:', findError.message);
        return res.status(500).json({
          success: false,
          message: 'Database migration required: The basic_details table needs to be updated. Please run the SQL migration script: migrate-basic-details-simple.sql',
          error: 'Migration required: basic_details table needs accountId (UUID) column instead of userId (INTEGER)',
          instructions: [
            '1. Connect to your PostgreSQL database',
            '2. Run the SQL script: migrate-basic-details-simple.sql',
            '3. Restart your backend server',
            '4. Try submitting the form again'
          ],
        });
      }
      throw findError;
    }

    // Try to update with optional fields first, fallback if columns don't exist
    let payload = { ...basePayload };

    // Add optional fields if provided
    if (pincode !== undefined && pincode !== null && pincode !== '') {
      payload.pincode = pincode;
    }
    if (district !== undefined && district !== null && district !== '') {
      payload.district = district;
    }

    console.log('Updating basic detail with payload:', JSON.stringify(payload, null, 2));

    try {
      await basicDetail.update(payload);
    } catch (updateError) {
      console.error('Update error:', updateError.message);
      console.error('Error name:', updateError.name);

      // Check if error is due to missing columns (pincode, district, or vegetarian)
      const errorMessage = (updateError.message || '').toLowerCase();
      const isColumnError = errorMessage.includes('pincode') ||
        errorMessage.includes('district') ||
        errorMessage.includes('vegetarian') ||
        (errorMessage.includes('column') && errorMessage.includes('does not exist'));

      if (isColumnError) {
        console.warn('Update failed due to missing columns, retrying without optional fields');
        
        // Remove optional fields that might not exist in database
        const fallbackPayload = { ...basePayload };
        delete fallbackPayload.pincode;
        delete fallbackPayload.district;
        
        // Check if vegetarian column exists, if not remove it
        if (errorMessage.includes('vegetarian')) {
          delete fallbackPayload.vegetarian;
          console.warn('⚠️  VEGETARIAN column missing. Please run migration: node migrations/run-vegetarian-migration.js');
        }
        
        try {
          await basicDetail.update(fallbackPayload);
          console.warn('Update succeeded without optional fields. Please run SQL migrations to add missing columns.');
          console.warn('   - For vegetarian: node migrations/run-vegetarian-migration.js');
          console.warn('   - For pincode/district: Check existing migration scripts');
          // Continue with success response - data saved without optional fields
        } catch (retryError) {
          console.error('Retry update also failed:', retryError.message);
          
          // Provide specific migration instructions
          if (retryError.message.toLowerCase().includes('vegetarian')) {
            return res.status(500).json({
              success: false,
              message: 'Database migration required: The vegetarian column is missing.',
              error: 'Migration required: basic_details table needs vegetarian column',
              instructions: [
                '1. Navigate to the migrations folder: cd migrations',
                '2. Run the migration: node run-vegetarian-migration.js',
                '3. Restart your backend server',
                '4. Try registering again'
              ],
              migrationScript: 'migrations/run-vegetarian-migration.js'
            });
          }
          
          throw retryError;
        }
      } else {
        // Different error, throw it
        throw updateError;
      }
    }

    res.json({
      success: true,
      message: 'Basic details saved successfully',
      data: {
        user: {
          accountId: user.accountId,
          userCode: user.userCode,
          name: user.name,
          email: user.email,
          phone: user.phone,
        },
        basicDetail,
      },
    });
  } catch (error) {
    console.error('Error saving basic details:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);

    // Check if it's a database column error
    if (error.message && (error.message.includes('column') && error.message.includes('does not exist'))) {
      const errorMsg = error.message.toLowerCase();
      let migrationScript = 'migrations/run-vegetarian-migration.js';
      let columnName = 'vegetarian';
      
      if (errorMsg.includes('vegetarian')) {
        migrationScript = 'migrations/run-vegetarian-migration.js';
        columnName = 'vegetarian';
      } else if (errorMsg.includes('pincode') || errorMsg.includes('district')) {
        migrationScript = 'Check existing migration scripts for pincode/district';
        columnName = 'pincode/district';
      }
      
      return res.status(500).json({
        success: false,
        message: `Database column error: ${error.message}`,
        error: `Migration required: basic_details table needs ${columnName} column`,
        instructions: [
          '1. Navigate to the migrations folder: cd migrations',
          `2. Run the migration: node ${migrationScript.split('/').pop()}`,
          '3. Restart your backend server',
          '4. Try registering again'
        ],
        migrationScript: migrationScript
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to save basic details',
    });
  }
};

// Get all users (admin only)
const getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll();
    res.json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create or update profile action (interest, shortlist, reject)
const createProfileAction = async (req, res) => {
  try {
    const { actionType, targetUserId } = req.body;
    const userId = req.accountId; // UUID of the logged-in user

    // Validate actionType
    if (!['interest', 'shortlist', 'reject', 'accept'].includes(actionType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action type. Must be interest, shortlist, reject, or accept',
      });
    }

    // Validate targetUserId
    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'targetUserId is required',
      });
    }

    // Check if target user exists
    const targetUser = await User.findOne({ where: { accountId: targetUserId } });
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Target user not found',
      });
    }

    // Prevent self-action
    if (userId === targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot perform action on your own profile',
      });
    }

    // Find or create the action
    // If action already exists, update it; otherwise create new
    const [profileAction, created] = await ProfileAction.findOrCreate({
      where: {
        userId,
        targetUserId,
        actionType,
      },
      defaults: {
        userId,
        targetUserId,
        actionType,
      },
    });

    // If action already existed, update it (though in this case it's the same)
    if (!created) {
      await profileAction.update({
        actionType,
      });
    }

    // Trigger Notification
    try {
      const currentUser = await User.findOne({ where: { accountId: userId } });
      const senderName = currentUser ? currentUser.name : 'A member';

      let notificationType = 'system';
      let title = '';
      let message = '';

      if (actionType === 'interest') {
        notificationType = 'interest_received';
        title = 'New Interest Received';
        message = `${senderName} has sent you an interest.`;
      } else if (actionType === 'accept') {
        notificationType = 'interest_accepted';
        title = 'Interest Accepted';
        message = `${senderName} has accepted your interest!`;
      } else if (actionType === 'shortlist') {
        notificationType = 'shortlisted';
        title = 'Profile Shortlisted';
        message = `${senderName} has shortlisted your profile.`;
      }

      if (notificationType !== 'system') {
        const createdNotification = await Notification.create({
          userId: targetUserId,
          senderId: userId,
          type: notificationType,
          title,
          message,
          relatedId: profileAction.id.toString()
        });

        // Send push notification
        try {
          const { sendPushNotificationToUser } = require('../../services/push-notification.service');
          await sendPushNotificationToUser(
            targetUserId,
            { title, body: message },
            {
              type: notificationType,
              notificationId: createdNotification.id.toString(),
              senderId: userId,
              relatedId: profileAction.id.toString(),
            }
          );
        } catch (pushError) {
          console.error('Failed to send push notification:', pushError);
          // Non-blocking, continue response
        }
      }
    } catch (notifError) {
      console.error('Failed to trigger notification:', notifError);
      // Non-blocking, continue response
    }

    res.json({
      success: true,
      message: `Profile ${actionType} ${created ? 'created' : 'updated'} successfully`,
      data: profileAction,
    });
  } catch (error) {
    console.error('Error creating profile action:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create profile action',
    });
  }
};

// Remove profile action (toggle off)
const removeProfileAction = async (req, res) => {
  try {
    const { actionType, targetUserId } = req.body;
    const userId = req.accountId; // UUID of the logged-in user

    // Validate actionType
    if (!['interest', 'shortlist', 'reject', 'accept'].includes(actionType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action type. Must be interest, shortlist, reject, or accept',
      });
    }

    // Validate targetUserId
    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'targetUserId is required',
      });
    }

    // Find and delete the action
    const profileAction = await ProfileAction.findOne({
      where: {
        userId,
        targetUserId,
        actionType,
      },
    });

    if (!profileAction) {
      return res.status(404).json({
        success: false,
        message: 'Profile action not found',
      });
    }

    await profileAction.destroy();

    res.json({
      success: true,
      message: `Profile ${actionType} removed successfully`,
    });
  } catch (error) {
    console.error('Error removing profile action:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to remove profile action',
    });
  }
};

// Get profile actions for a specific target user
const getProfileAction = async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const userId = req.accountId; // UUID of the logged-in user

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'targetUserId is required',
      });
    }

    // Get all actions for this target user
    const actions = await ProfileAction.findAll({
      where: {
        userId,
        targetUserId,
      },
      include: [
        {
          model: User,
          as: 'targetUser',
          attributes: ['id', 'accountId', 'name', 'userCode'],
        },
      ],
    });

    res.json({
      success: true,
      data: actions,
    });
  } catch (error) {
    console.error('Error getting profile actions:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get profile actions',
    });
  }
};

// Get all actions performed by the current user
const getMyProfileActions = async (req, res) => {
  try {
    const userId = req.accountId; // UUID of the logged-in user
    const { actionType } = req.query; // Optional filter by action type

    const whereClause = { userId };
    if (actionType && ['interest', 'shortlist', 'reject', 'accept'].includes(actionType)) {
      whereClause.actionType = actionType;
    }

    const actions = await ProfileAction.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'targetUser',
          attributes: ['id', 'accountId', 'name', 'userCode', 'gender', 'dateOfBirth'],
          include: [
            { model: BasicDetail, as: 'basicDetail', required: false },
            { model: PersonPhoto, as: 'personPhoto', required: false }
          ]
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({
      success: true,
      count: actions.length,
      data: actions,
    });
  } catch (error) {
    console.error('Error getting my profile actions:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get profile actions',
    });
  }
};

// Get all actions received by the current user (where current user is the target)
const getReceivedProfileActions = async (req, res) => {
  try {
    const targetUserId = req.accountId; // UUID of the logged-in user (who received the action)
    const { actionType } = req.query; // Optional filter by action type

    const whereClause = { targetUserId };
    if (actionType && ['interest', 'shortlist', 'reject', 'accept'].includes(actionType)) {
      whereClause.actionType = actionType;
    }

    const actions = await ProfileAction.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'accountId', 'name', 'userCode', 'gender', 'dateOfBirth'],
          include: [
            { model: BasicDetail, as: 'basicDetail', required: false },
            { model: PersonPhoto, as: 'personPhoto', required: false }
          ]
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({
      success: true,
      count: actions.length,
      data: actions,
    });
  } catch (error) {
    console.error('Error getting received profile actions:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get received profile actions',
    });
  }
};

// Get opposite gender profiles
const getOppositeGenderProfiles = async (req, res) => {
  try {
    // Check if userId is available from authentication
    if (!req.userId) {
      console.error('req.userId is not set. Authentication may have failed.');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const userId = req.userId; // ID of the authenticated user
    const { id } = req.params; // Optional ID parameter from route
    const queryId = req.query.id; // Optional ID parameter from query string

    // Determine which user ID to use (priority: route param > query param > authenticated user's ID)
    const targetUserId = id ? parseInt(id) : (queryId ? parseInt(queryId) : userId);

    if (!targetUserId || isNaN(targetUserId)) {
      console.error('Invalid targetUserId:', { userId, id, queryId, targetUserId });
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }

    console.log('Getting opposite gender profiles for userId:', targetUserId);

    // Get the current user's gender
    const currentUser = await User.findByPk(targetUserId, {
      attributes: ['id', 'gender', 'accountId'],
    });

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if user has gender set
    if (!currentUser.gender) {
      return res.status(400).json({
        success: false,
        message: 'User gender is not set. Please update your profile with gender information.',
      });
    }

    // Determine opposite gender
    let oppositeGender;
    if (currentUser.gender === 'Male') {
      oppositeGender = 'Female';
    } else if (currentUser.gender === 'Female') {
      oppositeGender = 'Male';
    } else {
      // For 'Other' gender, we can show both Male and Female, or handle as needed
      // For now, let's return an error or show both
      return res.status(400).json({
        success: false,
        message: 'Gender must be Male or Female to find matches',
      });
    }

    console.log('Searching for opposite gender:', oppositeGender);

    // Find all users with opposite gender, excluding the current user
    // First, get users without BasicDetail to avoid association issues
    const oppositeGenderUsers = await User.findAll({
      where: {
        gender: oppositeGender,
        id: {
          [Op.ne]: targetUserId, // Exclude current user
        },
        isActive: true, // Only active users
      },
      attributes: {
        exclude: ['password'], // Exclude password from response
      },
      order: [['createdAt', 'DESC']], // Order by newest first
    });

    // Now fetch BasicDetails separately and attach them
    // Extract accountIds (UUIDs) from users
    const accountIds = oppositeGenderUsers
      .map(user => user.accountId)
      .filter(accountId => accountId && typeof accountId === 'string'); // Ensure they're UUID strings

    console.log('Extracted accountIds:', accountIds);
    console.log('AccountIds types:', accountIds.map(id => typeof id));
    console.log('AccountIds sample:', accountIds.slice(0, 3));

    let basicDetailsMap = {};

    if (accountIds.length > 0) {
      try {
        console.log(`Fetching BasicDetails for ${accountIds.length} users`);

        // Validate accountIds are proper UUIDs
        const validAccountIds = accountIds.filter(id => {
          const isValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
          if (!isValid) {
            console.warn(`Invalid UUID format: ${id}`);
          }
          return isValid;
        });

        if (validAccountIds.length === 0) {
          console.warn('No valid UUIDs found in accountIds, skipping BasicDetail fetch');
        } else {
          // Use raw SQL directly to avoid Sequelize type issues
          // This handles cases where the column type might not match what Sequelize expects
          try {
            const { sequelize } = require('../../config/database');
            console.log('Using raw SQL query to fetch BasicDetails for', validAccountIds.length, 'accountIds');

            // Build query with placeholders
            const placeholders = validAccountIds.map((_, i) => `$${i + 1}`).join(', ');
            const query = `
              SELECT * FROM basic_details 
              WHERE "accountId"::text IN (${placeholders})
            `;

            console.log('Executing raw SQL query');
            const results = await sequelize.query(query, {
              bind: validAccountIds,
              type: sequelize.QueryTypes.SELECT,
            });

            if (Array.isArray(results) && results.length > 0) {
              results.forEach((detail) => {
                // Normalize accountId (handle case sensitivity)
                const accId = detail.accountId || detail.accountid;
                if (accId) {
                  basicDetailsMap[accId] = detail;
                }
              });
              console.log(`Found ${results.length} BasicDetails using raw SQL`);
            } else {
              console.log('No BasicDetails found for the provided accountIds');
            }
          } catch (rawSqlError) {
            console.error('Raw SQL query failed:', rawSqlError.message);
            console.error('Error stack:', rawSqlError.stack);
            // Try individual queries as fallback
            console.warn('Trying individual queries as fallback...');
            const { sequelize } = require('../../config/database');
            for (const accountId of validAccountIds) {
              try {
                const query = `SELECT * FROM basic_details WHERE "accountId"::text = $1`;
                const results = await sequelize.query(query, {
                  bind: [accountId],
                  type: sequelize.QueryTypes.SELECT,
                });
                if (results && results.length > 0) {
                  const detail = results[0];
                  const accId = detail.accountId || detail.accountid;
                  if (accId) {
                    basicDetailsMap[accId] = detail;
                  }
                }
              } catch (individualError) {
                console.warn(`Failed to fetch BasicDetail for accountId ${accountId}:`, individualError.message);
              }
            }
          }
        }
      } catch (basicDetailError) {
        console.error('Error fetching BasicDetails:', basicDetailError.message);
        console.error('Error stack:', basicDetailError.stack);
        // Continue without BasicDetails if there's an error
      }
    } else {
      console.log('No accountIds to fetch BasicDetails for');
    }

    // Fetch PersonPhotos for all profiles in one go
    let photosMap = {};
    if (accountIds.length > 0) {
      try {
        const PersonPhoto = require('../../models/PersonPhoto.model');
        const photos = await PersonPhoto.findAll({
          where: { personId: { [Op.in]: accountIds } }
        });

        photos.forEach(photo => {
          photosMap[photo.personId] = photo.toJSON();
        });
        console.log(`Found ${photos.length} PersonPhotos for batch`);
      } catch (photoError) {
        console.error('Error fetching PersonPhotos batch:', photoError.message);
      }
    }

    // Format the response data and attach BasicDetails and Photos
    const profiles = oppositeGenderUsers.map((user) => {
      const userData = user.toJSON();
      // Attach basicDetail if it exists
      if (basicDetailsMap[userData.accountId]) {
        userData.basicDetail = basicDetailsMap[userData.accountId];
      }
      // Attach personPhoto if it exists
      if (photosMap[userData.accountId]) {
        userData.personPhoto = photosMap[userData.accountId];
      }
      return userData;
    });

    console.log(`Found ${profiles.length} profiles`);

    res.json({
      success: true,
      count: profiles.length,
      currentUserGender: currentUser.gender,
      oppositeGender: oppositeGender,
      data: profiles,
    });
  } catch (error) {
    console.error('Error getting opposite gender profiles:', error);
    console.error('Error stack:', error.stack);

    // Check if it's a database type mismatch error
    let errorMessage = error.message || 'Failed to get opposite gender profiles';
    if (error.message && error.message.includes('operator does not exist') && error.message.includes('uuid')) {
      errorMessage = 'Database schema error: The basic_details.accountId column is INTEGER but should be UUID. Please run the migration script: fix-accountid-type.sql';
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

// Search profiles with filters
const searchProfiles = async (req, res) => {
  try {
    const {
      ageMin, ageMax,
      heightMin, heightMax,
      religion, caste, city,
      occupation, maritalStatus,
      education, gender,
      rasi, natchathiram,
      incomeMin, incomeMax,
      hobby, interest,
      userCode // search by userCode (e.g., NN#00001)
    } = req.query;

    const userId = req.userId;

    // Search by userCode if provided
    if (userCode) {
      const user = await User.findOne({
        where: { userCode },
        include: [
          { model: BasicDetail, as: 'basicDetail', required: false },
          { model: PersonPhoto, as: 'personPhoto', required: false },
          { model: HoroscopeDetail, as: 'horoscopeDetail', required: false },
          { model: Hobby, as: 'hobby', required: false }
        ]
      });
      return res.json({
        success: true,
        count: user ? 1 : 0,
        data: user ? [user] : []
      });
    }

    const whereClause = {
      id: { [Op.ne]: userId || 0 },
      isActive: true
    };

    if (gender) {
      whereClause.gender = gender;
    } else if (userId) {
      const currentUser = await User.findByPk(userId);
      if (currentUser) {
        whereClause.gender = currentUser.gender === 'Male' ? 'Female' : 'Male';
      }
    }

    const basicWhere = {};
    let hasBasicFilter = false;

    if (religion) { basicWhere.religion = religion; hasBasicFilter = true; }
    if (caste) { basicWhere.caste = caste; hasBasicFilter = true; }
    if (city) { basicWhere.city = { [Op.iLike]: `%${city}%` }; hasBasicFilter = true; }
    if (occupation) { basicWhere.occupation = { [Op.iLike]: `%${occupation}%` }; hasBasicFilter = true; }
    if (maritalStatus) { basicWhere.maritalStatus = maritalStatus; hasBasicFilter = true; }
    if (education) { basicWhere.education = { [Op.iLike]: `%${education}%` }; hasBasicFilter = true; }

    // Income filtering (simple string match or range if numeric-like)
    if (incomeMin) {
      // Assuming annualIncome might be stored as numeric strings or have ranges
      // For now, let's do a simple iLike or exact if it's a dropdown value
      basicWhere.annualIncome = { [Op.iLike]: `%${incomeMin}%` };
      hasBasicFilter = true;
    }

    const horoscopeWhere = {};
    let hasHoroscopeFilter = false;
    if (rasi) { horoscopeWhere.rasi = rasi; hasHoroscopeFilter = true; }
    if (natchathiram) { horoscopeWhere.natchathiram = natchathiram; hasHoroscopeFilter = true; }

    const hobbyWhere = {};
    let hasHobbyFilter = false;
    if (hobby) {
      hobbyWhere.hobbies = { [Op.contains]: [hobby] };
      hasHobbyFilter = true;
    }
    if (interest) {
      // In this model, hobbies and interests are both in the 'hobbies' JSONB array
      hobbyWhere.hobbies = hobbyWhere.hobbies
        ? { [Op.and]: [hobbyWhere.hobbies, { [Op.contains]: [interest] }] }
        : { [Op.contains]: [interest] };
      hasHobbyFilter = true;
    }

    const users = await User.findAll({
      where: whereClause,
      include: [
        {
          model: BasicDetail,
          as: 'basicDetail',
          where: hasBasicFilter ? basicWhere : undefined,
          required: hasBasicFilter
        },
        {
          model: PersonPhoto,
          as: 'personPhoto',
          required: false
        },
        {
          model: HoroscopeDetail,
          as: 'horoscopeDetail',
          where: hasHoroscopeFilter ? horoscopeWhere : undefined,
          required: hasHoroscopeFilter
        },
        {
          model: Hobby,
          as: 'hobby',
          where: hasHobbyFilter ? hobbyWhere : undefined,
          required: hasHobbyFilter
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Filter by age if requested (since age is derived from dateOfBirth)
    let filteredUsers = users;
    if (ageMin || ageMax) {
      const min = parseInt(ageMin) || 18;
      const max = parseInt(ageMax) || 100;
      filteredUsers = users.filter(user => {
        const dob = user.basicDetail?.dateOfBirth;
        if (!dob) return false;
        const age = new Date().getFullYear() - new Date(dob).getFullYear();
        return age >= min && age <= max;
      });
    }

    res.json({
      success: true,
      count: filteredUsers.length,
      data: filteredUsers
    });

  } catch (error) {
    console.error('Search Profiles Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error occurred during search'
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getAllUsers,
  saveBasicDetails,
  createProfileAction,
  removeProfileAction,
  getProfileAction,
  getMyProfileActions,
  getReceivedProfileActions,
  getOppositeGenderProfiles,
  getProfileByAccountId,
  viewProfileDetails,
  searchProfiles,
};

