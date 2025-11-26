// src/utils/raceCache.js
const KEY = 'currentRace';

/**
 * Save the next race the user will predict.
 * @param {{ id: string, name: string, endDate: string }} race
 */
export function cacheRace({ id, name, endDate }) {
  localStorage.setItem(KEY, JSON.stringify({ id, name, endDate })); // endDate must be ISO
}

/**
 * Read the cached race (or null if expired/missing).
 * @returns {{ id: string, name: string, endDate: string } | null}
 */
export function getCachedRace() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const now = new Date();
    const end = parsed?.endDate ? new Date(parsed.endDate) : null;

    if (end && now < end) return parsed;

    // expired or invalid
    localStorage.removeItem(KEY);
    return null;
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }
}
