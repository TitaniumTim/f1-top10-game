// api/sessions.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { year, roundId } = req.query;

  if (!year || !roundId) {
    return res.status(400).json({ error: 'Year and roundId are required' });
  }

  try {
    const response = await fetch(`https://f1api.dev/api/${year}`);
    const data = await response.json();

    const race = data.races.find(r => r.raceId === roundId);

    if (!race) {
      return res.status(404).json({ error: 'Round not found' });
    }

    const sessions = {
      fp1: race.schedule.fp1,
      fp2: race.schedule.fp2,
      fp3: race.schedule.fp3,
      qualy: race.schedule.qualy,
      race: race.schedule.race,
      sprintQualy: race.schedule.sprintQualy,
      sprintRace: race.schedule.sprintRace,
    };

    res.status(200).json(sessions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
}
