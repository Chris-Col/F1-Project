// services/scoreGp.js
import fetch from 'node-fetch';
import Prediction from '../models/Prediction.js';

const EXACT_Q = 5, IN_TOP3_Q = 2;
const EXACT_R = 8, IN_TOP3_R = 3;

function scoreTop3(pred, actual, exactPts, inTop3Pts) {
  let s = 0;
  for (let i = 0; i < 3; i++) {
    const p = pred[i];
    if (!p) continue;
    if (p === actual[i]) s += exactPts;
    else if (actual.includes(p)) s += inTop3Pts;
  }
  return s;
}

export async function scoreGp({ gpId, seasonYear, sprintFlag }) {
  // Pull session results from Hyprace once
  const res = await fetch(`https://hyprace-api.p.rapidapi.com/v1/grands-prix/${gpId}/races`, {
    headers: {
      'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'hyprace-api.p.rapidapi.com'
    }
  });
  const data = await res.json();

  const quali  = data.items?.find(s => s.type === 'Qualifying');
  const sprintQ= data.items?.find(s => s.type === 'SprintQualifying' || s.type === 'SprintShootOut');
  const sprint = data.items?.find(s => s.type === 'SprintRace');
  const main   = data.items?.find(s => s.type === 'MainRace');

  // Build actual top‑3 arrays using your driver slugs (last-name)
  const nameOf = p => (p?.driver?.lastName || '').toLowerCase().normalize('NFKD').replace(/[^\w]/g,'');
  const top3 = (parts, by) =>
    parts
      .sort((a,b) => (a.result?.[by] ?? 99) - (b.result?.[by] ?? 99))
      .slice(0,3)
      .map(p => nameOf(p));

  const actual = {
    qualiTop3:       quali  ? top3(quali.participations || [], 'position') : [],
    sprintQualiTop3: sprintQ? top3(sprintQ.participations|| [], 'position') : [],
    sprintRaceTop3:  sprint ? top3(sprint.participations|| [], 'finishedPosition') : [],
    raceTop3:        main   ? top3(main.participations  || [], 'finishedPosition') : []
  };

  // Score all predictions for this GP
  const preds = await Prediction.find({ gpId, seasonYear });
  await Promise.all(preds.map(async (p) => {
    const s = {
      quali:       scoreTop3(p.picks.qualiTop3,       actual.qualiTop3,       EXACT_Q, IN_TOP3_Q),
      race:        scoreTop3(p.picks.raceTop3,        actual.raceTop3,        EXACT_R, IN_TOP3_R),
      sprintQuali: sprintFlag ? scoreTop3(p.picks.sprintQualiTop3, actual.sprintQualiTop3, EXACT_Q, IN_TOP3_Q) : 0,
      sprintRace:  sprintFlag ? scoreTop3(p.picks.sprintRaceTop3,  actual.sprintRaceTop3,  EXACT_R, IN_TOP3_R)  : 0
    };
    s.total = s.quali + s.race + s.sprintQuali + s.sprintRace;

    p.score = s;
    await p.save();
  }));

  return { ok: true, actual };
}
