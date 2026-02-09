const PartnerPreference = require('../../models/PartnerPreference.model');
const User = require('../../models/User.model');

// GET /api/users/partner-preferences - get current user's partner preferences
const getPartnerPreferences = async (req, res) => {
  try {
    const accountId = req.accountId;

    const preference = await PartnerPreference.findOne({ where: { accountId } });

    if (!preference) {
      return res.json({
        success: true,
        data: null,
        message: 'No partner preferences set yet',
      });
    }

    res.json({
      success: true,
      data: preference,
    });
  } catch (error) {
    console.error('Error getting partner preferences:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get partner preferences',
    });
  }
};

// POST /api/users/partner-preferences - create or update (upsert) partner preferences
const savePartnerPreferences = async (req, res) => {
  try {
    const accountId = req.accountId;
    const {
      ageMin, ageMax,
      heightMin, heightMax,
      religions, castes, willingToMarryFromAnyCaste,
      educations, occupations,
      incomeMin, incomeMax,
      locations, maritalStatuses,
      dosham, diet,
    } = req.body;

    // Verify user exists
    const user = await User.findOne({ where: { accountId } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Build payload — only include fields that are explicitly provided
    const payload = {};
    if (ageMin !== undefined) payload.ageMin = ageMin;
    if (ageMax !== undefined) payload.ageMax = ageMax;
    if (heightMin !== undefined) payload.heightMin = heightMin;
    if (heightMax !== undefined) payload.heightMax = heightMax;
    if (religions !== undefined) payload.religions = religions;
    if (castes !== undefined) payload.castes = castes;
    if (willingToMarryFromAnyCaste !== undefined) payload.willingToMarryFromAnyCaste = willingToMarryFromAnyCaste;
    if (educations !== undefined) payload.educations = educations;
    if (occupations !== undefined) payload.occupations = occupations;
    if (incomeMin !== undefined) payload.incomeMin = incomeMin;
    if (incomeMax !== undefined) payload.incomeMax = incomeMax;
    if (locations !== undefined) payload.locations = locations;
    if (maritalStatuses !== undefined) payload.maritalStatuses = maritalStatuses;
    if (dosham !== undefined) payload.dosham = dosham;
    if (diet !== undefined) payload.diet = diet;

    // Upsert
    let [preference, created] = await PartnerPreference.findOrCreate({
      where: { accountId },
      defaults: { accountId, ...payload },
    });

    if (!created) {
      await preference.update(payload);
    }

    res.json({
      success: true,
      message: created ? 'Partner preferences created' : 'Partner preferences updated',
      data: preference,
    });
  } catch (error) {
    console.error('Error saving partner preferences:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to save partner preferences',
    });
  }
};

module.exports = {
  getPartnerPreferences,
  savePartnerPreferences,
};
