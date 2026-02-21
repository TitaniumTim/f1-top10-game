// Required by frontend session loading.
const BACKEND = 'https://f1-backend-78sj.onrender.com';

export default async function handler(req, res) {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: 'year is required' });

    const response = await fetch(`${BACKEND}/rounds?year=${encodeURIComponent(year)}`);
    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).send(text);
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).send(text);
  } catch (error) {
    res.status(502).json({ error: 'Failed to fetch rounds', message: error.message });
  }
}
