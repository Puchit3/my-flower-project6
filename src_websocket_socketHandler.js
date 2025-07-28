const { Server } = require('socket.io');
const { logger } = require('../utils/logger');

let io = null;

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  io.on('connection', (socket) => {
    logger.info(`🔌 Client connected: ${socket.id}`);
    
    // Send welcome message
    socket.emit('news:connected', {
      message: 'Connected to real-time news feed',
      timestamp: new Date().toISOString()
    });

    // Handle client subscribing to specific categories
    socket.on('news:subscribe', (data) => {
      const { categories } = data;
      if (Array.isArray(categories)) {
        categories.forEach(category => {
          socket.join(`category:${category}`);
        });
        logger.info(`Client ${socket.id} subscribed to categories: ${categories.join(', ')}`);
      }
    });

    // Handle client unsubscribing
    socket.on('news:unsubscribe', (data) => {
      const { categories } = data;
      if (Array.isArray(categories)) {
        categories.forEach(category => {
          socket.leave(`category:${category}`);
        });
        logger.info(`Client ${socket.id} unsubscribed from categories: ${categories.join(', ')}`);
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info(`🔌 Client disconnected: ${socket.id}, reason: ${reason}`);
    });

    socket.on('error', (error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
    });
  });

  logger.info('📡 WebSocket server initialized');
  return io;
};

const broadcastNews = (newsItems) => {
  if (!io) return;

  try {
    // Broadcast to all clients
    io.emit('news:update', {
      type: 'new_articles',
      data: newsItems,
      timestamp: new Date().toISOString(),
      count: newsItems.length
    });

    // Broadcast to specific category rooms
    newsItems.forEach(newsItem => {
      io.to(`category:${newsItem.category}`).emit('news:category_update', {
        type: 'category_update',
        category: newsItem.category,
        data: newsItem,
        timestamp: new Date().toISOString()
      });
    });

    logger.info(`📡 Broadcasted ${newsItems.length} news items via WebSocket`);
  } catch (error) {
    logger.error('WebSocket broadcast error:', error);
  }
};

const getSocketInstance = () => io;

module.exports = {
  initializeSocket,
  broadcastNews,
  getSocketInstance
};