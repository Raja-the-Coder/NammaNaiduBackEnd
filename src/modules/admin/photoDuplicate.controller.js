const PersonPhoto = require('../../models/PersonPhoto.model');
const User = require('../../models/User.model');
const { Op } = require('sequelize');
const { hammingDistance, similarityFromDistance, hashFromUrl } = require('../../services/photoHash.service');

// ─── Scan and find duplicate photos across accounts ──────────────────────────
const getDuplicatePhotos = async (req, res) => {
  try {
    const { page = 1, limit = 20, threshold = 5 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Fetch all photos that have at least one hash
    const allPhotos = await PersonPhoto.findAll({
      where: {
        [Op.or]: [
          { photo1Hash: { [Op.ne]: null } },
          { photo2Hash: { [Op.ne]: null } },
          { photo3Hash: { [Op.ne]: null } },
          { photo4Hash: { [Op.ne]: null } },
          { photo5Hash: { [Op.ne]: null } },
        ],
      },
      include: [
        {
          model: User,
          as: 'person',
          attributes: ['accountId', 'name', 'userCode', 'gender', 'isActive'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    // Build a flat list of (photo, hash, personId, slot)
    const hashEntries = [];
    for (const photo of allPhotos) {
      for (let slot = 1; slot <= 5; slot++) {
        const hash = photo[`photo${slot}Hash`];
        const url = photo[`photo${slot}`];
        if (hash && url) {
          hashEntries.push({
            photoId: photo.id,
            personId: photo.personId,
            user: photo.person,
            slot,
            url,
            hash,
          });
        }
      }
    }

    // Compare all pairs (different accounts only), deduplicate
    const duplicatePairs = [];
    const seen = new Set();

    for (let i = 0; i < hashEntries.length; i++) {
      for (let j = i + 1; j < hashEntries.length; j++) {
        const a = hashEntries[i];
        const b = hashEntries[j];

        // Only compare across different accounts
        if (a.personId === b.personId) continue;

        const dist = hammingDistance(a.hash, b.hash);
        if (dist <= parseInt(threshold)) {
          // Deduplicate key
          const key = [a.personId, a.slot, b.personId, b.slot].sort().join(':');
          if (seen.has(key)) continue;
          seen.add(key);

          duplicatePairs.push({
            photoA: {
              photoId: a.photoId,
              personId: a.personId,
              user: a.user,
              slot: a.slot,
              url: a.url,
            },
            photoB: {
              photoId: b.photoId,
              personId: b.personId,
              user: b.user,
              slot: b.slot,
              url: b.url,
            },
            distance: dist,
            similarity: similarityFromDistance(dist),
          });
        }
      }
    }

    // Sort by similarity descending
    duplicatePairs.sort((a, b) => b.similarity - a.similarity);

    const total = duplicatePairs.length;
    const paginated = duplicatePairs.slice(offset, offset + parseInt(limit));

    return res.json({
      success: true,
      data: paginated,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error getting duplicate photos:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Get duplicate photo stats ───────────────────────────────────────────────
const getDuplicateStats = async (req, res) => {
  try {
    const photosWithHashes = await PersonPhoto.count({
      where: {
        [Op.or]: [
          { photo1Hash: { [Op.ne]: null } },
          { photo2Hash: { [Op.ne]: null } },
          { photo3Hash: { [Op.ne]: null } },
          { photo4Hash: { [Op.ne]: null } },
          { photo5Hash: { [Op.ne]: null } },
        ],
      },
    });

    const totalPhotos = await PersonPhoto.count();

    return res.json({
      success: true,
      data: {
        totalPhotos,
        photosWithHashes,
        hashCoverage: totalPhotos > 0 ? Math.round((photosWithHashes / totalPhotos) * 100) : 0,
      },
    });
  } catch (error) {
    console.error('Error getting duplicate stats:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Flag a user for duplicate photos ────────────────────────────────────────
const flagDuplicateUser = async (req, res) => {
  try {
    const { accountId } = req.params;

    const user = await User.findOne({ where: { accountId } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await user.update({
      isFlagged: true,
      flagReason: `Flagged for duplicate photo detected by admin on ${new Date().toISOString()}`,
    });

    return res.json({ success: true, message: 'User flagged for duplicate photo' });
  } catch (error) {
    console.error('Error flagging duplicate user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Backfill hashes for existing photos ─────────────────────────────────────
const backfillHashes = async (req, res) => {
  try {
    const { batchSize = 10 } = req.query;

    // Find photos that have URLs but no hashes
    const photos = await PersonPhoto.findAll({
      where: {
        [Op.and]: [
          {
            [Op.or]: [
              { photo1: { [Op.ne]: null } },
              { photo2: { [Op.ne]: null } },
              { photo3: { [Op.ne]: null } },
              { photo4: { [Op.ne]: null } },
              { photo5: { [Op.ne]: null } },
            ],
          },
          {
            photo1Hash: null,
            photo2Hash: null,
            photo3Hash: null,
            photo4Hash: null,
            photo5Hash: null,
          },
        ],
      },
      limit: parseInt(batchSize),
      order: [['createdAt', 'DESC']],
    });

    let processed = 0;
    let hashed = 0;

    for (const photo of photos) {
      const updateData = {};
      for (let slot = 1; slot <= 5; slot++) {
        const url = photo[`photo${slot}`];
        const existingHash = photo[`photo${slot}Hash`];
        if (url && !existingHash) {
          try {
            const hash = await hashFromUrl(url);
            if (hash) {
              updateData[`photo${slot}Hash`] = hash;
              hashed++;
            }
          } catch (err) {
            console.error(`Error hashing photo${slot} for ${photo.personId}:`, err.message);
          }
        }
      }
      if (Object.keys(updateData).length > 0) {
        await photo.update(updateData);
      }
      processed++;
    }

    return res.json({
      success: true,
      message: `Backfill complete: ${processed} records processed, ${hashed} hashes computed`,
      data: { processed, hashed, remaining: photos.length === parseInt(batchSize) ? 'more available' : 'done' },
    });
  } catch (error) {
    console.error('Error in backfill:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getDuplicatePhotos,
  getDuplicateStats,
  flagDuplicateUser,
  backfillHashes,
};
