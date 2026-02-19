// api/rounds.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { year } = req.query;

  if (!year) {
    return res.status(400).json({ error: 'Year is required' });
  }

  try {
    const response = await fetch(`https://api.openf1.org/v1/meetings?year=${year}`);
    const data = await response.json();

    const rounds = data.map(meeting => ({
      meeting_key: meeting.meeting_key,
      raceName: meeting.race_name,
      circuitName: meeting.circuit_name,
      country: meeting.country,
      city: meeting.city,
      date: meeting.start_date,
    }));

    res.status(200).json(rounds);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch rounds' });
  }
}
