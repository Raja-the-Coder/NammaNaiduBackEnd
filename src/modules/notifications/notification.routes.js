const express = require('express');
const router = express.Router();
const nc = require('./notification.controller');
const { authenticate } = require('../../middleware/auth.middleware');

// ── Core Notifications ─────────────────────────────
router.get('/', authenticate, nc.getMyNotifications);
router.put('/read-all', authenticate, nc.markAllAsRead);
router.put('/:id/read', authenticate, nc.markAsRead);

// ── Notification Preferences ───────────────────────
router.get('/preferences', authenticate, nc.getPreferences);
router.put('/preferences', authenticate, nc.updatePreferences);

// ── Mute / Unmute Users ────────────────────────────
router.get('/muted-users', authenticate, nc.getMutedUsers);
router.post('/mute/:targetAccountId', authenticate, nc.muteUser);
router.delete('/mute/:targetAccountId', authenticate, nc.unmuteUser);

// ── FCM Topic Subscriptions ────────────────────────
router.get('/topics', authenticate, nc.getTopics);
router.post('/topics/subscribe', authenticate, nc.subscribeTopic);
router.post('/topics/unsubscribe', authenticate, nc.unsubscribeTopic);

module.exports = router;
