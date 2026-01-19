const User = require('../../models/User.model');
const BasicDetail = require('../../models/BasicDetail.model');
const PersonPhoto = require('../../models/PersonPhoto.model');
const HoroscopeDetail = require('../../models/HoroscopeDetail.model');
const FamilyDetail = require('../../models/FamilyDetail.model');
const Hobby = require('../../models/Hobby.model');
const { Op } = require('sequelize');
const { successResponse, errorResponse } = require('../../utils/response');

// Get all users (for admin)
const getAllUsers = async (req, res) => {
  try {
    console.log('[getAllUsers] Request received:', {
      query: req.query,
      adminId: req.adminId,
      adminRole: req.adminRole,
    });

    const { status, gender, search, page = 1, limit = 20 } = req.query;

    const whereClause = {};
    
    // Filter by status (isActive)
    if (status && status !== 'all') {
      whereClause.isActive = status === 'Active' || status === 'active';
    }

    // Filter by gender
    if (gender && gender !== 'all') {
      whereClause.gender = gender;
    }

    // Search filter - use Op.iLike for PostgreSQL (case-insensitive)
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
        { userCode: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    console.log('[getAllUsers] Query parameters:', {
      whereClause,
      limit: parseInt(limit),
      offset,
    });

    const { count, rows } = await User.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: BasicDetail,
          as: 'basicDetail',
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: offset,
    });

    console.log('[getAllUsers] Query successful:', {
      count,
      rowsCount: rows.length,
    });

    // Format response
    const formattedUsers = rows.map((user) => {
      const userData = user.toJSON();
      const profileverified = userData.basicDetail?.profileverified || 0;
      const proofverified = userData.basicDetail?.proofverified || 0;
      
      return {
        id: userData.id,
        accountId: userData.accountId,
        userCode: userData.userCode,
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        mobile: userData.phone, // Alias for phone
        gender: userData.gender,
        isActive: userData.isActive,
        status: userData.isActive ? 'Active' : 'Inactive',
        verified: userData.profileveriffied === 1 || userData.verified === true || false,
        profileverified: profileverified,
        proofverified: proofverified,
        basicDetail: userData.basicDetail,
      };
    });

    res.json({
      success: true,
      message: 'Users retrieved successfully',
      data: formattedUsers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
        totalItems: count,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('[getAllUsers] Error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch users',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

// Get user by ID (for admin)
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id, {
      include: [
        {
          model: BasicDetail,
          as: 'basicDetail',
          required: false,
        },
        {
          model: PersonPhoto,
          as: 'personPhoto',
          required: false,
        },
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Format response to include photos
    const userData = user.toJSON();
    const photos = [];
    
    // Handle personPhoto - it might be null, an object, or an array
    let personPhoto = userData.personPhoto;
    if (Array.isArray(personPhoto)) {
      personPhoto = personPhoto.length > 0 ? personPhoto[0] : null;
    }
    
    if (personPhoto && typeof personPhoto === 'object') {
      // Add profile photos (photo1-5)
      for (let i = 1; i <= 5; i++) {
        const photoUrl = personPhoto[`photo${i}`];
        if (photoUrl && photoUrl.trim() !== '' && photoUrl !== 'null') {
          photos.push(photoUrl);
        }
      }
      
      // Add proof image
      if (personPhoto.proofImage && personPhoto.proofImage.trim() !== '' && personPhoto.proofImage !== 'null') {
        photos.push(personPhoto.proofImage);
      }
    }

    // Add photos array to user data
    const formattedUser = {
      ...userData,
      photos: photos,
    };

    res.json({
      success: true,
      data: formattedUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update user status (block/unblock)
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    user.isActive = isActive;
    await user.save();

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'blocked'} successfully`,
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update user (general update)
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const user = await User.findByPk(id, {
      include: [
        {
          model: BasicDetail,
          as: 'basicDetail',
          required: false,
        },
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Update user fields
    const userFields = ['name', 'email', 'phone', 'gender', 'isActive', 'profileveriffied'];
    userFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        user[field] = updateData[field];
      }
    });

    // Handle verified field (maps to profileveriffied)
    if (updateData.verified !== undefined) {
      user.profileveriffied = updateData.verified ? 1 : 0;
    }

    await user.save();

    // Update or create BasicDetail
    let basicDetail = user.basicDetail;
    const basicDetailFields = [
      'dateOfBirth',
      'height',
      'physicalStatus',
      'maritalStatus',
      'religion',
      'caste',
      'subcaste',
      'dosham',
      'education',
      'employmentType',
      'occupation',
      'annualIncome',
      'familyStatus',
    ];

    if (basicDetail) {
      // Update existing basic detail
      basicDetailFields.forEach((field) => {
        if (updateData[field] !== undefined) {
          basicDetail[field] = updateData[field];
        }
      });
      await basicDetail.save();
    } else {
      // Create new basic detail if it doesn't exist
      const basicDetailData = {
        accountId: user.accountId,
      };
      basicDetailFields.forEach((field) => {
        if (updateData[field] !== undefined) {
          basicDetailData[field] = updateData[field];
        }
      });
      basicDetail = await BasicDetail.create(basicDetailData);
    }

    // Fetch updated user with basic detail
    const updatedUser = await User.findByPk(id, {
      include: [
        {
          model: BasicDetail,
          as: 'basicDetail',
          required: false,
        },
      ],
    });

    res.json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    await user.destroy();

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get pending approvals
const getPendingApprovals = async (req, res) => {
  try {
    const users = await User.findAll({
      where: {
        isActive: true, // Get active users
      },
      include: [
        {
          model: BasicDetail,
          as: 'basicDetail',
          required: false,
        },
        {
          model: PersonPhoto,
          as: 'personPhoto',
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    // Format response to include photos and filter users with pending verifications
    const formattedUsers = users
      .map((user) => {
        const userData = user.toJSON();
        const photos = [];
        
        // Handle personPhoto - it might be null, an object, or an array
        let personPhoto = userData.personPhoto;
        if (Array.isArray(personPhoto)) {
          personPhoto = personPhoto.length > 0 ? personPhoto[0] : null;
        }
        
        if (personPhoto && typeof personPhoto === 'object') {
          // Add profile photos (photo1-5)
          for (let i = 1; i <= 5; i++) {
            const photoUrl = personPhoto[`photo${i}`];
            if (photoUrl && photoUrl.trim() !== '' && photoUrl !== 'null') {
              photos.push({
                type: 'profile',
                placement: i,
                url: photoUrl,
                label: `Photo ${i}`
              });
            }
          }
          
          // Add proof image
          if (personPhoto.proofImage && personPhoto.proofImage.trim() !== '' && personPhoto.proofImage !== 'null') {
            photos.push({
              type: 'proof',
              placement: null,
              url: personPhoto.proofImage,
              label: 'Aadhar Card (Proof)'
            });
          }
        }
        
        const profileverified = userData.basicDetail?.profileverified || 0;
        const proofverified = userData.basicDetail?.proofverified || 0;
        
        return {
          ...userData,
          photos: photos,
          profileverified: profileverified,
          proofverified: proofverified,
        };
      })
      // Filter to only show users with photos
      .filter((user) => {
        const hasPhotos = user.photos && user.photos.length > 0;
        return hasPhotos;
      });

    res.json({
      success: true,
      data: formattedUsers,
      count: formattedUsers.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Approve pending item (photo or profile)
const approvePendingItem = async (req, res) => {
  try {
    const { userId, type } = req.body; // type: 'photo', 'profile', 'proof'
    
    if (!userId || !type) {
      return res.status(400).json({
        success: false,
        message: 'userId and type are required',
      });
    }

    const user = await User.findByPk(userId, {
      include: [
        {
          model: BasicDetail,
          as: 'basicDetail',
          required: false,
        },
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    let basicDetail = user.basicDetail;
    if (!basicDetail) {
      basicDetail = await BasicDetail.create({
        accountId: user.accountId,
        profileverified: 0,
        proofverified: 0,
      });
    }

    // Update verification based on type
    if (type === 'proof') {
      basicDetail.proofverified = 1;
    } else if (type === 'photo' || type === 'profile') {
      basicDetail.profileverified = 1;
    }

    await basicDetail.save();

    // Reload basicDetail to get latest values
    await basicDetail.reload();

    // If both profileverified and proofverified are 1, update user's profileveriffied to 1
    if (basicDetail.profileverified === 1 && basicDetail.proofverified === 1) {
      await User.update(
        { profileveriffied: 1 },
        { where: { accountId: user.accountId } }
      );
    }

    res.json({
      success: true,
      message: `${type} approved successfully`,
      data: {
        profileverified: basicDetail.profileverified,
        proofverified: basicDetail.proofverified,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Reject pending item
const rejectPendingItem = async (req, res) => {
  try {
    const { userId, type, reason } = req.body;
    
    if (!userId || !type) {
      return res.status(400).json({
        success: false,
        message: 'userId and type are required',
      });
    }

    const user = await User.findByPk(userId, {
      include: [
        {
          model: BasicDetail,
          as: 'basicDetail',
          required: false,
        },
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    let basicDetail = user.basicDetail;
    if (!basicDetail) {
      basicDetail = await BasicDetail.create({
        accountId: user.accountId,
        profileverified: 0,
        proofverified: 0,
      });
    }

    // Set verification to 2 (rejected) when rejecting
    if (type === 'proof') {
      basicDetail.proofverified = 2;
    } else if (type === 'photo' || type === 'profile') {
      basicDetail.proofverified = 2;
    }

    await basicDetail.save();

    res.json({
      success: true,
      message: `${type} rejected successfully`,
      reason: reason || 'No reason provided',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get blocked users
const getBlockedUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      where: {
        isActive: false,
      },
      include: [
        {
          model: BasicDetail,
          as: 'basicDetail',
          required: false,
        },
      ],
      order: [['updatedAt', 'DESC']],
    });

    res.json({
      success: true,
      data: users,
      count: users.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get horoscope details for a user by accountId (admin)
const getUserHoroscope = async (req, res) => {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      return errorResponse(res, 'Account ID is required', 400);
    }

    const horoscopeDetail = await HoroscopeDetail.findOne({
      where: { accountId },
    });

    if (!horoscopeDetail) {
      return successResponse(res, {
        accountId,
        rasi: null,
        natchathiram: null,
        birthPlace: null,
        birthTime: null,
      });
    }

    return successResponse(res, {
      accountId: horoscopeDetail.accountId,
      rasi: horoscopeDetail.rasi || null,
      natchathiram: horoscopeDetail.natchathiram || null,
      birthPlace: horoscopeDetail.birthPlace || null,
      birthTime: horoscopeDetail.birthTime || null,
    });
  } catch (error) {
    console.error('Error in getUserHoroscope:', error);
    return errorResponse(res, 'Failed to fetch horoscope details', 500);
  }
};

// Get family details for a user by accountId (admin)
const getUserFamily = async (req, res) => {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      return errorResponse(res, 'Account ID is required', 400);
    }

    const familyDetail = await FamilyDetail.findOne({
      where: { accountId },
    });

    if (!familyDetail) {
      return successResponse(res, {
        accountId,
        fatherName: null,
        fatherOccupation: null,
        fatherStatus: null,
        motherName: null,
        motherOccupation: null,
        motherStatus: null,
        siblings: [],
      });
    }

    return successResponse(res, {
      accountId: familyDetail.accountId,
      fatherName: familyDetail.fatherName || null,
      fatherOccupation: familyDetail.fatherOccupation || null,
      fatherStatus: familyDetail.fatherStatus || 'alive',
      motherName: familyDetail.motherName || null,
      motherOccupation: familyDetail.motherOccupation || null,
      motherStatus: familyDetail.motherStatus || 'alive',
      siblings: familyDetail.siblings || [],
    });
  } catch (error) {
    console.error('Error in getUserFamily:', error);
    return errorResponse(res, 'Failed to fetch family details', 500);
  }
};

// Get hobbies for a user by accountId (admin)
const getUserHobbies = async (req, res) => {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      return errorResponse(res, 'Account ID is required', 400);
    }

    const hobby = await Hobby.findOne({
      where: { accountId },
    });

    if (!hobby) {
      return successResponse(res, {
        accountId,
        hobbies: [],
        musicGenres: [],
        bookTypes: [],
        movieTypes: [],
        sports: [],
        cuisines: [],
        languages: [],
      });
    }

    return successResponse(res, {
      accountId: hobby.accountId,
      hobbies: hobby.hobbies || [],
      musicGenres: hobby.musicGenres || [],
      bookTypes: hobby.bookTypes || [],
      movieTypes: hobby.movieTypes || [],
      sports: hobby.sports || [],
      cuisines: hobby.cuisines || [],
      languages: hobby.languages || [],
    });
  } catch (error) {
    console.error('Error in getUserHobbies:', error);
    return errorResponse(res, 'Failed to fetch hobbies', 500);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  updateUserStatus,
  deleteUser,
  getPendingApprovals,
  approvePendingItem,
  rejectPendingItem,
  getBlockedUsers,
  getUserHoroscope,
  getUserFamily,
  getUserHobbies,
};

