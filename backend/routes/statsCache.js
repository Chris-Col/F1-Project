/**
 * Routes to serve pre-cached driver stats and teammate H2H data
 * These endpoints serve static JSON files instead of hitting the Hyprace API
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const dataDir = path.join(__dirname, '..', 'data');

/**
 * GET /api/stats/drivers
 * Returns cached driver statistics
 */
router.get('/drivers', (req, res) => {
  try {
    const filePath = path.join(dataDir, 'driverStats.json');

    if (!fs.existsSync(filePath)) {
      return res.status(503).json({
        error: 'Data not available',
        message: 'Driver stats have not been cached yet. Run: node scripts/fetchStaticData.js',
      });
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(data);
  } catch (err) {
    console.error('Error serving driver stats:', err);
    res.status(500).json({ error: 'Failed to load driver stats' });
  }
});

/**
 * GET /api/stats/h2h
 * Returns cached teammate head-to-head data
 */
router.get('/h2h', (req, res) => {
  try {
    const filePath = path.join(dataDir, 'teammateH2H.json');

    if (!fs.existsSync(filePath)) {
      return res.status(503).json({
        error: 'Data not available',
        message: 'H2H data has not been cached yet. Run: node scripts/fetchStaticData.js',
      });
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(data);
  } catch (err) {
    console.error('Error serving H2H data:', err);
    res.status(500).json({ error: 'Failed to load H2H data' });
  }
});

/**
 * GET /api/stats/metadata
 * Returns info about when data was last updated
 */
router.get('/metadata', (req, res) => {
  try {
    const driverStatsPath = path.join(dataDir, 'driverStats.json');
    const h2hPath = path.join(dataDir, 'teammateH2H.json');

    const result = {
      driverStats: null,
      teammateH2H: null,
    };

    if (fs.existsSync(driverStatsPath)) {
      const data = JSON.parse(fs.readFileSync(driverStatsPath, 'utf-8'));
      result.driverStats = data.metadata;
    }

    if (fs.existsSync(h2hPath)) {
      const data = JSON.parse(fs.readFileSync(h2hPath, 'utf-8'));
      result.teammateH2H = data.metadata;
    }

    res.json(result);
  } catch (err) {
    console.error('Error reading metadata:', err);
    res.status(500).json({ error: 'Failed to read metadata' });
  }
});

export default router;
