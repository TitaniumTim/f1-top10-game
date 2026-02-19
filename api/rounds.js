// api/rounds.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { year } = req.query;

  if (!year) {
    return res.status(400).json({ error: 'Year is required' });
  }

  try {
    const response = await fetch(`https://f1api.dev/api/${year}`);
    const data = await response.json();

    const rounds = data.races.map(race => ({
      round: race.round,
      raceId: race.raceId,
      raceName: race.raceName,
      url: race.url,
    }));

    res.status(200).json(rounds);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch rounds' });
  }
}
