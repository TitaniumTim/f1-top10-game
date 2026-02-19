// api/session.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { session_key } = req.query;

  if (!session_key) {
    return res.status(400).json({ error: 'session_key is required' });
  }

  try {
    const response = await fetch(`https://api.openf1.org/v1/session_results?session_key=${session_key}`);
    const data = await response.json();

    const participants = data.map(driver => ({
      driver_id: driver.driver_id,
      name: driver.name,
      surname: driver.surname,
      team: driver.team,
      country: driver.country,
      position: driver.position,
    }));

    res.status(200).json(participants);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch session results' });
  }
}
