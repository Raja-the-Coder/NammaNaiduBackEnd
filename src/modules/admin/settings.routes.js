const express = require('express');
const { authenticateAdmin } = require('../../middleware/adminAuth.middleware');
const { getSettings, updateSettings } = require('./settings.controller');

const router = express.Router();
router.use(authenticateAdmin);

router.get('/settings', getSettings);
router.put('/settings', updateSettings);

module.exports = router;
