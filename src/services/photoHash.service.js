const sharp = require('sharp');
const PersonPhoto = require('../models/PersonPhoto.model');
const User = require('../models/User.model');
const { Op } = require('sequelize');

/**
 * Compute a perceptual hash for an image.
 * Uses average hash (aHash) algorithm:
 * 1. Resize to 8x8 pixels
 * 2. Convert to grayscale
 * 3. Compute average pixel value
 * 4. Generate 64-bit hash based on whether each pixel is above/below average
 *
 * @param {Buffer} imageBuffer - The raw image buffer
 * @returns {Promise<string>} - 64-character binary hash string
 */
async function computePerceptualHash(imageBuffer) {
  try {
    const pixels = await sharp(imageBuffer)
      .resize(8, 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();

    // Compute average
    let sum = 0;
    for (let i = 0; i < pixels.length; i++) {
      sum += pixels[i];
    }
    const avg = sum / pixels.length;

    // Build binary hash
    let hash = '';
    for (let i = 0; i < pixels.length; i++) {
      hash += pixels[i] >= avg ? '1' : '0';
    }

    return hash; // 64-character binary string
  } catch (error) {
    console.error('Error computing perceptual hash:', error);
    return null;
  }
}

/**
 * Compute Hamming distance between two binary hash strings.
 * Lower distance = more similar images.
 *
 * @param {string} hash1
 * @param {string} hash2
 * @returns {number} - Number of differing bits (0-64)
 */
function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  return distance;
}

/**
 * Compute similarity percentage from Hamming distance.
 * @param {number} distance
 * @returns {number} - Percentage 0-100
 */
function similarityFromDistance(distance) {
  return Math.round(((64 - distance) / 64) * 100);
}

/**
 * Find duplicate photos across different accounts.
 * Compares a hash against all stored hashes, excluding the same account.
 *
 * @param {string} hash - The perceptual hash to compare
 * @param {string} excludePersonId - The account to exclude (the uploader)
 * @param {number} threshold - Maximum Hamming distance to consider a duplicate (default: 5)
 * @returns {Promise<Array>} - Array of duplicate matches { personId, photoSlot, hash, distance, similarity }
 */
async function findDuplicates(hash, excludePersonId, threshold = 5) {
  if (!hash) return [];

  try {
    // Fetch all photos that have hashes, excluding the current account
    const photos = await PersonPhoto.findAll({
      where: {
        personId: { [Op.ne]: excludePersonId },
        // At least one hash must exist
        [Op.or]: [
          { photo1Hash: { [Op.ne]: null } },
          { photo2Hash: { [Op.ne]: null } },
          { photo3Hash: { [Op.ne]: null } },
          { photo4Hash: { [Op.ne]: null } },
          { photo5Hash: { [Op.ne]: null } },
        ],
      },
      attributes: ['id', 'personId', 'photo1', 'photo1Hash', 'photo2', 'photo2Hash', 'photo3', 'photo3Hash', 'photo4', 'photo4Hash', 'photo5', 'photo5Hash'],
      raw: true,
    });

    const duplicates = [];

    for (const photo of photos) {
      for (let slot = 1; slot <= 5; slot++) {
        const slotHash = photo[`photo${slot}Hash`];
        const slotUrl = photo[`photo${slot}`];
        if (!slotHash || !slotUrl) continue;

        const distance = hammingDistance(hash, slotHash);
        if (distance <= threshold) {
          duplicates.push({
            personId: photo.personId,
            photoId: photo.id,
            photoSlot: slot,
            photoUrl: slotUrl,
            hash: slotHash,
            distance,
            similarity: similarityFromDistance(distance),
          });
        }
      }
    }

    return duplicates;
  } catch (error) {
    console.error('Error finding duplicates:', error);
    return [];
  }
}

/**
 * Download an image from URL and compute its hash.
 * @param {string} imageUrl
 * @returns {Promise<string|null>}
 */
async function hashFromUrl(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return computePerceptualHash(buffer);
  } catch (error) {
    console.error('Error hashing from URL:', error);
    return null;
  }
}

module.exports = {
  computePerceptualHash,
  hammingDistance,
  similarityFromDistance,
  findDuplicates,
  hashFromUrl,
};
