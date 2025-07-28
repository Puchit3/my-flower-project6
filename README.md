# Real-Time News Aggregation Backend

This project implements a scalable, real-time backend system for a news website, focusing on trustworthy sources, real-time updates, and an intelligent data processing pipeline. It aggregates news from various external APIs and RSS feeds, processes them, handles deduplication, and serves them via a REST API and WebSockets.

## Table of Contents

-   [Features](#features)
-   [Technical Stack](#technical-stack)
-   [Project Structure](#project-structure)
-   [Setup and Installation](#setup-and-installation)
    -   [Prerequisites](#prerequisites)
    -   [Environment Variables](#environment-variables)
    -   [Running with Docker Compose](#running-with-docker-compose)
    -   [Running Manually](#running-manually)
-   [API Endpoints](#api-endpoints)
    -   [Public News Endpoints](#public-news-endpoints)
    -   [Admin Endpoints](#admin-endpoints)
-   [WebSocket Events](#websocket-events)
-   [News Fetching and Deduplication](#news-fetching-and-deduplication)
-   [Logging](#logging)
-   [Health Check](#health-check)
-   [Contributing](#contributing)
-   [License](#license)

## Features

-   **External News Fetching**: Fetches news from highly credible sources (mocked for New York Times, The Guardian, BBC, Reuters, Google News RSS) on a scheduled basis.
-   **Data Normalization**: Parses and normalizes diverse news data into a consistent format.
-   **Real-Time Data Processing**: Utilizes Socket.IO to broadcast newly fetched news to connected clients instantly.
-   **Smart News Deduplication**: Implements intelligent logic to detect and avoid duplicates using content similarity checks and source hashing.
-   **RESTful API**: Provides endpoints for fetching the latest news, filtering by category, and searching by keywords.
-   **Admin API**: Includes protected endpoints for manual news fetching, clearing cache, deactivating news items, and viewing system statistics.
-   **Robustness**: Includes CORS, Rate Limiting, Security (Helmet), Compression, and comprehensive error handling.
-   **Logging**: Basic logging for server operations and errors.
-   **Containerization**: Docker and Docker Compose support for easy setup and deployment.
-   **Database & Caching**: Uses MongoDB for persistent storage and Redis for caching.

## Technical Stack

-   **Backend**: Node.js, Express.js
-   **Database**: MongoDB (via Mongoose ODM)
-   **Caching**: Redis
-   **Real-time Communication**: Socket.IO
-   **HTTP Client**: Axios
-   **RSS Parsing**: `rss-parser`
-   **Task Scheduling**: `node-cron`
-   **Environment Variables**: `dotenv`
-   **Logging**: `winston`, `morgan`
-   **Validation**: `joi`
-   **String Similarity**: `string-similarity`
-   **Security**: `helmet`, `cors`, `express-rate-limit`
-   **Containerization**: Docker, Docker Compose

## Project Structure

```
.
├── .env.example.txt         # Example environment variables
├── Dockerfile                # Dockerfile for building the backend image
├── README.md                 # Project documentation
├── healthcheck.js            # Script for Docker health check
├── docker-compose.yaml       # Docker Compose configuration
├── package.json              # Node.js project dependencies and scripts
├── server.js                 # Main application entry point and server setup
└── src
    ├── config
    │   ├── database.js       # MongoDB connection configuration
    │   └── redis.js          # Redis connection configuration
    ├── models
    │   └── News.js           # Mongoose schema for News articles
    ├── routes
    │   ├── adminRoutes.js    # API routes for administration
    │   └── newsRoutes.js     # Public API routes for news
    ├── services
    │   ├── newsFetcher.js    # Logic for fetching news from external sources
    │   ├── newsScheduler.js  # Schedules periodic news fetching
    │   └── newsService.js    # Core news processing logic (deduplication, saving)
    ├── utils
    │   ├── deduplicator.js   # Utility for news deduplication logic
    │   └── logger.js         # Centralized logging utility
    └── websocket
        └── socketHandler.js  # Socket.IO initialization and event broadcasting
```

## Setup and Installation

### Prerequisites

-   Node.js (v18 or higher) and npm
-   Docker and Docker Compose (recommended for easy setup)
-   MongoDB (if not using Docker Compose)
-   Redis (if not using Docker Compose)

### Environment Variables

Create a `.env` file in the root directory of the project based on `.env.example.txt`.

```dotenv
# Server Configuration
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database Configuration
MONGODB_URI=mongodb://mongo:27017/news-app # Use 'localhost' if not using Docker
REDIS_URL=redis://redis:6379              # Use 'localhost' if not using Docker

# API Keys (Replace with your actual API keys)
GUARDIAN_API_KEY=your_guardian_api_key_here
NYT_API_KEY=your_nyt_api_key_here
ADMIN_API_KEY=your_secure_admin_api_key_here # A secret key for admin access

# Logging
LOG_LEVEL=info # debug, info, warn, error

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000 # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100 # 100 requests
```

**Note on API Keys**: For New York Times and The Guardian, you'll need to obtain API keys from their respective developer portals. For BBC, Reuters, and Google News, the RSS feeds are generally publicly accessible. The provided code mocks actual API calls for demonstration purposes; you would integrate real API clients here.

### Running with Docker Compose (Recommended)

This is the easiest way to get all services (backend, MongoDB, Redis, and Mongo Express) up and running.

1.  **Ensure Docker Desktop is running.**
2.  **Create `.env` file**: Copy `.env.example.txt` to `.env` and fill in your API keys and configuration.
3.  **Build and run the services**:
    ```bash
    docker-compose up --build
    ```
    This command will:
    -   Build the `news-backend` Docker image.
    -   Start MongoDB, Redis, and the backend service.
    -   Start `mongo-express` (MongoDB admin UI) accessible at `http://localhost:8081`.

4.  **Access the application**: The backend API will be running at `http://localhost:3000`.

### Running Manually

1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Ensure MongoDB and Redis servers are running locally.**
    -   Update `MONGODB_URI` and `REDIS_URL` in your `.env` file to use `localhost` if necessary (e.g., `MONGODB_URI=mongodb://localhost:27017/news-app`).
3.  **Start the server**:
    ```bash
    npm start
    ```
    For development with auto-reloading:
    ```bash
    npm run dev
    ```

## API Endpoints

All API endpoints are prefixed with `/api`.

### Public News Endpoints

-   **GET `/api/news/latest`**
    -   **Description**: Retrieves the latest news articles.
    -   **Query Parameters**:
        -   `limit` (optional): Number of articles to return (default: 20, max: 100).
        -   `offset` (optional): Number of articles to skip (default: 0).
    -   **Example**: `GET /api/news/latest?limit=10&offset=0`

-   **GET `/api/news/:category`**
    -   **Description**: Retrieves news articles filtered by category.
    -   **Path Parameters**:
        -   `category` (required): The news category (e.g., `politics`, `technology`, `business`, `sports`, `entertainment`, `health`, `science`, `world`, `general`).
    -   **Query Parameters**:
        -   `limit` (optional): Number of articles to return (default: 20, max: 100).
        -   `offset` (optional): Number of articles to skip (default: 0).
    -   **Example**: `GET /api/news/technology?limit=5`

-   **GET `/api/news/search?q=...`**
    -   **Description**: Searches news articles by keywords in their title or summary.
    -   **Query Parameters**:
        -   `q` (required): The search query string (min: 2 characters).
        -   `limit` (optional): Number of articles to return (default: 20, max: 100).
        -   `offset` (optional): Number of articles to skip (default: 0).
    -   **Example**: `GET /api/news/search?q=election&limit=10`

### Admin Endpoints

These endpoints require an `x-api-key` header with the `ADMIN_API_KEY` configured in your `.env` file.

-   **POST `/api/admin/trigger-fetch`**
    -   **Description**: Manually triggers a news fetching cycle.
    -   **Headers**: `x-api-key: your_secure_admin_api_key_here`
    -   **Example**: `POST /api/admin/trigger-fetch`

-   **GET `/api/admin/stats`**
    -   **Description**: Retrieves various system statistics, including total news count, daily news count, and breakdown by category and source.
    -   **Headers**: `x-api-key: your_secure_admin_api_key_here`
    -   **Example**: `GET /api/admin/stats`

-   **DELETE `/api/admin/cache/clear`**
    -   **Description**: Clears the Redis cache.
    -   **Headers**: `x-api-key: your_secure_admin_api_key_here`
    -   **Example**: `DELETE /api/admin/cache/clear`

-   **POST `/api/admin/news/:id/deactivate`**
    -   **Description**: Deactivates a specific news item, making it no longer visible in public endpoints.
    -   **Path Parameters**:
        -   `id` (required): The MongoDB `_id` of the news item to deactivate.
    -   **Headers**: `x-api-key: your_secure_admin_api_key_here`
    -   **Example**: `POST /api/admin/news/654c8d4a1a0d3e001f3b8a1c/deactivate`

## WebSocket Events

The server uses Socket.IO to provide real-time updates.

-   **Event Channel**: `news:update`
-   **Description**: Emitted to all clients when new news articles are fetched and processed.
-   **Payload**: An array of new news article objects.

-   **Event Channel**: `news:connected`
-   **Description**: Emitted to a newly connected client upon successful WebSocket connection.
-   **Payload**: `{ message: 'Connected to real-time news feed', timestamp: string }`

-   **Event Channel**: `news:subscribe` (Client-to-Server)
-   **Description**: Clients can send this event to subscribe to specific news categories.
-   **Payload**: `{ categories: Array<string> }` (e.g., `{ categories: ['politics', 'technology'] }`)

-   **Event Channel**: `news:unsubscribe` (Client-to-Server)
-   **Description**: Clients can send this event to unsubscribe from specific news categories.
-   **Payload**: `{ categories: Array<string> }`

-   **Event Channel**: `news:category_update`
-   **Description**: Emitted to clients subscribed to a specific category when a new article matching that category is added.
-   **Payload**: `{ type: 'category_update', category: string, data: object, timestamp: string }`

Clients can listen for these events:

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000'); // Or your backend URL

socket.on('connect', () => {
    console.log('Connected to WebSocket server');
    // Example: Subscribe to 'technology' and 'business' news
    socket.emit('news:subscribe', { categories: ['technology', 'business'] });
});

socket.on('news:connected', (data) => {
    console.log('Server message:', data.message);
});

socket.on('news:update', (payload) => {
    console.log('Received new general news articles:', payload.data);
    // Update your UI with the new articles
});

socket.on('news:category_update', (payload) => {
    console.log(`Received new article for category ${payload.category}:`, payload.data);
    // Update category-specific UI
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected from WebSocket server, reason:', reason);
});

socket.on('error', (error) => {
    console.error('WebSocket error:', error);
});
```

## News Fetching and Deduplication

The system automatically fetches news at a scheduled interval (configured in `src/services/newsScheduler.js`). When new articles are fetched, they undergo a deduplication process:

1.  **Source Hash**: Each article's URL and title from a specific source generate a hash. This prevents identical articles from the same source from being re-added.
2.  **Content Similarity**: New articles are compared against recently fetched articles (within a configurable time window or number of articles) using `string-similarity` (Jaro-Winkler distance) on their titles and summaries. If a similarity score exceeds a threshold, the article is considered a duplicate. The current implementation only adds the article if no similar article exists; you could extend this to update an existing article with more comprehensive details or merge sources.

## Logging

The application uses `winston` for structured logging and `morgan` for HTTP request logging. Logs are written to the console and to a `./logs` directory (mounted as a volume in Docker Compose). The log level can be configured in the `.env` file (`LOG_LEVEL`).

## Health Check

A `/health` endpoint is provided which returns a `200 OK` status and server uptime, useful for monitoring and Docker health checks.

## Contributing

Contributions are welcome! Please feel free to open issues or submit pull requests.

### How to Contribute:

1.  **Fork the repository.**
2.  **Create a new branch** for your feature or bug fix: `git checkout -b feature/your-feature-name` or `git checkout -b bugfix/issue-description`.
3.  **Make your changes.** Ensure your code adheres to the existing style and conventions.
4.  **Write tests** for your changes.
5.  **Run tests** to ensure everything is working: `npm test`.
6.  **Commit your changes** with a clear and concise message: `git commit -m "feat: Add new feature"`.
7.  **Push your branch** to your forked repository: `git push origin feature/your-feature-name`.
8.  **Open a Pull Request** to the `main` branch of the original repository.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
