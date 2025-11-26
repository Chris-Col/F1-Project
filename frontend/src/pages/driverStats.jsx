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

  const fetchWithRetry = async (url, options, retries = 3, backoff = 1_000) => {
    for (let i = 0; i <= retries; i += 1) {
      const res = await fetch(url, options);
      if (res.status === 429 && i < retries) {
        logger.warn('Rate limited, retrying...', { url, attempt: i + 1 });
        await sleep(backoff);
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

        /* 1️⃣ Which GPs have finished? */
        const gpData = await fetchWithRetry(
          `https://${API_HOST}/v1/grands-prix?seasonYear=2025&pageSize=25`,
          { method: 'GET', signal: abort.signal, headers: API_HEADERS },
        ).then(r => r.json());

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

        /* 2️⃣ Aggregate results across finished rounds */
        const acc = new Map(); // driverId → counters

        const fetchSessions = id =>
          fetchWithRetry(
            `https://${API_HOST}/v1/grands-prix/${id}/races`,
            { method: 'GET', signal: abort.signal, headers: API_HEADERS },
          ).then(r => r.json());

        await mapLimited(finished, 5, async gp => {
          const races = await fetchSessions(gp.id);

          const main   = races.items?.find(s => s.type === 'MainRace');
          const sprint = races.items?.find(s => s.type === 'SprintRace');
          const quali  = races.items?.find(s => s.type === 'Qualifying');

          const parts = [
            ...(main   ? main.participations   : []).map(p => ({ ...p, sess: 'Main'   })),
            ...(sprint ? sprint.participations : []).map(p => ({ ...p, sess: 'Sprint' })),
            ...(quali  ? quali.participations  : []).map(p => ({ ...p, sess: 'Quali'  })),
          ];

          for (const p of parts) {
            const { result = {} } = p;
            const id        = p.driverId;
            const status    = result.finishingStatus?.status;
            const finished  = ['Finished', 'Classified'].includes(status);

            if (!acc.has(id)) {
              acc.set(id, { fSum:0,fCnt:0, sSum:0,sCnt:0, qSum:0,qCnt:0, gSum:0,gCnt:0 });
            }
            const a = acc.get(id);

            switch (p.sess) {
              case 'Main':
                if (finished && result.finishedPosition != null) {
                  a.fCnt++; a.fSum += result.finishedPosition;
                }
                if (result.grid > 0) {
                  a.gCnt++; a.gSum += result.grid;
                }
                break;
              case 'Sprint':
                if (finished && result.finishedPosition != null) {
                  a.sCnt++; a.sSum += result.finishedPosition;
                }
                break;
              case 'Quali':
                if (result.position > 0) {
                  a.qCnt++; a.qSum += result.position;
                }
                break;
              default:
            }
          }
        });

        /* 3️⃣ Get latest standings (IDs + points) */
        const seasonId = await fetchWithRetry(
          `https://${API_HOST}/v1/seasons?isCurrent=true`,
          { method: 'GET', signal: abort.signal, headers: API_HEADERS },
        ).then(r => r.json()).then(j => j.items?.[0]?.id);

        const standings = await fetchWithRetry(
          `https://${API_HOST}/v1/drivers-standings?isLastStanding=true&seasonId=${seasonId}`,
          { method: 'GET', signal: abort.signal, headers: API_HEADERS },
        ).then(r => r.json()).then(j => j.items?.[0]?.standings ?? []);

        /* ✅ Sort the standings so WDC positions are correct
           Prefer API-provided `position`; otherwise sort by points desc. */
        const sortedStandings = [...standings].sort((a, b) => {
          if (a.position != null && b.position != null) return a.position - b.position;
          if (b.points !== a.points) return b.points - a.points;
          return 0;
        });

        /* 4️⃣ Driver-meta cache */
        const metaCache = JSON.parse(localStorage.getItem('driverMetaCache') || '{}');
        const missing   = sortedStandings.map(s => s.driverId).filter(id => !metaCache[id]);

        if (missing.length > 0) {
          logger.info('Fetching missing driver metadata', { count: missing.length });
        }

        await mapLimited(missing, 5, async id => {
          const metaJson = await fetchWithRetry(
            `https://${API_HOST}/v1/drivers/${id}`,
            { method: 'GET', signal: abort.signal, headers: API_HEADERS },
          ).then(r => r.json());

          metaCache[id] = metaJson.items?.[0] ?? metaJson;
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
    <>
      <div className="text-white text-center my-4">
        <button
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
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
    </>
  );
}
