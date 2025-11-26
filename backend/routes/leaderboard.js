// routes/leaderboard.js
import express from 'express';
import Prediction from '../models/Prediction.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

const router = express.Router();

/** Resolve the actual users collection name at request time.
 *  Falls back to 'users' if not available yet.
 */
function usersCollection() {
  return User?.collection?.collectionName || 'users';
}

/** SEASON leaderboard */
router.get('/season/:year', async (req, res) => {
  const log = logger.withRequest(req);
  try {
    const year = Number(req.params.year);
    log.info('Fetching season leaderboard', { year });

    if (!Number.isInteger(year)) {
      log.warn('Invalid season year param');
      return res.status(400).json({ error: 'Invalid season year' });
    }

    const USERS = usersCollection();

    const agg = await Prediction.aggregate([
      { $match: { seasonYear: year } },
      { $group: { _id: '$userId', total: { $sum: { $ifNull: ['$score.total', 0] } } } },
      { $sort: { total: -1 } },
      { $lookup: { from: USERS, localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: {
          userId: '$_id',
          _id: 0,
          total: 1,
          username: { $ifNull: ['$user.username', 'Unknown'] }
        }
      },
    ]);

    log.info('Season leaderboard fetched', { year, entries: agg.length });
    res.json({ leaderboard: agg });
  } catch (err) {
    log.error('Season leaderboard fetch failed', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to fetch season leaderboard' });
  }
});

/** SINGLE-GP leaderboard */
router.get('/gp/:gpId', async (req, res) => {
  const log = logger.withRequest(req);
  try {
    const { gpId } = req.params;
    log.info('Fetching GP leaderboard', { gpId });

    if (!gpId) {
      log.warn('Missing gpId param');
      return res.status(400).json({ error: 'Missing gpId' });
    }

    const USERS = usersCollection();

    const agg = await Prediction.aggregate([
      { $match: { gpId } },
      { $project: { userId: 1, score: { $ifNull: ['$score.total', 0] } } },
      { $sort: { score: -1 } },
      { $lookup: { from: USERS, localField: 'userId', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: {
          userId: 1,
          username: { $ifNull: ['$user.username', 'Unknown'] },
          score: 1
        }
      },
    ]);

    log.info('GP leaderboard fetched', { gpId, entries: agg.length });
    res.json({ leaderboard: agg });
  } catch (err) {
    log.error('GP leaderboard fetch failed', { gpId: req.params.gpId, error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to fetch GP leaderboard' });
  }
});

export default router;
