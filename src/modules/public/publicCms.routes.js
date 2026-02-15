const express = require('express');
const { getPublicPage, getPublicStories } = require('./publicCms.controller');

const router = express.Router();

// Public CMS pages (no auth required)
router.get('/cms/:slug', getPublicPage);
router.get('/success-stories', getPublicStories);

module.exports = router;
