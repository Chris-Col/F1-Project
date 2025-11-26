import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cacheRace } from '../utils/raceCache';
import logger from '../utils/logger.js';

const CAL_CACHE_KEY = 'calendarCache2025';
const ASSUME_MAIN_MS = 3 * 60 * 60 * 1000; // if endDate absent

const API_KEY = import.meta.env.VITE_RAPIDAPI_KEY;
const API_HOST = 'hyprace-api.p.rapidapi.com';
const API_HEADERS = {
  'X-RapidAPI-Key': API_KEY,
  'X-RapidAPI-Host': API_HOST,
};

function buildEnriched(items) {
  return (items || [])
    .map(gp => {
      const sessions = gp.schedule ?? [];
      const fp1  = sessions.find(s => s.type?.includes('FirstPractice'));
      const main = sessions.find(s => s.type === 'MainRace');
      if (!fp1?.startDate || !main?.startDate) return null;

      const start = new Date(fp1.startDate);
      const end   = main.endDate
        ? new Date(main.endDate)
        : new Date(new Date(main.startDate).getTime() + ASSUME_MAIN_MS);

      const sprintFlag = sessions.some(s => s.type === 'SprintRace');
      return { id: gp.id, name: gp.name, weekendStart: start, weekendEnd: end, sprintFlag };
    })
    .filter(Boolean)
    .sort((a, b) => a.weekendStart - b.weekendStart);
}

function derivePhase(enriched, now) {
  const current = enriched.find(gp => gp.weekendStart <= now && now < gp.weekendEnd) || null;
  const next    = current
    ? enriched.find(gp => gp.weekendStart > current.weekendEnd) || null
    : enriched.find(gp => gp.weekendStart > now) || null;

  if (current) {
    return { status: 'inWeekend', raceNow: current, raceNext: next, msLeft: current.weekendEnd - now, isSprint: current.sprintFlag };
  }
  if (next) {
    return { status: 'preWeekend', raceNow: null, raceNext: next, msLeft: next.weekendStart - now, isSprint: next.sprintFlag };
  }
  return { status: 'seasonDone', raceNow: null, raceNext: null, msLeft: null, isSprint: false };
}

export default function PredictionGate() {
  const [status,  setStatus]  = useState('loading');  // 'preWeekend' | 'inWeekend' | 'seasonDone' | 'loading'
  const [raceNow, setRaceNow] = useState(null);
  const [raceNext,setRaceNext]= useState(null);
  const [msLeft,  setMsLeft]  = useState(null);
  const [isSprint,setIsSprint]= useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const now = new Date();

    // 1) Try to paint instantly from cache (no flicker)
    const cachedRaw = localStorage.getItem(CAL_CACHE_KEY);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw);
        const enriched = (cached.enriched || []).map(gp => ({
          ...gp,
          weekendStart: new Date(gp.weekendStart),
          weekendEnd:   new Date(gp.weekendEnd),
        }));

        if (enriched.length) {
          const phase = derivePhase(enriched, now);
          setStatus(phase.status);
          setRaceNow(phase.raceNow);
          setRaceNext(phase.raceNext);
          setMsLeft(phase.msLeft);
          setIsSprint(phase.isSprint);

          // Keep prediction pages in sync with the correct upcoming GP
          if (phase.status !== 'seasonDone' && phase.raceNext) {
            cacheRace({
              id: phase.raceNext.id, // ← added
              name: phase.raceNext.name,
              endDate: phase.raceNext.weekendEnd.toISOString(),
            });
          }
        }
      } catch { /* ignore cache parse errors */ }
    }

    // 2) Revalidate in the background
    (async () => {
      try {
        logger.debug('Fetching GP calendar from API');
        const res = await fetch(
          `https://${API_HOST}/v1/grands-prix?seasonYear=2025&pageSize=25`,
          { method: 'GET', signal: controller.signal, headers: API_HEADERS },
        );
        const { items = [] } = await res.json();
        if (!active) return;

        const enriched = buildEnriched(items);

        // persist cache in a JSON‑safe form (ISO strings)
        localStorage.setItem(
          CAL_CACHE_KEY,
          JSON.stringify({
            enriched: enriched.map(gp => ({
              ...gp,
              weekendStart: gp.weekendStart.toISOString(),
              weekendEnd:   gp.weekendEnd.toISOString(),
            })),
            lastFetched: new Date().toISOString(),
          })
        );

        const phase = derivePhase(enriched, new Date());
        setStatus(phase.status);
        setRaceNow(phase.raceNow);
        setRaceNext(phase.raceNext);
        setMsLeft(phase.msLeft);
        setIsSprint(phase.isSprint);

        if (phase.status !== 'seasonDone' && phase.raceNext) {
          cacheRace({
            id: phase.raceNext.id, // ← added
            name: phase.raceNext.name,
            endDate: phase.raceNext.weekendEnd.toISOString(),
          });
        }
      } catch (err) {
        if (err.name === 'AbortError') return;    // prevent StrictMode flicker
        logger.error('Failed to fetch GP calendar', { error: err.message });
        // Only show seasonDone if we never drew from cache:
        setStatus(prev => (prev === 'loading' ? 'seasonDone' : prev));
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const fmt = (ms) => {
    if (!ms || ms <= 0) return '0d 0h 0m';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  const firstStep = isSprint ? '/predict-sprint-qualifying' : '/predict-qualifying';

  return (
    <div className="text-white text-center" style={{ paddingTop: '100px' }}>
      {status === 'loading' && <p>Loading race calendar…</p>}

      {status === 'seasonDone' && (
        <h2>No more grands prix scheduled for the 2025 season.</h2>
      )}

      {status === 'preWeekend' && raceNext && (
        <>
          <h1>{raceNext.name} Weekend</h1>
          <p>🕒 Time left to submit predictions: <strong>{fmt(msLeft)}</strong></p>
          <button className="btn btn-f1 mt-3" onClick={() => navigate(firstStep)}>
            Continue to Predictions
          </button>
        </>
      )}

      {status === 'inWeekend' && raceNow && (
        <>
          <h1>{raceNow.name} Weekend – in progress 🏁</h1>
          <p>
            Predictions are closed while the event is running.
            {raceNext && (
              <>
                <br />
                ✨ Predictions for <strong>{raceNext.name}</strong> open&nbsp;
                <strong>{fmt(msLeft)}</strong> after the current Main Race finishes.
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
