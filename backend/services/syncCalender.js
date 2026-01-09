// services/syncCalendar.js
import fetch from 'node-fetch';
import GrandPrix from '../models/GrandPrix.js';

const ASSUME_MS = 3 * 60 * 60 * 1000;

export async function syncCalendar(year = 2025) {
  const res = await fetch(`https://hyprace-api.p.rapidapi.com/v2/grands-prix?seasonYear=${year}&pageSize=25`, {
    headers: {
      'X-RapidAPI-Key':  process.env.RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'hyprace-api.p.rapidapi.com'
    }
  });
  const { items = [] } = await res.json();

  for (const gp of items) {
    const sessions = gp.schedule || [];
    const fp1  = sessions.find(s => s.type?.includes('FirstPractice'));
    const main = sessions.find(s => s.type === 'MainRace');
    if (!fp1?.startDate || !main?.startDate) continue;

    const start = new Date(fp1.startDate);
    const end   = main.endDate ? new Date(main.endDate) : new Date(new Date(main.startDate).getTime() + ASSUME_MS);
    const sprintFlag = sessions.some(s => s.type === 'SprintRace');

    await GrandPrix.updateOne(
      { hypraceId: gp.id, seasonYear: year },
      {
        $set: {
          name: gp.name,
          sprintFlag,
          weekendStart: start,
          weekendEnd: end,
          sessions: sessions.map(s => ({
            type: s.type,
            startDate: s.startDate ? new Date(s.startDate) : null,
            endDate: s.endDate ? new Date(s.endDate) : null
          }))
        }
      },
      { upsert: true }
    );
  }
}
