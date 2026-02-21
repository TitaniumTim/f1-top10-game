// Required by frontend session loading.
const BACKEND = 'https://f1-backend-78sj.onrender.com';

export default async function handler(req, res) {
  try {
    const { year, round } = req.query;
    if (!year || round === undefined) return res.status(400).json({ error: 'year and round are required' });

    const response = await fetch(`${BACKEND}/sessions?year=${encodeURIComponent(year)}&round=${encodeURIComponent(round)}`);
    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).send(text);
    }

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.status(200).send(text);
  } catch (error) {
    res.status(502).json({ error: 'Failed to fetch sessions', message: error.message });
  }
}
