const AppSetting = require('../../models/AppSetting.model');

// GET /api/admin/settings
const getSettings = async (req, res) => {
  try {
    const settings = await AppSetting.findAll({ order: [['key', 'ASC']] });
    const settingsMap = {};
    settings.forEach((s) => {
      settingsMap[s.key] = s.value;
    });
    res.json({ success: true, data: settingsMap, raw: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/admin/settings
const updateSettings = async (req, res) => {
  try {
    const updates = req.body; // { key: value, key2: value2, ... }
    const results = [];

    for (const [key, value] of Object.entries(updates)) {
      const [setting, created] = await AppSetting.findOrCreate({
        where: { key },
        defaults: { value: String(value) },
      });
      if (!created) {
        setting.value = String(value);
        await setting.save();
      }
      results.push({ key, value: setting.value, created });
    }

    res.json({ success: true, message: 'Settings updated', data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/settings/referral (public)
const getReferralSettings = async (req, res) => {
  try {
    const referrerReward = await AppSetting.findOne({ where: { key: 'referral_referrer_reward' } });
    const referredReward = await AppSetting.findOne({ where: { key: 'referral_referred_reward' } });

    res.json({
      success: true,
      data: {
        referrerReward: parseInt(referrerReward?.value || '3', 10),
        referredReward: parseInt(referredReward?.value || '2', 10),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getSettings, updateSettings, getReferralSettings };
