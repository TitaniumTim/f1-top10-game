const BACKEND = 'https://f1-backend-78sj.onrender.com';

export default async function handler(req, res) {
  try {
    const { year, round, session } = req.query;
    if (!year || round === undefined || !session) {
      return res.status(400).json({ error: 'year, round and session are required' });
    }

    const response = await fetch(
      `${BACKEND}/session_results?year=${encodeURIComponent(year)}&round=${encodeURIComponent(round)}&session=${encodeURIComponent(session)}`
    );
    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).send(text);
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).send(text);
  } catch (error) {
    res.status(502).json({ error: 'Failed to fetch session results', message: error.message });
  }
}
