const express = require('express');
const newsService = require('../services/newsService');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../config/redis');
const News = require('../models/News');

const router = express.Router();

// Simple API key middleware for admin routes
const authenticateAdmin = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.ADMIN_API_KEY;
  
  if (!validApiKey) {
    return res.status(501).json({ error: 'Admin API not configured' });
  }
  
  if (!apiKey || apiKey !== validApiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
};

// POST /api/admin/trigger-fetch - Manual news fetch trigger
router.post('/trigger-fetch', authenticateAdmin, async (req, res) => {
  try {
    logger.info('🔄 Manual news fetch triggered by admin');
    const newNews = await newsService.fetchAllNews();
    
    res.json({
      success: true,
      message: 'News fetch completed',
      newArticles: newNews.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Admin trigger fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// GET /api/admin/stats - Get system statistics
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const totalNews = await News.countDocuments({ isActive: true });
    const todayNews = await News.countDocuments({
      isActive: true,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    const categoryStats = await News.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const sourceStats = await News.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      stats: {
        totalActiveNews: totalNews,
        todayNews: todayNews,
        categoryBreakdown: categoryStats,
        sourceBreakdown: sourceStats,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// DELETE /api/admin/cache/clear - Clear Redis cache
router.delete('/cache/clear', authenticateAdmin, async (req, res) => {
  try {
    const redis = getRedisClient();
    if (redis) {
      await redis.flushDb();
      logger.info('🧹 Redis cache cleared by admin');
      res.json({ success: true, message: 'Cache cleared successfully' });
    } else {
      res.status(503).json({ error: 'Redis not available' });
    }
  } catch (error) {
    logger.error('Admin cache clear error:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// POST /api/admin/news/:id/deactivate - Deactivate specific news item
router.post('/news/:id/deactivate', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const news = await News.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );
    
    if (!news) {
      return res.status(404).json({ error: 'News item not found' });
    }
    
    logger.info(`📰 News item deactivated by admin: ${id}`);
    res.json({ success: true, message: 'News item deactivated', data: news });
  } catch (error) {
    logger.error('Admin deactivate news error:', error);
    res.status(500).json({ error: 'Failed to deactivate news item' });
  }
});

module.exports = router;
