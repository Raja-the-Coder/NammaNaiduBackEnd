const PageContent = require('../../models/PageContent.model');
const SuccessStory = require('../../models/SuccessStory.model');

/**
 * GET /api/cms/:slug
 * Get published page content by slug (public, no auth)
 */
const getPublicPage = async (req, res) => {
  try {
    const { slug } = req.params;
    const page = await PageContent.findOne({
      where: { slug, isPublished: true },
      attributes: ['slug', 'title', 'content', 'metaDescription', 'updatedAt'],
    });

    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }

    return res.json({ success: true, data: page });
  } catch (err) {
    console.error('[Public CMS] getPublicPage error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch page', error: err.message });
  }
};

/**
 * GET /api/success-stories
 * Get published success stories (ordered by displayOrder)
 */
const getPublicStories = async (req, res) => {
  try {
    const stories = await SuccessStory.findAll({
      where: { isPublished: true },
      order: [['displayOrder', 'ASC'], ['createdAt', 'DESC']],
      attributes: ['id', 'groomName', 'brideName', 'subcaste', 'marriedYear', 'story', 'photoUrl', 'rating', 'createdAt'],
    });

    return res.json({ success: true, data: stories });
  } catch (err) {
    console.error('[Public CMS] getPublicStories error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch stories', error: err.message });
  }
};

module.exports = {
  getPublicPage,
  getPublicStories,
};
