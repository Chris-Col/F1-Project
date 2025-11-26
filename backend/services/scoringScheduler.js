// services/scoringScheduler.js
import cron from 'node-cron';
import GrandPrix from '../models/GrandPrix.js';
import { scoreGp } from './scoreGp.js';
import logger from '../utils/logger.js';

// Track which GPs have been scored to avoid duplicate scoring
const scoredGps = new Set();

/**
 * Check for GPs that have ended and need scoring
 * Runs every hour to check if any race weekends have completed
 */
async function checkAndScoreCompletedGps() {
  const now = new Date();
  const seasonYear = now.getFullYear();

  logger.info('Checking for completed GPs to score...');

  try {
    // Find GPs where weekend has ended but not yet scored
    const gps = await GrandPrix.find({
      seasonYear,
      weekendEnd: { $lt: now }
    });

    for (const gp of gps) {
      const gpKey = `${gp.hypraceId}-${gp.seasonYear}`;

      // Skip if already scored this session
      if (scoredGps.has(gpKey)) {
        continue;
      }

      // Add buffer time (4 hours after weekend end) to ensure results are available
      const bufferTime = new Date(gp.weekendEnd.getTime() + 4 * 60 * 60 * 1000);
      if (now < bufferTime) {
        logger.debug('GP ended but waiting for buffer time', { gpName: gp.name, bufferTime });
        continue;
      }

      logger.info('Scoring GP', { gpName: gp.name, gpId: gp.hypraceId, sprintFlag: gp.sprintFlag });

      try {
        const result = await scoreGp({
          gpId: gp.hypraceId,
          seasonYear: gp.seasonYear,
          sprintFlag: gp.sprintFlag
        });

        scoredGps.add(gpKey);
        logger.info('GP scored successfully', { gpName: gp.name, actual: result.actual });
      } catch (err) {
        logger.error('Failed to score GP', { gpName: gp.name, error: err.message });
      }
    }
  } catch (err) {
    logger.error('Error checking for completed GPs', { error: err.message });
  }
}

/**
 * Start the scoring scheduler
 * Checks every hour for completed race weekends
 */
export function startScoringScheduler() {
  // Run every hour at minute 30 (e.g., 1:30, 2:30, etc.)
  cron.schedule('30 * * * *', () => {
    checkAndScoreCompletedGps();
  });

  logger.info('Scoring scheduler started (runs every hour at :30)');

  // Also run immediately on startup to catch any missed GPs
  setTimeout(() => {
    checkAndScoreCompletedGps();
  }, 10000); // Wait 10 seconds after startup
}

/**
 * Manually trigger scoring for a specific GP (for admin use)
 */
export async function manualScoreGp(gpId, seasonYear) {
  const gp = await GrandPrix.findOne({ hypraceId: gpId, seasonYear });
  if (!gp) {
    throw new Error('GP not found');
  }

  logger.info('Manual scoring triggered', { gpName: gp.name, gpId, seasonYear });

  const result = await scoreGp({
    gpId: gp.hypraceId,
    seasonYear: gp.seasonYear,
    sprintFlag: gp.sprintFlag
  });

  const gpKey = `${gp.hypraceId}-${gp.seasonYear}`;
  scoredGps.add(gpKey);

  return { gpName: gp.name, ...result };
}
