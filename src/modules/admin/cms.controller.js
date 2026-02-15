const PageContent = require('../../models/PageContent.model');
const SuccessStory = require('../../models/SuccessStory.model');

// ───────── Page Content CRUD ─────────

/**
 * GET /api/admin/cms
 * List all CMS pages with status
 */
const getAllPages = async (req, res) => {
  try {
    const pages = await PageContent.findAll({
      order: [['slug', 'ASC']],
      attributes: ['id', 'slug', 'title', 'isPublished', 'lastEditedBy', 'updatedAt'],
    });
    return res.json({ success: true, data: pages });
  } catch (err) {
    console.error('[Admin CMS] getAllPages error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch pages', error: err.message });
  }
};

/**
 * GET /api/admin/cms/:slug
 * Get single page content for editing
 */
const getPageBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    let page = await PageContent.findOne({ where: { slug } });
    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }
    return res.json({ success: true, data: page });
  } catch (err) {
    console.error('[Admin CMS] getPageBySlug error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch page', error: err.message });
  }
};

/**
 * PUT /api/admin/cms/:slug
 * Create or update page content (upsert by slug)
 */
const upsertPage = async (req, res) => {
  try {
    const { slug } = req.params;
    const { title, content, metaDescription, isPublished } = req.body;

    let page = await PageContent.findOne({ where: { slug } });

    if (page) {
      // Update existing
      await page.update({
        title: title !== undefined ? title : page.title,
        content: content !== undefined ? content : page.content,
        metaDescription: metaDescription !== undefined ? metaDescription : page.metaDescription,
        isPublished: isPublished !== undefined ? isPublished : page.isPublished,
        lastEditedBy: req.admin?.id || null,
      });
    } else {
      // Create new
      page = await PageContent.create({
        slug,
        title: title || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        content: content || '',
        metaDescription: metaDescription || '',
        isPublished: isPublished || false,
        lastEditedBy: req.admin?.id || null,
      });
    }

    return res.json({ success: true, message: 'Page saved successfully', data: page });
  } catch (err) {
    console.error('[Admin CMS] upsertPage error:', err);
    return res.status(500).json({ success: false, message: 'Failed to save page', error: err.message });
  }
};

// ───────── Success Stories CRUD ─────────

/**
 * GET /api/admin/success-stories
 * List all stories (including unpublished)
 */
const getAllStories = async (req, res) => {
  try {
    const stories = await SuccessStory.findAll({
      order: [['displayOrder', 'ASC'], ['createdAt', 'DESC']],
    });
    return res.json({ success: true, data: stories });
  } catch (err) {
    console.error('[Admin CMS] getAllStories error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch stories', error: err.message });
  }
};

/**
 * POST /api/admin/success-stories
 * Create new story
 */
const createStory = async (req, res) => {
  try {
    const { groomName, brideName, subcaste, marriedYear, story, photoUrl, rating, isPublished, displayOrder } = req.body;

    if (!groomName || !brideName || !story) {
      return res.status(400).json({ success: false, message: 'groomName, brideName, and story are required' });
    }

    const newStory = await SuccessStory.create({
      groomName,
      brideName,
      subcaste: subcaste || null,
      marriedYear: marriedYear || null,
      story,
      photoUrl: photoUrl || null,
      rating: rating || 5,
      isPublished: isPublished !== undefined ? isPublished : true,
      displayOrder: displayOrder || 0,
    });

    return res.status(201).json({ success: true, message: 'Story created', data: newStory });
  } catch (err) {
    console.error('[Admin CMS] createStory error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create story', error: err.message });
  }
};

/**
 * PUT /api/admin/success-stories/:id
 * Update story
 */
const updateStory = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await SuccessStory.findByPk(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    const { groomName, brideName, subcaste, marriedYear, story, photoUrl, rating, isPublished, displayOrder } = req.body;

    await existing.update({
      groomName: groomName !== undefined ? groomName : existing.groomName,
      brideName: brideName !== undefined ? brideName : existing.brideName,
      subcaste: subcaste !== undefined ? subcaste : existing.subcaste,
      marriedYear: marriedYear !== undefined ? marriedYear : existing.marriedYear,
      story: story !== undefined ? story : existing.story,
      photoUrl: photoUrl !== undefined ? photoUrl : existing.photoUrl,
      rating: rating !== undefined ? rating : existing.rating,
      isPublished: isPublished !== undefined ? isPublished : existing.isPublished,
      displayOrder: displayOrder !== undefined ? displayOrder : existing.displayOrder,
    });

    return res.json({ success: true, message: 'Story updated', data: existing });
  } catch (err) {
    console.error('[Admin CMS] updateStory error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update story', error: err.message });
  }
};

/**
 * DELETE /api/admin/success-stories/:id
 * Delete story
 */
const deleteStory = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await SuccessStory.findByPk(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    await existing.destroy();
    return res.json({ success: true, message: 'Story deleted' });
  } catch (err) {
    console.error('[Admin CMS] deleteStory error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete story', error: err.message });
  }
};

module.exports = {
  getAllPages,
  getPageBySlug,
  upsertPage,
  getAllStories,
  createStory,
  updateStory,
  deleteStory,
};
