const express = require('express');
const {
  getAllPhotosForModeration,
  approvePhoto,
  rejectPhoto,
  verifyFace,
} = require('./photoModeration.controller');
const { authenticateAdmin } = require('../../middleware/adminAuth.middleware');

const router = express.Router();

// All routes require admin authentication
router.use(authenticateAdmin);

// Get all photos for moderation
router.get('/photo-moderation', getAllPhotosForModeration);

// Approve a photo
router.post('/photo-moderation/:id/approve', approvePhoto);

// Reject a photo
router.post('/photo-moderation/:id/reject', rejectPhoto);

// Verify face (admin confirms face matches proof image)
router.post('/photo-moderation/:id/verify-face', verifyFace);

module.exports = router;
