// Returns the top 10 for a specific session
// Example: /api/session?year=2023&round=1&session=Race
export default async function handler(req, res) {
  const { year, round, session } = req.query;
  if (!year || !round || !session) return res.status(400).json({ error: "Year, round and session required" });

  try {
    // OpenF1 API endpoint for results: /results/{year}/{round}/{session}.json
    const response = await fetch(`https://api.openf1.org/v1/results/${year}/${round}/${session}.json`);
    const data = await response.json();

    if (!data || !data.results) return res.status(404).json({ error: "Results not found" });

    // Take the top 10
    const top10 = data.results.slice(0, 10).map(r => ({
      driver: r.driver.familyName,
      team: r.constructor.name,
      number: r.driver.permanentNumber
    }));

    res.status(200).json({ top10 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching session results" });
  }
}
