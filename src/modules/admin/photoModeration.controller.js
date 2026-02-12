const PersonPhoto = require('../../models/PersonPhoto.model');
const User = require('../../models/User.model');
const BasicDetail = require('../../models/BasicDetail.model');
const { Op } = require('sequelize');
const { successResponse, errorResponse } = require('../../utils/response');

/**
 * Get all photos for moderation
 * GET /api/admin/photo-moderation
 */
const getAllPhotosForModeration = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Find all person photos with user information and basic details
    const { count, rows } = await PersonPhoto.findAndCountAll({
      include: [
        {
          model: User,
          as: 'person',
          attributes: ['id', 'accountId', 'name', 'userCode', 'email', 'phone'],
          required: true,
          include: [
            {
              model: BasicDetail,
              as: 'basicDetail',
              attributes: ['proofverified', 'profileverified'],
              required: false,
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: offset,
      raw: false, // Keep as false to get model instances
    });

    // Format response - only include proof images
    const formattedPhotos = [];
    
    rows.forEach((personPhoto) => {
      const user = personPhoto.person;
      if (!user) {
        console.warn(`No user found for personPhoto ID: ${personPhoto.id}`);
        return; // Skip if no user
      }
      
      // Get data - try multiple ways to access proofImage
      const photoData = personPhoto.toJSON();
      const proofImageUrl = personPhoto.getDataValue('proofImage') || personPhoto.proofImage || photoData.proofImage;
      
      // Only add proof image (skip profile photos)
      if (proofImageUrl && proofImageUrl.trim() !== '' && proofImageUrl !== 'null') {
        // Get proof verification status from basic details
        const basicDetail = user.basicDetail;
        const proofverified = basicDetail?.proofverified || 0;
        const profileverified = basicDetail?.profileverified || 0;
        // Determine status: 1 = approved, 2 = rejected, 0 = pending
        let status = 'pending';
        if (proofverified === 1) {
          status = 'approved';
        } else if (proofverified === 2) {
          status = 'rejected';
        }
        
        formattedPhotos.push({
          id: `${personPhoto.id}-proof`,
          personPhotoId: personPhoto.id,
          userId: user.id,
          accountId: user.accountId,
          userName: user.name,
          userCode: user.userCode,
          photoUrl: proofImageUrl,
          photoType: 'proof',
          photoPlacement: null,
          uploadedAt: personPhoto.createdAt,
          status: status,
          profileverified: profileverified,
          proofverified: proofverified,
          faceVerified: personPhoto.faceVerified || false,
          aiDetection: {
            nudity: false,
            blur: false,
            quality: 'good',
          },
        });
      }
    });

    // Filter by status if provided (for now all are pending, but structure is ready)
    let filteredPhotos = formattedPhotos;
    if (status && status !== 'all') {
      filteredPhotos = formattedPhotos.filter(p => p.status === status);
    }

    return successResponse(res, {
      photos: filteredPhotos,
      pagination: {
        total: filteredPhotos.length,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(filteredPhotos.length / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error in getAllPhotosForModeration:', error);
    return errorResponse(res, `Failed to fetch photos: ${error.message}`, 500);
  }
};

/**
 * Approve a photo
 * POST /api/admin/photo-moderation/:id/approve
 */
const approvePhoto = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Parse the ID to get personPhotoId and photo type
    // Format: "personPhotoId-photoType" or "personPhotoId-proof"
    const parts = id.split('-');
    const personPhotoId = parts[0];
    const photoType = parts.slice(1).join('-'); // Handle cases like "photo1", "photo2", "proof"
    
    // Find the person photo record
    const personPhoto = await PersonPhoto.findByPk(personPhotoId, {
      include: [
        {
          model: User,
          as: 'person',
          attributes: ['id', 'accountId'],
          required: true,
        },
      ],
    });

    if (!personPhoto) {
      return errorResponse(res, 'Photo record not found', 404);
    }

    const accountId = personPhoto.person.accountId;

    // Find or create basic detail record
    let basicDetail = await BasicDetail.findOne({
      where: { accountId: accountId },
    });

    if (!basicDetail) {
      // Create basic detail if it doesn't exist
      basicDetail = await BasicDetail.create({
        accountId: accountId,
        profileverified: 0,
        proofverified: 0,
      });
    }

    // Update verification status based on photo type
    if (photoType === 'proof') {
      // Approve proof image - set proofverified to 1
      basicDetail.proofverified = 1;
      await basicDetail.save();
    } else if (photoType.startsWith('photo')) {
      // Approve profile photo - set profileverified to 1
      basicDetail.profileverified = 1;
      await basicDetail.save();
    }

    // Reload basicDetail to get latest values
    await basicDetail.reload();

    // If both profileverified and proofverified are 1, update user's profileveriffied to 1
    if (basicDetail.profileverified === 1 && basicDetail.proofverified === 1) {
      await User.update(
        { profileveriffied: 1 },
        { where: { accountId: accountId } }
      );
    }

    return successResponse(res, { 
      message: 'Photo approved successfully',
      verificationStatus: {
        profileverified: basicDetail.profileverified,
        proofverified: basicDetail.proofverified,
      }
    });
  } catch (error) {
    console.error('Error in approvePhoto:', error);
    return errorResponse(res, `Failed to approve photo: ${error.message}`, 500);
  }
};

/**
 * Reject a photo
 * POST /api/admin/photo-moderation/:id/reject
 */
const rejectPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    // Parse the ID to get personPhotoId and photo type
    const parts = id.split('-');
    const personPhotoId = parts[0];
    const photoType = parts.slice(1).join('-');
    
    // Find the person photo record
    const personPhoto = await PersonPhoto.findByPk(personPhotoId, {
      include: [
        {
          model: User,
          as: 'person',
          attributes: ['id', 'accountId'],
          required: true,
        },
      ],
    });

    if (!personPhoto) {
      return errorResponse(res, 'Photo record not found', 404);
    }

    const accountId = personPhoto.person.accountId;

    // Find basic detail record
    let basicDetail = await BasicDetail.findOne({
      where: { accountId: accountId },
    });

    if (!basicDetail) {
      // Create basic detail if it doesn't exist
      basicDetail = await BasicDetail.create({
        accountId: accountId,
        profileverified: 0,
        proofverified: 0,
      });
    }

    // Reject photo - set verification to 2 (rejected)
    if (photoType === 'proof') {
      basicDetail.proofverified = 2;
      await basicDetail.save();
    } else if (photoType.startsWith('photo')) {
      basicDetail.profileverified = 2;
      await basicDetail.save();
    }

    return successResponse(res, { 
      message: 'Photo rejected successfully',
      reason: reason || 'No reason provided',
    });
  } catch (error) {
    console.error('Error in rejectPhoto:', error);
    return errorResponse(res, `Failed to reject photo: ${error.message}`, 500);
  }
};

/**
 * Verify face (admin marks face as matching proof image)
 * POST /api/admin/photo-moderation/:id/verify-face
 */
const verifyFace = async (req, res) => {
  try {
    const { id } = req.params; // personPhotoId (plain integer)
    const { verified } = req.body; // boolean — true to verify, false to unverify

    const personPhoto = await PersonPhoto.findByPk(id);

    if (!personPhoto) {
      return errorResponse(res, 'Photo record not found', 404);
    }

    const newValue = verified !== undefined ? !!verified : true;
    await personPhoto.update({ faceVerified: newValue });

    return successResponse(res, {
      message: newValue
        ? 'Face verified successfully'
        : 'Face verification removed',
      faceVerified: newValue,
    });
  } catch (error) {
    console.error('Error in verifyFace:', error);
    return errorResponse(res, `Failed to verify face: ${error.message}`, 500);
  }
};

module.exports = {
  getAllPhotosForModeration,
  approvePhoto,
  rejectPhoto,
  verifyFace,
};
