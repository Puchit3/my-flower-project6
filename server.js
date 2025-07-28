require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const { initializeSocket } = require('./src/websocket/socketHandler');
const { connectDatabase } = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');
const { startNewsScheduler } = require('./src/services/newsScheduler');
const { logger } = require('./src/utils/logger');
const newsRoutes = require('./src/routes/newsRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
// app.js or server.js
const express = require('express');
const app = express();

const newsRoutes = require('./src_routes_newsRoutes');
const adminRoutes = require('./src_routes_adminRoutes');

// ... other middleware and configurations

app.use('/api/news', newsRoutes); // Mount news routes under /api/news
app.use('/api/admin', adminRoutes); // Mount admin routes under /api/admin

// ... rest of your application setup and server start

class NewsServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.port = process.env.PORT || 3000;
    
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  initializeMiddleware() {
    // Security middleware
    this.app.use(helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", "ws:", "wss:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Body parsing and compression
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Logging
    this.app.use(morgan('combined', { 
      stream: { write: message => logger.info(message.trim()) }
    }));
  }

  initializeRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // API routes
    this.app.use('/api/news', newsRoutes);
    this.app.use('/api/admin', adminRoutes);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Route not found' });
    });
  }

  initializeErrorHandling() {
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
  }

  async start() {
    try {
      // Initialize external connections
      await connectDatabase();
      await connectRedis();
      
      // Initialize WebSocket
      initializeSocket(this.server);
      
      // Start news fetching scheduler
      startNewsScheduler();
      
      this.server.listen(this.port, () => {
        logger.info(`🚀 News server running on port ${this.port}`);
        logger.info(`📡 WebSocket server initialized`);
        logger.info(`📰 News scheduler started`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async gracefulShutdown() {
    logger.info('Shutting down gracefully...');
    this.server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  }
}
const newsServer = new NewsServer();
newsServer.start();