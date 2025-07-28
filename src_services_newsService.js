
const axios = require('axios');
const RSSParser = require('rss-parser');
const stringSimilarity = require('string-similarity');
const crypto = require('crypto');

const News = require('../models/News');
const { getRedisClient } = require('../config/redis');
const { logger } = require('../utils/logger');
const { broadcastNews } = require('../websocket/socketHandler');

class NewsService {
  constructor() {
    this.rssParser = new RSSParser({
      timeout: 10000,
      customFields: {
        item: ['media:content', 'media:thumbnail', 'enclosure']
      }
    });
    
    this.sources = [
      {
        name: 'BBC',
        type: 'rss',
        urls: {
          general: 'http://feeds.bbci.co.uk/news/rss.xml',
          technology: 'http://feeds.bbci.co.uk/news/technology/rss.xml',
          business: 'http://feeds.bbci.co.uk/news/business/rss.xml',
          politics: 'http://feeds.bbci.co.uk/news/politics/rss.xml',
          world: 'http://feeds.bbci.co.uk/news/world/rss.xml'
        }
      },
      {
        name: 'Reuters',
        type: 'rss',
        urls: {
          general: 'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best',
          world: 'https://www.reutersagency.com/feed/?best-regions=north-america&post_type=best',
          technology: 'https://www.reutersagency.com/feed/?best-topics=tech&post_type=best'
        }
      },
      {
        name: 'The Guardian',
        type: 'api',
        baseUrl: 'https://content.guardianapis.com',
        apiKey: process.env.GUARDIAN_API_KEY
      }
    ];
  }

  async fetchAllNews() {
    logger.info('🔄 Starting news fetch cycle');
    const allNews = [];

    for (const source of this.sources) {
      try {
        let newsItems = [];
        
        if (source.type === 'rss') {
          newsItems = await this.fetchRSSNews(source);
        } else if (source.type === 'api' && source.name === 'The Guardian') {
          newsItems = await this.fetchGuardianNews(source);
        }
        
        allNews.push(...newsItems);
      } catch (error) {
        logger.error(`Error fetching from ${source.name}:`, error.message);
      }
    }

    const processedNews = await this.processAndDeduplicateNews(allNews);
    await this.saveNews(processedNews);
    
    logger.info(`✅ Fetch completed: ${processedNews.length} new articles`);
    return processedNews;
  }

  async fetchRSSNews(source) {
    const newsItems = [];
    
    for (const [category, url] of Object.entries(source.urls)) {
      try {
        const feed = await this.rssParser.parseURL(url);
        
        for (const item of feed.items.slice(0, 10)) { // Limit per feed
          const newsItem = {
            title: item.title?.trim(),
            summary: item.contentSnippet || item.content || item.description || '',
            source: source.name,
            url: item.link,
            publishedAt: new Date(item.pubDate || item.isoDate),
            category: this.mapCategory(category),
            image: this.extractImage(item),
            sourceHash: this.generateHash(item.title + item.link)
          };
          
          if (this.isValidNewsItem(newsItem)) {
            newsItems.push(newsItem);
          }
        }
      } catch (error) {
        logger.error(`Error parsing RSS ${url}:`, error.message);
      }
    }
    
    return newsItems;
  }

  async fetchGuardianNews(source) {
    if (!source.apiKey) {
      logger.warn('Guardian API key not provided');
      return [];
    }

    const newsItems = [];
    const categories = ['politics', 'technology', 'business', 'world'];

    for (const category of categories) {
      try {
        const response = await axios.get(`${source.baseUrl}/search`, {
          params: {
            'api-key': source.apiKey,
            section: category,
            'page-size': 10,
            'show-fields': 'thumbnail,trailText,bodyText',
            'order-by': 'newest'
          },
          timeout: 10000
        });

        const articles = response.data.response.results;
        
        for (const article of articles) {
          const newsItem = {
            title: article.webTitle,
            summary: article.fields?.trailText || article.fields?.bodyText?.substring(0, 300) || '',
            source: source.name,
            url: article.webUrl,
            publishedAt: new Date(article.webPublicationDate),
            category: this.mapCategory(category),
            image: article.fields?.thumbnail,
            sourceHash: this.generateHash(article.webTitle + article.webUrl)
          };
          
          if (this.isValidNewsItem(newsItem)) {
            newsItems.push(newsItem);
          }
        }
      } catch (error) {
        logger.error(`Error fetching Guardian ${category}:`, error.message);
      }
    }

    return newsItems;
  }

  async processAndDeduplicateNews(newsItems) {
    // Remove exact duplicates by sourceHash
    const uniqueByHash = new Map();
    newsItems.forEach(item => {
      if (!uniqueByHash.has(item.sourceHash)) {
        uniqueByHash.set(item.sourceHash, item);
      }
    });

    const uniqueItems = Array.from(uniqueByHash.values());
    
    // Check for similar content using string similarity
    const processedItems = [];
    
    for (const item of uniqueItems) {
      let isDuplicate = false;
      
      for (const existingItem of processedItems) {
        const titleSimilarity = stringSimilarity.compareTwoStrings(
          item.title.toLowerCase(),
          existingItem.title.toLowerCase()
        );
        
        if (titleSimilarity > 0.8) { // 80% similarity threshold
          isDuplicate = true;
          logger.debug(`Duplicate detected: "${item.title}" similar to "${existingItem.title}"`);
          break;
        }
      }
      
      if (!isDuplicate) {
        processedItems.push(item);
      }
    }

    return processedItems;
  }

  async saveNews(newsItems) {
    const savedNews = [];
    
    for (const newsData of newsItems) {
      try {
        // Check if already exists
        const existing = await News.findOne({ 
          $or: [
            { url: newsData.url },
            { sourceHash: newsData.sourceHash }
          ]
        });
        
        if (!existing) {
          const news = new News(newsData);
          await news.save();
          savedNews.push(news);
          
          // Cache in Redis
          await this.cacheNews(news);
        }
      } catch (error) {
        logger.error('Error saving news:', error.message);
      }
    }

    // Broadcast new news via WebSocket
    if (savedNews.length > 0) {
      broadcastNews(savedNews);
    }

    return savedNews;
  }

  async cacheNews(news) {
    try {
      const redis = getRedisClient();
      if (redis) {
        // Cache individual news item
        await redis.setEx(`news:${news._id}`, 3600, JSON.stringify(news));
        
        // Add to category cache
        await redis.lPush(`news:category:${news.category}`, news._id.toString());
        await redis.expire(`news:category:${news.category}`, 3600);
        
        // Add to latest news cache
        await redis.lPush('news:latest', news._id.toString());
        await redis.lTrim('news:latest', 0, 99); // Keep latest 100
      }
    } catch (error) {
      logger.error('Redis caching error:', error.message);
    }
  }

  generateHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  extractImage(item) {
    if (item['media:content']) {
      return item['media:content'].$.url;
    }
    if (item['media:thumbnail']) {
      return item['media:thumbnail'].$.url;
    }
    if (item.enclosure && item.enclosure.type?.startsWith('image/')) {
      return item.enclosure.url;
    }
    return null;
  }

  mapCategory(category) {
    const categoryMap = {
      'tech': 'technology',
      'sci': 'science',
      'entertainment': 'entertainment',
      'sport': 'sports'
    };
    return categoryMap[category] || category;
  }

  isValidNewsItem(item) {
    return item.title && 
           item.summary && 
           item.source && 
           item.url && 
           item.publishedAt &&
           item.title.length > 10 &&
           item.summary.length > 20;
  }

  async getLatestNews(limit = 20, offset = 0) {
    try {
      const redis = getRedisClient();
      
      // Try Redis cache first
      if (redis) {
        const cachedIds = await redis.lRange('news:latest', offset, offset + limit - 1);
        if (cachedIds.length > 0) {
          const cachedNews = await Promise.all(
            cachedIds.map(async (id) => {
              const cached = await redis.get(`news:${id}`);
              return cached ? JSON.parse(cached) : null;
            })
          );
          const validNews = cachedNews.filter(Boolean);
          if (validNews.length > 0) {
            return validNews;
          }
        }
      }
      
      // Fallback to database
      const news = await News.find({ isActive: true })
        .sort({ publishedAt: -1 })
        .limit(limit)
        .skip(offset)
        .lean();
        
      return news;
    } catch (error) {
      logger.error('Error getting latest news:', error);
      throw error;
    }
  }

  async getNewsByCategory(category, limit = 20, offset = 0) {
    try {
      const news = await News.find({ 
        category: category, 
        isActive: true 
      })
        .sort({ publishedAt: -1 })
        .limit(limit)
        .skip(offset)
        .lean();
        
      return news;
    } catch (error) {
      logger.error('Error getting news by category:', error);
      throw error;
    }
  }

  async searchNews(query, limit = 20, offset = 0) {
    try {
      const searchRegex = new RegExp(query, 'i');
      const news = await News.find({
        $and: [
          { isActive: true },
          {
            $or: [
              { title: searchRegex },
              { summary: searchRegex }
            ]
          }
        ]
      })
        .sort({ publishedAt: -1 })
        .limit(limit)
        .skip(offset)
        .lean();
        
      return news;
    } catch (error) {
      logger.error('Error searching news:', error);
      throw error;
    }
  }
}

module.exports = new NewsService();
