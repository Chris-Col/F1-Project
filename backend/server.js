// backend/server.js
import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Logging
import logger from './utils/logger.js';
import { addRequestId, httpLogger } from './middleware/requestLogger.js';

// Services
import { syncCalendar } from './services/syncCalender.js';

// Routers
import authRoutes from './routes/authRoutes.js';
import leaderboardRouter from './routes/leaderboard.js';
import predictionsRouter from './routes/predictions.js';
import devAuth from './routes/devAuth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

/* ───────────── Middleware ───────────── */
app.use(addRequestId);  // Add request ID first
app.use(httpLogger);    // Log all HTTP requests

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: false,
}));
app.use(express.json());

/* ───────────── MongoDB ───────────── */
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    logger.info('MongoDB connected');

    // Sync GP calendar on startup
    try {
      logger.info('Syncing GP calendar...');
      await syncCalendar(2025);
      logger.info('GP calendar synced successfully');
    } catch (err) {
      logger.warn('GP calendar sync failed', { error: err.message });
    }
  })
  .catch(err => {
    logger.error('MongoDB connection error', { error: err.message });
    process.exit(1);
  });

/* ───────────── API routes (mount FIRST) ───────────── */
app.use('/api', devAuth);                        // 👈 provides POST /api/dev-login
app.use('/api/auth', authRoutes);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/predictions', predictionsRouter);

// simple health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

/* ───────────── Static / SPA fallback ───────────── */
const clientDist = path.join(__dirname, 'dist'); // change to 'build' if CRA
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.send('API is running (dev)…'));
}

/* ───────────── Error handling middleware ───────────── */
app.use((err, req, res, next) => {
  const log = logger.withRequest(req);
  log.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

/* ───────────── Start server ───────────── */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => logger.info(`Server running on http://localhost:${PORT}`));
