const express = require('express');
const { authenticateAdmin } = require('../../middleware/adminAuth.middleware');
const {
  getDuplicatePhotos,
  getDuplicateStats,
  flagDuplicateUser,
  backfillHashes,
} = require('./photoDuplicate.controller');

const router = express.Router();
router.use(authenticateAdmin);

router.get('/photo-duplicates', getDuplicatePhotos);
router.get('/photo-duplicate-stats', getDuplicateStats);
router.put('/photo-duplicates/flag/:accountId', flagDuplicateUser);
router.post('/photo-duplicates/backfill', backfillHashes);

module.exports = router;
