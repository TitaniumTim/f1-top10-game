// Required by frontend session loading.
const BACKEND = 'https://f1-backend-78sj.onrender.com';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  try {
    const { year, round, session } = req.query;
    if (!year || round === undefined || !session) {
      return res.status(400).json({ error: 'year, round and session are required' });
    }

    const url = `${BACKEND}/session_results?year=${encodeURIComponent(year)}&round=${encodeURIComponent(round)}&session=${encodeURIComponent(session)}`;

    const maxAttempts = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetchWithTimeout(url, 60000);
        const text = await response.text();

        if (response.ok) {
          res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
          return res.status(200).send(text);
        }

        // Retry temporary upstream failures (common during Render cold starts).
        if ([502, 503, 504].includes(response.status) && attempt < maxAttempts) {
          await sleep(attempt * 1500);
          continue;
        }

        return res.status(response.status).send(text);
      } catch (error) {
        lastError = error;

        if (attempt < maxAttempts) {
          await sleep(attempt * 1500);
          continue;
        }
      }
    }

    return res.status(502).json({
      error: 'Failed to fetch session results',
      message: lastError?.name === 'AbortError' ? 'Upstream request timed out' : (lastError?.message || 'Unknown upstream error')
    });
  } catch (error) {
    res.status(502).json({ error: 'Failed to fetch session results', message: error.message });
  }
}
