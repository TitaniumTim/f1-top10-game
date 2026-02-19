// api/sessions.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { meeting_key } = req.query;

  if (!meeting_key) {
    return res.status(400).json({ error: 'meeting_key is required' });
  }

  try {
    const response = await fetch(`https://api.openf1.org/v1/sessions?meeting_key=${meeting_key}`);
    const data = await response.json();

    const sessions = data.map(session => ({
      session_key: session.session_key,
      session_name: session.session_name,
      date: session.date,
      time: session.time,
    }));

    res.status(200).json(sessions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
}
