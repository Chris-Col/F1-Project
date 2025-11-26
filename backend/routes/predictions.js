import express from 'express';
import requireAuth from '../middleware/requireAuth.js';
import Prediction from '../models/Prediction.js';
import GrandPrix from '../models/GrandPrix.js';
import logger from '../utils/logger.js';

const router = express.Router();

// POST /api/predictions/upsert
async function upsertHandler(req, res) {
  const log = logger.withRequest(req);
  try {
    const { gpId, seasonYear, picks = {} } = req.body || {};
    log.info('Prediction upsert request', { gpId, seasonYear, picks });

    if (!gpId || !Number.isInteger(Number(seasonYear))) {
      log.warn('Invalid request - missing gpId or seasonYear');
      return res.status(400).json({ error: 'gpId and seasonYear are required' });
    }

    const year = Number(seasonYear);

    const gp = await GrandPrix.findOne({ hypraceId: gpId, seasonYear: year });
    if (!gp) {
      log.warn('GP not found', { gpId, year });
      return res.status(404).json({ error: 'GP not found on server' });
    }

    if (new Date() >= new Date(gp.weekendStart)) {
      log.warn('Predictions locked', { gpId, weekendStart: gp.weekendStart });
      return res.status(403).json({ error: 'Predictions are locked for this GP' });
    }

    const filter = { userId: req.user.id, seasonYear: year, gpId };

    // sanitize + accept only known fields; keep arrays unique and <= 3
    const allowed = ['sprintQualiTop3', 'sprintRaceTop3', 'qualiTop3', 'raceTop3'];
    const set = { seasonYear: year };
    for (const key of allowed) {
      if (Array.isArray(picks[key])) {
        const arr = [...new Set(picks[key].map(String).map(s => s.trim()).filter(Boolean))].slice(0, 3);
        set[`picks.${key}`] = arr;
      }
    }

    const update = {
      $set: set,
      $setOnInsert: {
        userId: req.user.id,
        gpId,
        lockedAt: gp.weekendStart,
      }
    };

    const opts = { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true };
    const doc = await Prediction.findOneAndUpdate(filter, update, opts);
    log.info('Prediction saved successfully', { predictionId: doc._id });
    return res.json({ prediction: doc });
  } catch (e) {
    log.error('Prediction upsert failed', { error: e.message, stack: e.stack });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
router.post('/upsert', requireAuth, upsertHandler);
router.post('/merge-upsert-top3', requireAuth, upsertHandler);

// GET /api/predictions/:gpId?seasonYear=2025
router.get('/:gpId', requireAuth, async (req, res) => {
  const log = logger.withRequest(req);
  try {
    const { gpId } = req.params;
    const seasonYear = Number(req.query.seasonYear);
    log.info('Fetching prediction', { gpId, seasonYear });

    if (!Number.isInteger(seasonYear)) {
      log.warn('Invalid seasonYear param');
      return res.status(400).json({ error: 'seasonYear query param is required' });
    }
    const doc = await Prediction.findOne({
      userId: req.user.id,
      gpId,
      seasonYear
    });
    log.info('Prediction fetched', { found: !!doc });
    return res.json({ prediction: doc });
  } catch (e) {
    log.error('Prediction fetch failed', { error: e.message, stack: e.stack });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
