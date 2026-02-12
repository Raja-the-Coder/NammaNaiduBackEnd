const PersonPhoto = require('../../models/PersonPhoto.model');
const { uploadBase64Image, deleteImage, extractPublicId } = require('../../services/cloudinary.service');
const { successResponse, errorResponse } = require('../../utils/response');

/**
 * Upload person photos and proof image
 * POST /api/users/photos
 *
 * Photos are stored in Cloudinary under: nammanaidu/users/{personid}/photos
 * Proof images are stored under:        nammanaidu/users/{personid}/proof
 * Profile photos get a "nammanaidu" watermark at the bottom.
 */
const uploadPersonPhotos = async (req, res) => {
  try {
    const { personid, personphoto, proofbase64 } = req.body;

    // Validate required fields
    if (!personid) {
      return errorResponse(res, 'personid is required', 400);
    }

    if (!proofbase64) {
      return errorResponse(res, 'proofbase64 is required', 400);
    }

    // Validate personphoto array
    if (!Array.isArray(personphoto)) {
      return errorResponse(res, 'personphoto must be an array', 400);
    }

    if (personphoto.length > 5) {
      return errorResponse(res, 'Maximum 5 photos allowed', 400);
    }

    // Validate each photo in the array
    for (const photo of personphoto) {
      if (!photo.photoplacement || photo.photoplacement < 1 || photo.photoplacement > 5) {
        return errorResponse(res, 'photoplacement must be between 1 and 5', 400);
      }
      if (!photo.photobase64) {
        return errorResponse(res, `photobase64 is required for photoplacement ${photo.photoplacement}`, 400);
      }
    }

    // Upload proof image to Cloudinary (no watermark, stored under proof folder)
    let proofLink = '';
    try {
      const proofResult = await uploadBase64Image(
        proofbase64,
        `nammanaidu/users/${personid}/proof`,
        `proof-${personid}`
      );
      proofLink = proofResult.url;
    } catch (error) {
      return errorResponse(res, `Failed to upload proof image: ${error.message}`, 500);
    }

    // Upload person photos to Cloudinary (with watermark)
    const photoUploads = [];

    for (const photo of personphoto) {
      try {
        const photoResult = await uploadBase64Image(
          photo.photobase64,
          `nammanaidu/users/${personid}/photos`,
          `photo${photo.photoplacement}-${personid}`,
          { watermark: true }
        );

        photoUploads.push({
          photoplacement: photo.photoplacement,
          url: photoResult.url,
        });
      } catch (error) {
        return errorResponse(res, `Failed to upload photo ${photo.photoplacement}: ${error.message}`, 500);
      }
    }

    // Prepare database update/create data
    const photoData = {
      personId: personid,
      proofImage: proofLink,
    };

    // Map photoplacement to photo fields (photo1, photo2, etc.)
    photoUploads.forEach(({ photoplacement, url }) => {
      photoData[`photo${photoplacement}`] = url;
    });

    // Find or create person photo record
    const [personPhotoRecord, created] = await PersonPhoto.findOrCreate({
      where: { personId: personid },
      defaults: photoData,
    });

    // If record exists, update it (merge with existing photos)
    if (!created) {
      const updateData = { ...photoData };
      for (let i = 1; i <= 5; i++) {
        if (!updateData[`photo${i}`] && personPhotoRecord[`photo${i}`]) {
          updateData[`photo${i}`] = personPhotoRecord[`photo${i}`];
        }
      }
      await personPhotoRecord.update(updateData);
    }

    // Format response
    const responsePhotos = [];
    for (let i = 1; i <= 5; i++) {
      const photoUrl = personPhotoRecord[`photo${i}`] || photoData[`photo${i}`] || null;
      if (photoUrl) {
        responsePhotos.push({
          photoplacement: i,
          [`photo${i}link`]: photoUrl,
        });
      }
    }

    return successResponse(res, {
      personid: personid,
      personphoto: responsePhotos,
      prooflink: proofLink,
      primaryPhoto: personPhotoRecord.primaryPhoto || 1,
      photoOrder: personPhotoRecord.photoOrder || '1,2,3,4,5',
      faceVerified: personPhotoRecord.faceVerified || false,
    }, 201);
  } catch (error) {
    console.error('Error in uploadPersonPhotos:', error);
    return errorResponse(res, `Failed to upload photos: ${error.message}`, 500);
  }
};

/**
 * Get person photos
 * GET /api/users/photos/:personId
 */
const getPersonPhotos = async (req, res) => {
  try {
    const { personId } = req.params;

    if (!personId) {
      return errorResponse(res, 'personId is required', 400);
    }

    const personPhoto = await PersonPhoto.findOne({
      where: { personId: personId },
    });

    if (!personPhoto) {
      return successResponse(res, {
        personid: personId,
        personphoto: [],
        prooflink: '',
        primaryPhoto: 1,
        photoOrder: '1,2,3,4,5',
        faceVerified: false,
      });
    }

    // Format response
    const responsePhotos = [];
    for (let i = 1; i <= 5; i++) {
      const photoUrl = personPhoto[`photo${i}`];
      if (photoUrl) {
        responsePhotos.push({
          photoplacement: i,
          [`photo${i}link`]: photoUrl,
        });
      }
    }

    return successResponse(res, {
      personid: personId,
      personphoto: responsePhotos,
      prooflink: personPhoto.proofImage || '',
      primaryPhoto: personPhoto.primaryPhoto || 1,
      photoOrder: personPhoto.photoOrder || '1,2,3,4,5',
      faceVerified: personPhoto.faceVerified || false,
    });
  } catch (error) {
    console.error('Error in getPersonPhotos:', error);
    return errorResponse(res, `Failed to get photos: ${error.message}`, 500);
  }
};

/**
 * Set primary photo
 * PUT /api/users/photos/set-primary
 * Body: { photoplacement: 2 }
 */
const setPrimaryPhoto = async (req, res) => {
  try {
    const currentUserId = req.accountId;
    const { photoplacement } = req.body;

    if (!photoplacement || photoplacement < 1 || photoplacement > 5) {
      return errorResponse(res, 'photoplacement must be between 1 and 5', 400);
    }

    const personPhoto = await PersonPhoto.findOne({
      where: { personId: currentUserId },
    });

    if (!personPhoto) {
      return errorResponse(res, 'No photos found for this user', 404);
    }

    // Verify the photo slot actually has an image
    if (!personPhoto[`photo${photoplacement}`]) {
      return errorResponse(res, `Photo slot ${photoplacement} is empty`, 400);
    }

    await personPhoto.update({ primaryPhoto: photoplacement });

    return successResponse(res, {
      message: 'Primary photo updated successfully',
      primaryPhoto: photoplacement,
    });
  } catch (error) {
    console.error('Error in setPrimaryPhoto:', error);
    return errorResponse(res, `Failed to set primary photo: ${error.message}`, 500);
  }
};

/**
 * Reorder photos
 * PUT /api/users/photos/reorder
 * Body: { order: [3, 1, 2, 4, 5] }
 *
 * Swaps the actual photo URLs in the database columns so that
 * the new column layout matches the requested display order.
 */
const reorderPhotos = async (req, res) => {
  try {
    const currentUserId = req.accountId;
    const { order } = req.body;

    // Validate order array
    if (!Array.isArray(order) || order.length !== 5) {
      return errorResponse(res, 'order must be an array of 5 numbers [1-5]', 400);
    }

    const sorted = [...order].sort();
    if (JSON.stringify(sorted) !== JSON.stringify([1, 2, 3, 4, 5])) {
      return errorResponse(res, 'order must contain exactly the numbers 1 through 5', 400);
    }

    const personPhoto = await PersonPhoto.findOne({
      where: { personId: currentUserId },
    });

    if (!personPhoto) {
      return errorResponse(res, 'No photos found for this user', 404);
    }

    // Read current photo URLs
    const currentPhotos = {};
    for (let i = 1; i <= 5; i++) {
      currentPhotos[i] = personPhoto[`photo${i}`] || null;
    }

    // Build new layout: new slot i gets the photo from old slot order[i-1]
    const updateData = {};
    for (let newSlot = 1; newSlot <= 5; newSlot++) {
      const oldSlot = order[newSlot - 1];
      updateData[`photo${newSlot}`] = currentPhotos[oldSlot];
    }

    // Also update the primary photo pointer if it was moved
    const oldPrimary = personPhoto.primaryPhoto || 1;
    const newPrimarySlot = order.indexOf(oldPrimary) + 1;
    updateData.primaryPhoto = newPrimarySlot || 1;
    updateData.photoOrder = order.join(',');

    await personPhoto.update(updateData);

    return successResponse(res, {
      message: 'Photos reordered successfully',
      photoOrder: order.join(','),
      primaryPhoto: updateData.primaryPhoto,
    });
  } catch (error) {
    console.error('Error in reorderPhotos:', error);
    return errorResponse(res, `Failed to reorder photos: ${error.message}`, 500);
  }
};

/**
 * Delete a single photo
 * DELETE /api/users/photos/:photoplacement
 */
const deletePhoto = async (req, res) => {
  try {
    const currentUserId = req.accountId;
    const photoplacement = parseInt(req.params.photoplacement, 10);

    if (!photoplacement || photoplacement < 1 || photoplacement > 5) {
      return errorResponse(res, 'photoplacement must be between 1 and 5', 400);
    }

    const personPhoto = await PersonPhoto.findOne({
      where: { personId: currentUserId },
    });

    if (!personPhoto) {
      return errorResponse(res, 'No photos found for this user', 404);
    }

    const photoUrl = personPhoto[`photo${photoplacement}`];
    if (!photoUrl) {
      return errorResponse(res, `Photo slot ${photoplacement} is already empty`, 400);
    }

    // Delete from Cloudinary
    const publicId = extractPublicId(photoUrl);
    if (publicId) {
      try {
        await deleteImage(publicId);
      } catch (cloudErr) {
        console.error('Cloudinary delete failed (continuing):', cloudErr.message);
        // Continue even if Cloudinary delete fails — still clear from DB
      }
    }

    // Clear the photo slot in DB
    const updateData = { [`photo${photoplacement}`]: null };

    // If the deleted photo was primary, pick the next available photo
    if (personPhoto.primaryPhoto === photoplacement) {
      let newPrimary = null;
      for (let i = 1; i <= 5; i++) {
        if (i !== photoplacement && personPhoto[`photo${i}`]) {
          newPrimary = i;
          break;
        }
      }
      updateData.primaryPhoto = newPrimary || 1;
    }

    await personPhoto.update(updateData);

    return successResponse(res, {
      message: `Photo ${photoplacement} deleted successfully`,
      primaryPhoto: personPhoto.primaryPhoto,
    });
  } catch (error) {
    console.error('Error in deletePhoto:', error);
    return errorResponse(res, `Failed to delete photo: ${error.message}`, 500);
  }
};

module.exports = {
  uploadPersonPhotos,
  getPersonPhotos,
  setPrimaryPhoto,
  reorderPhotos,
  deletePhoto,
};
