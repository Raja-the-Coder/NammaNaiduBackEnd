const express = require('express');
const { authenticateAdmin } = require('../../middleware/adminAuth.middleware');
const {
  getAllPages,
  getPageBySlug,
  upsertPage,
  getAllStories,
  createStory,
  updateStory,
  deleteStory,
} = require('./cms.controller');

const router = express.Router();

router.use(authenticateAdmin);

// CMS Pages
router.get('/cms', getAllPages);
router.get('/cms/:slug', getPageBySlug);
router.put('/cms/:slug', upsertPage);

// Success Stories
router.get('/success-stories', getAllStories);
router.post('/success-stories', createStory);
router.put('/success-stories/:id', updateStory);
router.delete('/success-stories/:id', deleteStory);

module.exports = router;
