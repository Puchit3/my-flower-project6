const cron = require('node-cron');
const newsService = require('./newsService');
const { logger } = require('../utils/logger');

class NewsScheduler {
  constructor() {
    this.isRunning = false;
    this.jobs = [];
  }

  start() {
    logger.info('📅 Starting news scheduler');
    
    // Fetch news every 5 minutes
    const mainJob = cron.schedule('*/5 * * * *', async () => {
      if (this.isRunning) {
        logger.warn('Previous news fetch still running, skipping...');
        return;
      }
      
      this.isRunning = true;
      try {
        await newsService.fetchAllNews();
      } catch (error) {
        logger.error('Scheduled news fetch error:', error);
      } finally {
        this.isRunning = false;
      }
    }, {
      scheduled: false
    });

    // Cleanup old news daily at 2 AM
    const cleanupJob = cron.schedule('0 2 * * *', async () => {
      try {
        await this.cleanupOldNews();
      } catch (error) {
        logger.error('News cleanup error:', error);
      }
    }, {
      scheduled: false
    });

    this.jobs.push(mainJob, cleanupJob);
    
    // Start all jobs
    this.jobs.forEach(job => job.start());
    
    // Initial fetch
    setTimeout(() => {
      newsService.fetchAllNews().catch(error => {
        logger.error('Initial news fetch error:', error);
      });
    }, 2000);
  }

  async cleanupOldNews() {
    const News = require('../models/News');
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    try {
      const result = await News.updateMany(
        { publishedAt: { $lt: cutoffDate } },
        { isActive: false }
      );
      
      logger.info(`🧹 Cleaned up ${result.modifiedCount} old news articles`);
    } catch (error) {
      logger.error('Cleanup error:', error);
    }
  }

  stop() {
    logger.info('⏹️ Stopping news scheduler');
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
  }
}

const startNewsScheduler = () => {
  const scheduler = new NewsScheduler();
  scheduler.start();
  return scheduler;
};

module.exports = { startNewsScheduler };
