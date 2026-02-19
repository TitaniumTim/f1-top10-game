export default async function handler(req, res) {
  const { year, round, session } = req.query;
  if (!year || !round || !session)
    return res.status(400).json({ error: "Year, round and session required" });

  try {
    // Build API URL based on session type
    let url;
    const s = session.toLowerCase();

    if (s.startsWith("practice")) {
      url = `https://f1api.dev/api/v1/practice/${year}/${round}/${s}`;
    } else if (s === "qualifying") {
      url = `https://f1api.dev/api/v1/qualifying/${year}/${round}`;
    } else if (s === "race") {
      url = `https://f1api.dev/api/v1/results/${year}/${round}`;
    } else {
      return res.status(400).json({ error: "Invalid session type" });
    }

    const response = await fetch(url);
    const results = await response.json();

    // Take top10
    let top10 = [];

    if (Array.isArray(results)) {
      top10 = results.slice(0, 10).map(r => ({
        driver: `${r.Driver?.givenName} ${r.Driver?.familyName}`,
        number: r.Driver?.permanentNumber,
        team: r.Constructor?.name,
        position: r.position
      }));
    }

    res.status(200).json({ top10 });
  } catch (err) {
    console.error("SESSION ERROR:", err);
    res.status(500).json({ error: "Error fetching session results" });
  }
}
