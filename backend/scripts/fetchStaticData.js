/**
 * One-time script to fetch driver stats and teammate H2H data
 * Run this locally to populate the cache before deployment
 *
 * Usage: node scripts/fetchStaticData.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_KEY = process.env.RAPIDAPI_KEY;
const API_HOST = 'hyprace-api.p.rapidapi.com';
const API_HEADERS = {
  'X-RapidAPI-Key': API_KEY,
  'X-RapidAPI-Host': API_HOST,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, retries = 5, backoff = 2000) {
  for (let i = 0; i <= retries; i++) {
    try {
      console.log(`  Fetching: ${url}`);
      const res = await fetch(url, { method: 'GET', headers: API_HEADERS });

      if (res.status === 429 && i < retries) {
        const waitTime = backoff * (i + 1);
        console.log(`  Rate limited, waiting ${waitTime}ms...`);
        await sleep(waitTime);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return res.json();
    } catch (err) {
      if (i === retries) throw err;
      console.log(`  Retry ${i + 1}/${retries}: ${err.message}`);
      await sleep(backoff);
    }
  }
}

async function fetchDriverStats() {
  console.log('\n=== Fetching Driver Stats ===\n');

  // 1. Get finished GPs
  console.log('1. Fetching GP calendar...');
  const gpData = await fetchWithRetry(
    `https://${API_HOST}/v2/grands-prix?seasonYear=2025&pageSize=25`
  );

  const seasonId = gpData.items?.[0]?.season?.id;
  const finished = gpData.items?.filter(r => r.status === 'Finished') ?? [];
  console.log(`   Found ${finished.length} finished races, seasonId: ${seasonId}`);

  // 2. Aggregate stats from each GP
  console.log('\n2. Fetching race results...');
  const acc = new Map(); // driverId → counters

  for (const gp of finished) {
    console.log(`\n   Processing: ${gp.name}`);
    await sleep(500);

    // Fetch race and qualifying lists
    const [races, qualifyings] = await Promise.all([
      fetchWithRetry(`https://${API_HOST}/v2/grands-prix/${gp.id}/races`),
      fetchWithRetry(`https://${API_HOST}/v2/grands-prix/${gp.id}/qualifying`),
    ]);
    await sleep(500);

    const raceItems = races.items ?? [];
    const qualiItems = qualifyings.items ?? [];

    const mainRace = raceItems.find(s => s.type === 'MainRace');
    const sprintRace = raceItems.find(s => s.type === 'SprintRace');
    const standardQuali = qualiItems.find(s => s.type === 'Standard');

    // Fetch results
    const mainResults = mainRace?.id
      ? await fetchWithRetry(`https://${API_HOST}/v2/grands-prix/${gp.id}/races/${mainRace.id}/results`)
      : null;
    await sleep(300);

    const sprintRaceResults = sprintRace?.id
      ? await fetchWithRetry(`https://${API_HOST}/v2/grands-prix/${gp.id}/races/${sprintRace.id}/results`)
      : null;
    await sleep(300);

    const qualiResults = standardQuali?.id
      ? await fetchWithRetry(`https://${API_HOST}/v2/grands-prix/${gp.id}/qualifying/${standardQuali.id}/results`)
      : null;
    await sleep(300);

    // Process main race
    const mainParticipations = mainResults?.participations ?? [];
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

    // Process sprint race
    const sprintParticipations = sprintRaceResults?.participations ?? [];
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

    // Process qualifying
    const qualiResultsList = qualiResults?.results ?? [];
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
  }

  // 3. Get standings
  console.log('\n3. Fetching standings...');
  await sleep(500);
  const standingsData = await fetchWithRetry(
    `https://${API_HOST}/v2/drivers-standings?seasonId=${seasonId}&isLastStanding=true&pageSize=25`
  );

  const standings = standingsData.items?.[0]?.standings
    ?? standingsData.standings
    ?? standingsData.items
    ?? [];

  const sortedStandings = [...standings].sort((a, b) => {
    if (a.position != null && b.position != null) return a.position - b.position;
    if (b.points !== a.points) return b.points - a.points;
    return 0;
  });

  // 4. Fetch driver metadata
  console.log('\n4. Fetching driver metadata...');
  const driverMeta = {};

  for (const st of sortedStandings) {
    await sleep(300);
    const metaJson = await fetchWithRetry(`https://${API_HOST}/v2/drivers/${st.driverId}`);
    driverMeta[st.driverId] = metaJson.items?.[0] ?? metaJson.driver ?? metaJson;
  }

  // 5. Compose final data
  console.log('\n5. Building final driver stats...');
  const avg = (sum, cnt) => (cnt ? (sum / cnt).toFixed(1) : 'N/A');

  const driverStats = sortedStandings.map((st, i) => {
    const id = st.driverId;
    const meta = driverMeta[id] || {};
    const a = acc.get(id) || { fSum: 0, fCnt: 0, sSum: 0, sCnt: 0, qSum: 0, qCnt: 0, gSum: 0, gCnt: 0 };
    const quali = a.qCnt ? avg(a.qSum, a.qCnt) : avg(a.gSum, a.gCnt);

    return {
      id,
      name: meta.firstName && meta.lastName
        ? `${meta.firstName} ${meta.lastName}`
        : 'Unknown',
      img: meta.lastName
        ? `/imgs/${meta.lastName.toLowerCase()}.avif`
        : '/imgs/default.avif',
      nationality: meta.nationality || 'Unknown',
      avgFinish: avg(a.fSum, a.fCnt),
      avgSprint: avg(a.sSum, a.sCnt),
      avgQual: quali,
      points: st.points,
      wdcPosition: st.position ?? (i + 1),
    };
  });

  return { driverStats, driverMeta, seasonId, finishedRaces: finished.length };
}

async function fetchTeammateH2H(driverMeta) {
  console.log('\n\n=== Fetching Teammate H2H Data ===\n');

  // 1. Get finished GPs
  console.log('1. Fetching GP calendar...');
  const gpData = await fetchWithRetry(
    `https://${API_HOST}/v2/grands-prix?seasonYear=2025&pageSize=25`
  );

  const seasonId = gpData.items?.[0]?.season?.id;
  const finished = gpData.items?.filter(r => r.status === 'Finished') ?? [];

  // 2. Aggregate H2H data
  console.log('\n2. Processing races for H2H...');
  const teamData = new Map();

  for (const gp of finished) {
    console.log(`\n   Processing: ${gp.name}`);
    await sleep(500);

    const [races, qualifyings] = await Promise.all([
      fetchWithRetry(`https://${API_HOST}/v2/grands-prix/${gp.id}/races`),
      fetchWithRetry(`https://${API_HOST}/v2/grands-prix/${gp.id}/qualifying`),
    ]);
    await sleep(300);

    const raceItems = races.items ?? [];
    const qualiItems = qualifyings.items ?? [];

    const mainRace = raceItems.find(s => s.type === 'MainRace');
    const standardQuali = qualiItems.find(s => s.type === 'Standard');

    const mainResults = mainRace?.id
      ? await fetchWithRetry(`https://${API_HOST}/v2/grands-prix/${gp.id}/races/${mainRace.id}/results`)
      : null;
    await sleep(300);

    const qualiResults = standardQuali?.id
      ? await fetchWithRetry(`https://${API_HOST}/v2/grands-prix/${gp.id}/qualifying/${standardQuali.id}/results`)
      : null;
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

    // Map drivers to teams
    const driverToTeam = new Map();
    for (const p of raceParticipations) {
      driverToTeam.set(p.driverId, p.chassisManufacturerId);
    }

    // Group by team for quali
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
          dnfs: {},
        });
        drivers.forEach(d => {
          teamData.get(tid).points[d.driverId] = 0;
          teamData.get(tid).dnfs[d.driverId] = 0;
        });
      }

      const team = teamData.get(tid);
      const [d1, d2] = team.drivers;

      const d1Race = drivers.find(d => d.driverId === d1);
      const d2Race = drivers.find(d => d.driverId === d2);

      if (d1Race && d2Race) {
        team.points[d1] = (team.points[d1] || 0) + (d1Race.points || 0);
        team.points[d2] = (team.points[d2] || 0) + (d2Race.points || 0);

        if (d1Race.status === 'NonClassified' || d1Race.status === 'Disqualified') team.dnfs[d1]++;
        if (d2Race.status === 'NonClassified' || d2Race.status === 'Disqualified') team.dnfs[d2]++;

        if (d1Race.position && d2Race.position) {
          if (d1Race.position < d2Race.position) team.raceH2H[0]++;
          else if (d2Race.position < d1Race.position) team.raceH2H[1]++;
        }
      }

      const qualiDrivers = qualiByTeam.get(tid) || [];
      const d1Quali = qualiDrivers.find(d => d.driverId === d1);
      const d2Quali = qualiDrivers.find(d => d.driverId === d2);

      if (d1Quali?.position && d2Quali?.position) {
        if (d1Quali.position < d2Quali.position) team.qualiH2H[0]++;
        else if (d2Quali.position < d1Quali.position) team.qualiH2H[1]++;
      }
    }
  }

  // 3. Get standings for accurate points
  console.log('\n3. Fetching standings...');
  await sleep(500);
  const standingsData = await fetchWithRetry(
    `https://${API_HOST}/v2/drivers-standings?seasonId=${seasonId}&isLastStanding=true&pageSize=25`
  );

  const standings = standingsData.items?.[0]?.standings ?? standingsData.standings ?? standingsData.items ?? [];
  const standingsPoints = new Map();
  standings.forEach(s => standingsPoints.set(s.driverId, s.points));

  // 4. Fetch team metadata
  console.log('\n4. Fetching team metadata...');
  const teamMeta = {};
  const allTeamIds = [...teamData.keys()];

  for (const id of allTeamIds) {
    await sleep(300);
    const data = await fetchWithRetry(`https://${API_HOST}/v2/chassis-manufacturers/${id}`);
    teamMeta[id] = data;
  }

  // 5. Build final team list
  console.log('\n5. Building final H2H data...');
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

  return { teams: teamsList, teamMeta };
}

async function main() {
  console.log('========================================');
  console.log('  F1 Static Data Fetcher');
  console.log('========================================');

  if (!API_KEY) {
    console.error('ERROR: RAPIDAPI_KEY not found in .env');
    process.exit(1);
  }

  try {
    // Fetch driver stats first (we reuse driver metadata)
    const { driverStats, driverMeta, seasonId, finishedRaces } = await fetchDriverStats();

    // Fetch H2H data (reuse driver metadata)
    const { teams, teamMeta } = await fetchTeammateH2H(driverMeta);

    // Save to files
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const metadata = {
      generatedAt: new Date().toISOString(),
      seasonYear: 2025,
      seasonId,
      finishedRaces,
    };

    fs.writeFileSync(
      path.join(dataDir, 'driverStats.json'),
      JSON.stringify({ metadata, stats: driverStats }, null, 2)
    );

    fs.writeFileSync(
      path.join(dataDir, 'teammateH2H.json'),
      JSON.stringify({ metadata, teams }, null, 2)
    );

    console.log('\n========================================');
    console.log('  SUCCESS!');
    console.log('========================================');
    console.log(`\nFiles saved to: ${dataDir}`);
    console.log(`  - driverStats.json (${driverStats.length} drivers)`);
    console.log(`  - teammateH2H.json (${teams.length} teams)`);
    console.log(`\nData is current as of ${finishedRaces} finished races.`);

  } catch (err) {
    console.error('\nERROR:', err.message);
    process.exit(1);
  }
}

main();
