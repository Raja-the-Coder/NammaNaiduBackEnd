const PrivacySettings = require('../../models/PrivacySettings.model');
const User = require('../../models/User.model');

const VALID_ENUMS = {
  profileVisibility: ['public', 'members', 'hidden'],
  showPhotosTo: ['everyone', 'accepted_only', 'premium_only', 'nobody'],
  showPhone: ['everyone', 'accepted_only', 'premium_only', 'nobody'],
  showEmail: ['everyone', 'accepted_only', 'nobody'],
};

const DEFAULTS = {
  profileVisibility: 'members',
  showPhotosTo: 'everyone',
  blurPhotos: false,
  showPhone: 'accepted_only',
  showEmail: 'nobody',
  hideFromSearch: false,
  hideLastSeen: true,
  hideOnlineStatus: true,
  visibleToCastes: null,
  visibleToReligions: null,
};

// GET /api/users/privacy — Get current privacy settings (auto-creates if missing)
const getPrivacySettings = async (req, res) => {
  try {
    const accountId = req.accountId;

    let settings = await PrivacySettings.findOne({ where: { accountId } });

    if (!settings) {
      // Auto-create with defaults, syncing profileVisibility from User table
      const user = await User.findOne({
        where: { accountId },
        attributes: ['profileVisibility'],
      });

      settings = await PrivacySettings.create({
        accountId,
        profileVisibility: user?.profileVisibility || 'members',
      });
    }

    return res.json({
      success: true,
      data: {
        profileVisibility: settings.profileVisibility,
        showPhotosTo: settings.showPhotosTo,
        blurPhotos: settings.blurPhotos,
        showPhone: settings.showPhone,
        showEmail: settings.showEmail,
        hideFromSearch: settings.hideFromSearch,
        hideLastSeen: settings.hideLastSeen,
        hideOnlineStatus: settings.hideOnlineStatus,
        visibleToCastes: settings.visibleToCastes,
        visibleToReligions: settings.visibleToReligions,
      },
    });
  } catch (error) {
    console.error('Error fetching privacy settings:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/users/privacy — Update privacy settings
const updatePrivacySettings = async (req, res) => {
  try {
    const accountId = req.accountId;
    const updates = req.body;

    // Validate ENUM fields
    for (const [field, allowedValues] of Object.entries(VALID_ENUMS)) {
      if (updates[field] !== undefined && !allowedValues.includes(updates[field])) {
        return res.status(400).json({
          success: false,
          message: `Invalid value for ${field}. Allowed: ${allowedValues.join(', ')}`,
        });
      }
    }

    // Validate boolean fields
    const booleanFields = ['blurPhotos', 'hideFromSearch', 'hideLastSeen', 'hideOnlineStatus'];
    for (const field of booleanFields) {
      if (updates[field] !== undefined && typeof updates[field] !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: `${field} must be a boolean`,
        });
      }
    }

    // Validate JSONB fields (must be array of strings or null)
    const jsonbFields = ['visibleToCastes', 'visibleToReligions'];
    for (const field of jsonbFields) {
      if (updates[field] !== undefined && updates[field] !== null) {
        if (!Array.isArray(updates[field]) || !updates[field].every(v => typeof v === 'string')) {
          return res.status(400).json({
            success: false,
            message: `${field} must be an array of strings or null`,
          });
        }
        // Empty array means "no restriction" — store as null
        if (updates[field].length === 0) {
          updates[field] = null;
        }
      }
    }

    // Find or create settings
    let [settings, created] = await PrivacySettings.findOrCreate({
      where: { accountId },
      defaults: { accountId, ...DEFAULTS },
    });

    // Build update object with only allowed fields
    const allowedFields = [
      'profileVisibility', 'showPhotosTo', 'blurPhotos',
      'showPhone', 'showEmail',
      'hideFromSearch', 'hideLastSeen', 'hideOnlineStatus',
      'visibleToCastes', 'visibleToReligions',
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update',
      });
    }

    await settings.update(updateData);

    // Keep User.profileVisibility in sync
    if (updateData.profileVisibility) {
      await User.update(
        { profileVisibility: updateData.profileVisibility },
        { where: { accountId } }
      );
    }

    return res.json({
      success: true,
      message: 'Privacy settings updated successfully',
      data: {
        profileVisibility: settings.profileVisibility,
        showPhotosTo: settings.showPhotosTo,
        blurPhotos: settings.blurPhotos,
        showPhone: settings.showPhone,
        showEmail: settings.showEmail,
        hideFromSearch: settings.hideFromSearch,
        hideLastSeen: settings.hideLastSeen,
        hideOnlineStatus: settings.hideOnlineStatus,
        visibleToCastes: settings.visibleToCastes,
        visibleToReligions: settings.visibleToReligions,
      },
    });
  } catch (error) {
    console.error('Error updating privacy settings:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/users/privacy/reset — Reset to defaults
const resetPrivacySettings = async (req, res) => {
  try {
    const accountId = req.accountId;

    const [settings, created] = await PrivacySettings.findOrCreate({
      where: { accountId },
      defaults: { accountId, ...DEFAULTS },
    });

    if (!created) {
      await settings.update(DEFAULTS);
    }

    // Sync User.profileVisibility
    await User.update(
      { profileVisibility: DEFAULTS.profileVisibility },
      { where: { accountId } }
    );

    return res.json({
      success: true,
      message: 'Privacy settings reset to defaults',
      data: DEFAULTS,
    });
  } catch (error) {
    console.error('Error resetting privacy settings:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getPrivacySettings,
  updatePrivacySettings,
  resetPrivacySettings,
};
