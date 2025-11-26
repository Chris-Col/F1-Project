// routes/admin.js
import express from 'express';
import { manualScoreGp } from '../services/scoringScheduler.js';
import GrandPrix from '../models/GrandPrix.js';
import logger from '../utils/logger.js';

const router = express.Router();

// POST /api/admin/score-gp
// Manually trigger scoring for a specific GP
router.post('/score-gp', async (req, res) => {
  const log = logger.withRequest(req);
  try {
    const { gpId, seasonYear } = req.body;

    if (!gpId || !seasonYear) {
      log.warn('Missing gpId or seasonYear');
      return res.status(400).json({ error: 'gpId and seasonYear are required' });
    }

    log.info('Manual scoring requested', { gpId, seasonYear });

    const result = await manualScoreGp(gpId, Number(seasonYear));

    log.info('Manual scoring completed', { gpId, result });
    return res.json({ success: true, ...result });
  } catch (err) {
    log.error('Manual scoring failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/gps/:year
// List all GPs for a season (useful for admin UI)
router.get('/gps/:year', async (req, res) => {
  const log = logger.withRequest(req);
  try {
    const year = Number(req.params.year);
    const gps = await GrandPrix.find({ seasonYear: year })
      .select('hypraceId name weekendStart weekendEnd sprintFlag')
      .sort({ weekendStart: 1 });

    log.info('GP list fetched', { year, count: gps.length });
    return res.json({ gps });
  } catch (err) {
    log.error('Failed to fetch GP list', { error: err.message });
    return res.status(500).json({ error: 'Failed to fetch GPs' });
  }
});

export default router;
