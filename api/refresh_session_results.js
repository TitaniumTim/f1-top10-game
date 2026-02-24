// Required by frontend latest-results refresh action.
const BACKEND = 'https://f1-backend-78sj.onrender.com';

export default async function handler(req, res) {
  try {
    const { year, round, session } = req.query;
    if (!year || round === undefined || !session) {
      return res.status(400).json({ error: 'year, round and session are required' });
    }

    const url = `${BACKEND}/refresh_session_results?year=${encodeURIComponent(year)}&round=${encodeURIComponent(round)}&session=${encodeURIComponent(session)}`;
    const response = await fetch(url, { method: req.method || 'POST' });
    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).send(text);
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(text);
  } catch (error) {
    return res.status(502).json({ error: 'Failed to refresh session results', message: error.message });
  }
}
