const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

/**
 * Upload base64 image to Cloudinary
 * @param {string} base64String - Base64 encoded image string (with or without data URI prefix)
 * @param {string} folder - Cloudinary folder path
 * @param {string} publicId - Optional public ID for the image
 * @param {object} options - Additional options
 * @param {boolean} options.watermark - Whether to apply "nammanaidu" watermark at bottom (default: false)
 * @returns {Promise<{url: string, publicId: string}>}
 */
const uploadBase64Image = async (base64String, folder = 'person-photos', publicId = null, options = {}) => {
  try {
    // Remove data URI prefix if present (e.g., "data:image/jpeg;base64,")
    const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
    
    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Create a readable stream from buffer
    const stream = Readable.from(buffer);
    
    // Upload options
    const uploadOptions = {
      folder: folder,
      resource_type: 'image',
      overwrite: true,
    };
    
    if (publicId) {
      uploadOptions.public_id = publicId;
    }

    // Apply watermark transformation if requested
    if (options.watermark) {
      uploadOptions.transformation = [
        {
          overlay: {
            font_family: 'Arial',
            font_size: 28,
            font_weight: 'bold',
            text: 'nammanaidu',
          },
          gravity: 'south',
          y: 15,
          color: '#FFFFFF',
          opacity: 70,
        },
      ];
    }
    
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
            });
          }
        }
      );
      
      stream.pipe(uploadStream);
    });
  } catch (error) {
    throw new Error(`Failed to upload image to Cloudinary: ${error.message}`);
  }
};

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<object>}
 */
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    throw new Error(`Failed to delete image from Cloudinary: ${error.message}`);
  }
};

/**
 * Upload multiple base64 images
 * @param {Array<{base64: string, folder?: string, publicId?: string}>} images
 * @returns {Promise<Array<{url: string, publicId: string}>>}
 */
const uploadMultipleBase64Images = async (images) => {
  try {
    const uploadPromises = images.map(({ base64, folder = 'person-photos', publicId = null }) =>
      uploadBase64Image(base64, folder, publicId)
    );
    
    return await Promise.all(uploadPromises);
  } catch (error) {
    throw new Error(`Failed to upload multiple images: ${error.message}`);
  }
};

/**
 * Upload base64 video to Cloudinary
 * @param {string} base64String - Base64 encoded video string (with or without data URI prefix)
 * @param {string} folder - Cloudinary folder path
 * @param {string} publicId - Optional public ID for the video
 * @returns {Promise<{url: string, publicId: string}>}
 */
const uploadBase64Video = async (base64String, folder = 'nammanaidu/whatsapp', publicId = null) => {
  try {
    const base64Data = base64String.replace(/^data:video\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const stream = Readable.from(buffer);

    const uploadOptions = {
      folder,
      resource_type: 'video',
      overwrite: true,
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
            });
          }
        }
      );

      stream.pipe(uploadStream);
    });
  } catch (error) {
    throw new Error(`Failed to upload video to Cloudinary: ${error.message}`);
  }
};

/**
 * Extract Cloudinary public_id from a secure URL
 * e.g. "https://res.cloudinary.com/xxx/image/upload/v123/nammanaidu/users/abc/photos/photo1-abc.jpg"
 * => "nammanaidu/users/abc/photos/photo1-abc"
 * @param {string} url - Cloudinary secure URL
 * @returns {string|null} publicId or null if not parsable
 */
const extractPublicId = (url) => {
  if (!url) return null;
  try {
    // Match everything after /upload/v{digits}/ and strip the file extension
    const match = url.match(/\/upload\/v\d+\/(.+?)(?:\.\w+)?$/);
    if (match && match[1]) {
      return match[1];
    }
    // Fallback: match after /upload/ without version
    const fallback = url.match(/\/upload\/(.+?)(?:\.\w+)?$/);
    return fallback ? fallback[1] : null;
  } catch {
    return null;
  }
};

module.exports = {
  uploadBase64Image,
  uploadBase64Video,
  deleteImage,
  uploadMultipleBase64Images,
  extractPublicId,
};
