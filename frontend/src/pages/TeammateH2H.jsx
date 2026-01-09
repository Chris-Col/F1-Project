import { useEffect, useState } from 'react';
import logger from '../utils/logger.js';
import '../styles.css';

/**
 * Teammate Head-to-Head Comparison Page
 * Compares teammates across:
 * - Race finishes (who beat whom)
 * - Qualifying positions
 * - Total points
 *
 * Uses aggressive caching to stay within API limits (200/day)
 */

const API_KEY = import.meta.env.VITE_RAPIDAPI_KEY;
const API_HOST = 'hyprace-api.p.rapidapi.com';
const API_HEADERS = {
  'X-RapidAPI-Key': API_KEY,
  'X-RapidAPI-Host': API_HOST,
};

export default function TeammateH2H() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState('');

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const fetchWithRetry = async (url, options, retries = 5, backoff = 2000) => {
    for (let i = 0; i <= retries; i++) {
      const res = await fetch(url, options);
      if (res.status === 429 && i < retries) {
        const waitTime = backoff * (i + 1);
        logger.warn('Rate limited, retrying...', { url, attempt: i + 1, waitTime });
        await sleep(waitTime);
        continue;
      }
      if (res.ok) return res;
      logger.error('Fetch failed', { url, status: res.status });
      throw new Error(`Fetch failed: ${res.status}`);
    }
  };

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

  useEffect(() => {
    const abort = new AbortController();

    const run = async () => {
      try {
        logger.info('Fetching teammate H2H data...');
        setProgress('Checking cache...');

        // 1. Get finished GPs
        const gpData = await fetchWithRetry(
          `https://${API_HOST}/v2/grands-prix?seasonYear=2025&pageSize=25`,
          { method: 'GET', signal: abort.signal, headers: API_HEADERS }
        ).then(r => r.json());

        const seasonId = gpData.items?.[0]?.season?.id;
        const finished = gpData.items?.filter(r => r.status === 'Finished') ?? [];
        const raceIdsKey = finished.map(r => r.id).sort().join(',');

        // Check cache
        const cache = JSON.parse(localStorage.getItem('teammateH2HCache') || '{}');
        const TTL = 36 * 60 * 60 * 1000;

        if (
          cache.raceIdsKey === raceIdsKey &&
          cache.teams &&
          Date.now() - new Date(cache.lastUpdated || 0) < TTL
        ) {
          logger.info('Using cached teammate H2H data');
          setTeams(cache.teams);
          setLoading(false);
          return;
        }

        setProgress(`Fetching data for ${finished.length} races...`);

        // 2. Aggregate data across all GPs
        // Structure: teamId -> { drivers: [d1, d2], raceH2H: [d1Wins, d2Wins], qualiH2H: [d1Wins, d2Wins], points: {d1: x, d2: y} }
        const teamData = new Map();
        const driverMeta = JSON.parse(localStorage.getItem('driverMetaCache') || '{}');
        const teamMeta = JSON.parse(localStorage.getItem('teamMetaCache') || '{}');

        // Fetch functions
        const fetchRaceList = gpId =>
          fetchWithRetry(
            `https://${API_HOST}/v2/grands-prix/${gpId}/races`,
            { method: 'GET', signal: abort.signal, headers: API_HEADERS }
          ).then(r => r.json());

        const fetchQualifyingList = gpId =>
          fetchWithRetry(
            `https://${API_HOST}/v2/grands-prix/${gpId}/qualifying`,
            { method: 'GET', signal: abort.signal, headers: API_HEADERS }
          ).then(r => r.json());

        const fetchRaceResults = (gpId, raceId) =>
          fetchWithRetry(
            `https://${API_HOST}/v2/grands-prix/${gpId}/races/${raceId}/results`,
            { method: 'GET', signal: abort.signal, headers: API_HEADERS }
          ).then(r => r.json());

        const fetchQualifyingResults = (gpId, qualiId) =>
          fetchWithRetry(
            `https://${API_HOST}/v2/grands-prix/${gpId}/qualifying/${qualiId}/results`,
            { method: 'GET', signal: abort.signal, headers: API_HEADERS }
          ).then(r => r.json());

        // Process each GP
        let gpCount = 0;
        await mapLimited(finished, 2, async gp => {
          gpCount++;
          setProgress(`Processing ${gp.name} (${gpCount}/${finished.length})...`);

          const [races, qualifyings] = await Promise.all([
            fetchRaceList(gp.id),
            fetchQualifyingList(gp.id),
          ]);
          await sleep(300);

          const raceItems = races.items ?? [];
          const qualiItems = qualifyings.items ?? [];

          const mainRace = raceItems.find(s => s.type === 'MainRace');
          const standardQuali = qualiItems.find(s => s.type === 'Standard');

          // Fetch results
          const mainResults = mainRace?.id ? await fetchRaceResults(gp.id, mainRace.id) : null;
          await sleep(300);
          const qualiResults = standardQuali?.id ? await fetchQualifyingResults(gp.id, standardQuali.id) : null;
          await sleep(300);

          const raceParticipations = mainResults?.participations ?? [];
          const qualiResultsList = qualiResults?.results ?? [];

          // Group by team for race
          const raceByTeam = new Map();
          for (const p of raceParticipations) {
            const tid = p.chassisManufacturerId;
            if (!raceByTeam.has(tid)) raceByTeam.set(tid, []);
            raceByTeam.get(tid).push({
              driverId: p.driverId,
              position: p.result?.finishedPosition,
              points: p.result?.points || 0,
              status: p.result?.resultStatus?.positionStatus,
            });
          }

          // Group by team for quali (need to match drivers to teams from race data)
          const driverToTeam = new Map();
          for (const p of raceParticipations) {
            driverToTeam.set(p.driverId, p.chassisManufacturerId);
          }

          const qualiByTeam = new Map();
          for (const q of qualiResultsList) {
            const tid = driverToTeam.get(q.driverId);
            if (!tid) continue;
            if (!qualiByTeam.has(tid)) qualiByTeam.set(tid, []);
            qualiByTeam.get(tid).push({
              driverId: q.driverId,
              position: q.position,
            });
          }

          // Process each team
          for (const [tid, drivers] of raceByTeam) {
            if (drivers.length !== 2) continue;

            if (!teamData.has(tid)) {
              teamData.set(tid, {
                teamId: tid,
                drivers: drivers.map(d => d.driverId),
                raceH2H: [0, 0],
                qualiH2H: [0, 0],
                points: {},
                raceResults: [], // For detailed breakdown
                dnfs: {},
              });
              drivers.forEach(d => {
                teamData.get(tid).points[d.driverId] = 0;
                teamData.get(tid).dnfs[d.driverId] = 0;
              });
            }

            const team = teamData.get(tid);
            const [d1, d2] = team.drivers;

            // Find this GP's results for both drivers
            const d1Race = drivers.find(d => d.driverId === d1);
            const d2Race = drivers.find(d => d.driverId === d2);

            if (d1Race && d2Race) {
              // Add points
              team.points[d1] = (team.points[d1] || 0) + (d1Race.points || 0);
              team.points[d2] = (team.points[d2] || 0) + (d2Race.points || 0);

              // Track DNFs and DSQs (NonClassified = DNF, Disqualified = DSQ)
              if (d1Race.status === 'NonClassified' || d1Race.status === 'Disqualified') team.dnfs[d1]++;
              if (d2Race.status === 'NonClassified' || d2Race.status === 'Disqualified') team.dnfs[d2]++;

              // Race H2H (only if both classified or both have positions)
              if (d1Race.position && d2Race.position) {
                if (d1Race.position < d2Race.position) team.raceH2H[0]++;
                else if (d2Race.position < d1Race.position) team.raceH2H[1]++;
              }
            }

            // Quali H2H
            const qualiDrivers = qualiByTeam.get(tid) || [];
            const d1Quali = qualiDrivers.find(d => d.driverId === d1);
            const d2Quali = qualiDrivers.find(d => d.driverId === d2);

            if (d1Quali?.position && d2Quali?.position) {
              if (d1Quali.position < d2Quali.position) team.qualiH2H[0]++;
              else if (d2Quali.position < d1Quali.position) team.qualiH2H[1]++;
            }
          }
        });

        setProgress('Fetching standings for accurate points...');

        // 3. Get accurate points from standings endpoint
        const standingsData = await fetchWithRetry(
          `https://${API_HOST}/v2/drivers-standings?seasonId=${seasonId}&isLastStanding=true&pageSize=25`,
          { method: 'GET', signal: abort.signal, headers: API_HEADERS }
        ).then(r => r.json());

        const standings = standingsData.items?.[0]?.standings ?? standingsData.standings ?? standingsData.items ?? [];
        const standingsPoints = new Map();
        standings.forEach(s => standingsPoints.set(s.driverId, s.points));

        setProgress('Fetching driver and team names...');

        // 4. Get driver names (use existing cache or fetch)
        const allDriverIds = new Set();
        teamData.forEach(t => t.drivers.forEach(d => allDriverIds.add(d)));
        const missingDrivers = [...allDriverIds].filter(id => !driverMeta[id]);

        if (missingDrivers.length > 0) {
          await mapLimited(missingDrivers, 2, async id => {
            const data = await fetchWithRetry(
              `https://${API_HOST}/v2/drivers/${id}`,
              { method: 'GET', signal: abort.signal, headers: API_HEADERS }
            ).then(r => r.json());
            driverMeta[id] = data;
            await sleep(200);
          });
          localStorage.setItem('driverMetaCache', JSON.stringify(driverMeta));
        }

        // 5. Get team names
        const allTeamIds = [...teamData.keys()];
        const missingTeams = allTeamIds.filter(id => !teamMeta[id]);

        if (missingTeams.length > 0) {
          await mapLimited(missingTeams, 2, async id => {
            const data = await fetchWithRetry(
              `https://${API_HOST}/v2/chassis-manufacturers/${id}`,
              { method: 'GET', signal: abort.signal, headers: API_HEADERS }
            ).then(r => r.json());
            teamMeta[id] = data;
            await sleep(200);
          });
          localStorage.setItem('teamMetaCache', JSON.stringify(teamMeta));
        }

        // 6. Build final team list (use standings points, not summed race points)
        const teamsList = [...teamData.values()].map(t => {
          const [d1, d2] = t.drivers;
          const d1Meta = driverMeta[d1] || {};
          const d2Meta = driverMeta[d2] || {};
          const tMeta = teamMeta[t.teamId] || {};

          return {
            teamId: t.teamId,
            teamName: tMeta.name || 'Unknown Team',
            teamColor: tMeta.color || '333333',
            driver1: {
              id: d1,
              name: `${d1Meta.firstName || ''} ${d1Meta.lastName || 'Driver 1'}`.trim(),
              lastName: d1Meta.lastName || 'driver1',
              points: standingsPoints.get(d1) ?? 0,
              raceWins: t.raceH2H[0],
              qualiWins: t.qualiH2H[0],
              dnfs: t.dnfs[d1] || 0,
            },
            driver2: {
              id: d2,
              name: `${d2Meta.firstName || ''} ${d2Meta.lastName || 'Driver 2'}`.trim(),
              lastName: d2Meta.lastName || 'driver2',
              points: standingsPoints.get(d2) ?? 0,
              raceWins: t.raceH2H[1],
              qualiWins: t.qualiH2H[1],
              dnfs: t.dnfs[d2] || 0,
            },
            totalRaces: t.raceH2H[0] + t.raceH2H[1],
            totalQualis: t.qualiH2H[0] + t.qualiH2H[1],
          };
        });

        // Sort by total team points
        teamsList.sort((a, b) => (b.driver1.points + b.driver2.points) - (a.driver1.points + a.driver2.points));

        // Cache
        localStorage.setItem('teammateH2HCache', JSON.stringify({
          raceIdsKey,
          lastUpdated: new Date().toISOString(),
          teams: teamsList,
        }));

        logger.info('Teammate H2H data loaded', { teamCount: teamsList.length });
        setTeams(teamsList);

      } catch (e) {
        if (e.name !== 'AbortError') {
          logger.error('Failed to load teammate H2H', { error: e.message });
          setError(e);
        }
      } finally {
        setLoading(false);
        setProgress('');
      }
    };

    run();
    return () => abort.abort();
  }, []);

  if (loading) {
    return (
      <div className="main-content">
        <div className="text-white text-center">
          <p>Loading teammate comparisons…</p>
          <p className="text-gray-400 text-sm mt-2">{progress}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="main-content text-white text-center">Error: {error.message}</div>;
  }

  return (
    <div className="main-content">
      <div className="h2h-header">
        <h1>Teammate Head-to-Head</h1>
        <button
          className="btn btn-secondary"
          onClick={() => {
            localStorage.removeItem('teammateH2HCache');
            window.location.reload();
          }}
        >
          Refresh Data
        </button>
      </div>

      <div className="h2h-grid">
        {teams.map(team => (
          <div key={team.teamId} className="h2h-card" style={{ borderColor: `#${team.teamColor}` }}>
            <div className="h2h-team-header" style={{ backgroundColor: `#${team.teamColor}22` }}>
              <h2>{team.teamName}</h2>
            </div>

            <div className="h2h-drivers">
              {/* Driver 1 */}
              <div className="h2h-driver">
                <img
                  src={`/imgs/${team.driver1.lastName.toLowerCase()}.avif`}
                  alt={team.driver1.name}
                  className="h2h-driver-img"
                  onError={e => { e.target.src = '/imgs/default.avif'; }}
                />
                <h3>{team.driver1.name}</h3>
                <p className="h2h-points">{team.driver1.points} pts</p>
              </div>

              {/* VS */}
              <div className="h2h-vs">VS</div>

              {/* Driver 2 */}
              <div className="h2h-driver">
                <img
                  src={`/imgs/${team.driver2.lastName.toLowerCase()}.avif`}
                  alt={team.driver2.name}
                  className="h2h-driver-img"
                  onError={e => { e.target.src = '/imgs/default.avif'; }}
                />
                <h3>{team.driver2.name}</h3>
                <p className="h2h-points">{team.driver2.points} pts</p>
              </div>
            </div>

            {/* Stats */}
            <div className="h2h-stats">
              <div className="h2h-stat-row">
                <span className={team.driver1.raceWins > team.driver2.raceWins ? 'h2h-winner' : ''}>
                  {team.driver1.raceWins}
                </span>
                <span className="h2h-stat-label">Race H2H</span>
                <span className={team.driver2.raceWins > team.driver1.raceWins ? 'h2h-winner' : ''}>
                  {team.driver2.raceWins}
                </span>
              </div>

              <div className="h2h-stat-row">
                <span className={team.driver1.qualiWins > team.driver2.qualiWins ? 'h2h-winner' : ''}>
                  {team.driver1.qualiWins}
                </span>
                <span className="h2h-stat-label">Quali H2H</span>
                <span className={team.driver2.qualiWins > team.driver1.qualiWins ? 'h2h-winner' : ''}>
                  {team.driver2.qualiWins}
                </span>
              </div>

              <div className="h2h-stat-row">
                <span>{team.driver1.dnfs}</span>
                <span className="h2h-stat-label">DNFs</span>
                <span>{team.driver2.dnfs}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
