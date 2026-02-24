// Required by frontend setup health indicator.
const BACKEND = 'https://f1-backend-78sj.onrender.com';

export default async function handler(req, res) {
  try {
    const response = await fetch(`${BACKEND}/health`);
    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).send(text);
    }

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    return res.status(200).send(text);
  } catch (error) {
    return res.status(502).json({ error: 'Failed to fetch health status', message: error.message });
  }
}
