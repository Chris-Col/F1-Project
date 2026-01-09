import { useEffect, useState } from 'react';
import logger from '../utils/logger.js';
import '../styles.css';

/**
 * Driver statistics dashboard (2025 season)
 * – Correct Qualifying & Sprint averages
 * – "Classified" cars count as finishers
 * – Concurrency-limited race/session fetches (max 5 in flight)
 * – Robust cache keyed by finished race-hash + 36 h TTL
 * – Driver metadata cached locally
 *
 * Updated to use Hyprace API V2
 */

const API_KEY = import.meta.env.VITE_RAPIDAPI_KEY;
const API_HOST = 'hyprace-api.p.rapidapi.com';
const API_HEADERS = {
  'X-RapidAPI-Key': API_KEY,
  'X-RapidAPI-Host': API_HOST,
};

export default function DriverStats() {
  /* ─────────────────────── state ─────────────────────── */
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ───────────────────── helper utils ────────────────── */
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const fetchWithRetry = async (url, options, retries = 5, backoff = 2_000) => {
    for (let i = 0; i <= retries; i += 1) {
      const res = await fetch(url, options);
      if (res.status === 429 && i < retries) {
        const waitTime = backoff * (i + 1); // Exponential backoff
        logger.warn('Rate limited, retrying...', { url, attempt: i + 1, waitTime });
        await sleep(waitTime);
        continue;
      }
      if (res.ok) return res;
      logger.error('Fetch failed', { url, status: res.status });
      throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }
  };

  /* very small p-limit clone */
  const mapLimited = async (items, limit, fn) => {
    const out = Array(items.length);
    let idx = 0;
    const step = async () => {
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
      await step();
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, step));
    return out;
  };

  /* ─────────────────── main effect ───────────────────── */
  useEffect(() => {
    const abort = new AbortController();

    const run = async () => {
      setError(null); // Reset error state on new fetch

      try {
        logger.info('Fetching driver stats...');

        /* 1️⃣ Which GPs have finished? (V2 endpoint) */
        const gpData = await fetchWithRetry(
          `https://${API_HOST}/v2/grands-prix?seasonYear=2025&pageSize=25`,
          { method: 'GET', signal: abort.signal, headers: API_HEADERS },
        ).then(r => r.json());

        // Extract the seasonId from the first GP (all GPs in response share same season)
        const seasonId = gpData.items?.[0]?.season?.id;
        logger.info('Found season ID', { seasonId });

        const finished = gpData.items?.filter(r => r.status === 'Finished') ?? [];
        const raceIdsKey = finished.map(r => r.id).sort().join(',');
        const cache = JSON.parse(localStorage.getItem('driverStatsCache') || '{}');
        const TTL   = 36 * 60 * 60 * 1_000; // 36 h

        if (
          cache.raceIdsKey === raceIdsKey &&
          cache.stats &&
          Date.now() - new Date(cache.lastUpdated || 0) < TTL
        ) {
          logger.info('Using cached driver stats', { raceCount: finished.length });
          setDrivers(cache.stats);
          setLoading(false);
          return;
        }

        logger.info('Cache miss, fetching fresh data', { finishedRaces: finished.length });

        /* 2️⃣ Aggregate results across finished rounds (V2 endpoint) */
        const acc = new Map(); // driverId → counters

        // V2 API has SEPARATE endpoints for races and qualifying:
        // - /races returns: MainRace, SprintRace (uses participations[].result.finishedPosition)
        // - /qualifying returns: Standard, Sprint (uses results[].position)

        const fetchRaceList = gpId =>
          fetchWithRetry(
            `https://${API_HOST}/v2/grands-prix/${gpId}/races`,
            { method: 'GET', signal: abort.signal, headers: API_HEADERS },
          ).then(r => r.json());

        const fetchQualifyingList = gpId =>
          fetchWithRetry(
            `https://${API_HOST}/v2/grands-prix/${gpId}/qualifying`,
            { method: 'GET', signal: abort.signal, headers: API_HEADERS },
          ).then(r => r.json());

        const fetchRaceResults = (gpId, raceId) =>
          fetchWithRetry(
            `https://${API_HOST}/v2/grands-prix/${gpId}/races/${raceId}/results`,
            { method: 'GET', signal: abort.signal, headers: API_HEADERS },
          ).then(r => r.json());

        const fetchQualifyingResults = (gpId, qualiId) =>
          fetchWithRetry(
            `https://${API_HOST}/v2/grands-prix/${gpId}/qualifying/${qualiId}/results`,
            { method: 'GET', signal: abort.signal, headers: API_HEADERS },
          ).then(r => r.json());

        // Reduced concurrency to 2 and sequential session fetches to avoid rate limits
        await mapLimited(finished, 2, async gp => {
          // Fetch both race and qualifying lists
          const [races, qualifyings] = await Promise.all([
            fetchRaceList(gp.id),
            fetchQualifyingList(gp.id),
          ]);
          await sleep(300);

          const raceItems = races.items ?? [];
          const qualiItems = qualifyings.items ?? [];

          // Find session IDs
          const mainRace = raceItems.find(s => s.type === 'MainRace');
          const sprintRace = raceItems.find(s => s.type === 'SprintRace');
          const standardQuali = qualiItems.find(s => s.type === 'Standard');
          const sprintQuali = qualiItems.find(s => s.type === 'Sprint');

          // Fetch results sequentially with small delays to avoid rate limits
          const mainResults = mainRace?.id ? await fetchRaceResults(gp.id, mainRace.id) : null;
          await sleep(300);
          const sprintRaceResults = sprintRace?.id ? await fetchRaceResults(gp.id, sprintRace.id) : null;
          await sleep(300);
          const qualiResults = standardQuali?.id ? await fetchQualifyingResults(gp.id, standardQuali.id) : null;
          await sleep(300);
          const sprintQualiResults = sprintQuali?.id ? await fetchQualifyingResults(gp.id, sprintQuali.id) : null;

          // Race results use participations[].result structure
          const mainParticipations = mainResults?.participations ?? [];
          const sprintParticipations = sprintRaceResults?.participations ?? [];

          // Qualifying results use results[] structure (position at top level)
          const qualiResultsList = qualiResults?.results ?? [];
          const sprintQualiResultsList = sprintQualiResults?.results ?? [];

          // Process main race results
          for (const p of mainParticipations) {
            const { result = {} } = p;
            const id = p.driverId;
            const posStatus = result.resultStatus?.positionStatus;
            const status = result.resultStatus?.status;
            const isFinished = ['Finished', 'Classified'].includes(posStatus) || status === 'Ok';

            if (!acc.has(id)) {
              acc.set(id, { fSum: 0, fCnt: 0, sSum: 0, sCnt: 0, qSum: 0, qCnt: 0, gSum: 0, gCnt: 0 });
            }
            const a = acc.get(id);

            if (isFinished && result.finishedPosition != null) {
              a.fCnt++;
              a.fSum += result.finishedPosition;
            }
            if (result.grid > 0) {
              a.gCnt++;
              a.gSum += result.grid;
            }
          }

          // Process sprint race results
          for (const p of sprintParticipations) {
            const { result = {} } = p;
            const id = p.driverId;
            const posStatus = result.resultStatus?.positionStatus;
            const status = result.resultStatus?.status;
            const isFinished = ['Finished', 'Classified'].includes(posStatus) || status === 'Ok';

            if (!acc.has(id)) {
              acc.set(id, { fSum: 0, fCnt: 0, sSum: 0, sCnt: 0, qSum: 0, qCnt: 0, gSum: 0, gCnt: 0 });
            }
            const a = acc.get(id);

            if (isFinished && result.finishedPosition != null) {
              a.sCnt++;
              a.sSum += result.finishedPosition;
            }
          }

          // Process qualifying results (position is at top level, not nested)
          for (const q of qualiResultsList) {
            const id = q.driverId;
            if (!acc.has(id)) {
              acc.set(id, { fSum: 0, fCnt: 0, sSum: 0, sCnt: 0, qSum: 0, qCnt: 0, gSum: 0, gCnt: 0 });
            }
            const a = acc.get(id);

            if (q.position > 0) {
              a.qCnt++;
              a.qSum += q.position;
            }
          }

          // Process sprint qualifying results (not tracked separately for now, but available if needed)
          // Sprint qualifying positions could be added as a separate stat if desired
        });

        /* 3️⃣ Get latest standings (V2 endpoint) - must use seasonId */
        const standingsData = await fetchWithRetry(
          `https://${API_HOST}/v2/drivers-standings?seasonId=${seasonId}&isLastStanding=true&pageSize=25`,
          { method: 'GET', signal: abort.signal, headers: API_HEADERS },
        ).then(r => r.json());

        logger.info('Standings data received', { standingsData });

        // V2 might have different structure - try multiple paths
        const standings = standingsData.items?.[0]?.standings
          ?? standingsData.standings
          ?? standingsData.items
          ?? [];

        /* ✅ Sort the standings so WDC positions are correct
           Prefer API-provided `position`; otherwise sort by points desc. */
        const sortedStandings = [...standings].sort((a, b) => {
          if (a.position != null && b.position != null) return a.position - b.position;
          if (b.points !== a.points) return b.points - a.points;
          return 0;
        });

        /* 4️⃣ Driver-meta cache (V2 endpoint) */
        const metaCache = JSON.parse(localStorage.getItem('driverMetaCache') || '{}');
        const missing   = sortedStandings.map(s => s.driverId).filter(id => !metaCache[id]);

        if (missing.length > 0) {
          logger.info('Fetching missing driver metadata', { count: missing.length });
        }

        await mapLimited(missing, 2, async id => {
          const metaJson = await fetchWithRetry(
            `https://${API_HOST}/v2/drivers/${id}`,
            { method: 'GET', signal: abort.signal, headers: API_HEADERS },
          ).then(r => r.json());

          // V2 driver endpoint returns driver object directly or in items array
          metaCache[id] = metaJson.items?.[0] ?? metaJson.driver ?? metaJson;
          await sleep(200); // Small delay between driver fetches
        });
        localStorage.setItem('driverMetaCache', JSON.stringify(metaCache));

        /* 5️⃣ Compose final rows */
        const avg = (sum, cnt) => (cnt ? (sum / cnt).toFixed(1) : 'N/A');

        const rows = sortedStandings.map((st, i) => {
          const id   = st.driverId;
          const meta = metaCache[id] || {};
          const a    = acc.get(id)  || { fSum:0,fCnt:0,sSum:0,sCnt:0,qSum:0,qCnt:0,gSum:0,gCnt:0 };

          const quali = a.qCnt ? avg(a.qSum, a.qCnt) : avg(a.gSum, a.gCnt); // fallback to grid

          return {
            id,
            name: meta.firstName && meta.lastName
              ? `${meta.firstName} ${meta.lastName}`
              : 'Unknown',
            img: meta.lastName
              ? `/imgs/${meta.lastName.toLowerCase()}.avif`
              : '/imgs/default.avif',
            nationality: meta.nationality || 'Unknown',
            avgFinish:   avg(a.fSum, a.fCnt),
            avgSprint:   avg(a.sSum, a.sCnt),
            avgQual:     quali,
            points:      st.points,
            wdcPosition: st.position ?? (i + 1), // ✅ correct position
          };
        });

        /* 6️⃣ cache + set state */
        localStorage.setItem(
          'driverStatsCache',
          JSON.stringify({
            raceIdsKey,
            lastUpdated: new Date().toISOString(),
            stats: rows,
          }),
        );

        logger.info('Driver stats loaded', { driverCount: rows.length });
        setDrivers(rows);
      } catch (e) {
        if (e.name !== 'AbortError') {
          logger.error('Failed to load driver stats', { error: e.message });
          setError(e);
        }
      } finally {
        setLoading(false);
      }
    };

    run();
    return () => abort.abort(); // clean-up on unmount
  }, []);

  /* ────────────────────── view layer ───────────────────── */
  if (loading) return <div className="text-white text-center">Loading driver stats…</div>;
  if (error)   return <div className="text-white text-center">Error: {error.message}</div>;

  return (
    <div className="main-content">
      <div className="driver-stats-header">
        <button
          className="btn btn-secondary"
          onClick={() => {
            localStorage.removeItem('driverStatsCache');
            window.location.reload();
          }}
        >
          Clear Driver Stats Cache
        </button>
      </div>

      <div className="driver-stats-grid">
        {drivers.map(d => (
          <div key={d.id} className="driver-card">
            <img src={d.img} alt={d.name} className="driver-img" />
            <h3>{d.name}</h3>
            <p><strong>Nationality:</strong> {d.nationality}</p>
            <p><strong>WDC Position:</strong> {d.wdcPosition}</p>
            <p><strong>Avg Finish:</strong> {d.avgFinish}</p>
            <p><strong>Avg Qualifying:</strong> {d.avgQual}</p>
            <p><strong>Avg Sprint Finish:</strong> {d.avgSprint}</p>
            <p><strong>Total Points:</strong> {d.points}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
