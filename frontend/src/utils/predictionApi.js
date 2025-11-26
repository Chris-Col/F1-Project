// src/utils/predictionApi.js
export const getToken = () =>
  localStorage.getItem('jwt') ||
  localStorage.getItem('token') ||
  sessionStorage.getItem('jwt') ||
  sessionStorage.getItem('token') ||
  '';

/**
 * Merge new top-3 picks into the existing prediction doc so other steps aren't overwritten.
 * field: 'qualiTop3' | 'raceTop3' | 'sprintQualiTop3' | 'sprintRaceTop3'
 */
export async function mergeUpsertTop3({ gpId, seasonYear, field, values }) {
  const token = getToken();

  // fetch existing so we can merge (non-fatal if it 404s)
  let existingPicks = {};
  try {
    const r0 = await fetch(`/api/predictions/${gpId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (r0.ok) {
      const j0 = await r0.json();
      existingPicks = j0?.prediction?.picks || {};
    }
  } catch { /* ignore */ }

  const merged = { ...existingPicks, [field]: values };

  const r = await fetch('/api/predictions/upsert', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ gpId, seasonYear, picks: merged }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || 'Failed to save prediction');
  return j.prediction;
}
