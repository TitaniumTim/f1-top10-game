// /api/results.js
export default async function handler(req, res) {
  const { year, round, session } = req.query;
  if (!year || !round || !session) return res.status(400).json({ error: "Missing parameters" });

  try {
    let url;
    switch(session.toLowerCase()) {
      case "qualifying":
        url = `https://api.jolpi.ca/ergast/f1/${year}/${round}/qualifying.json`;
        break;
      case "sprint":
        url = `https://api.jolpi.ca/ergast/f1/${year}/${round}/sprint.json`;
        break;
      case "race":
        url = `https://api.jolpi.ca/ergast/f1/${year}/${round}/results.json`;
        break;
      default:
        return res.status(400).json({ error: "Invalid session type" });
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error("Jolpica request failed");

    const data = await response.json();
    const races = data.MRData?.RaceTable?.Races || [];
    if (races.length === 0) return res.status(404).json({ error: "No race found" });

    const results = races[0].Results || [];
    // Return only top 10
    const top10 = results.slice(0, 10).map(r => ({
      position: r.position,
      driver: `${r.Driver.givenName} ${r.Driver.familyName}`,
      code: r.Driver.code,
      number: r.Driver.permanentNumber,
      constructor: r.Constructor.name,
      team: r.Constructor.name,
      time: r.Time?.time || r.status
    }));

    res.status(200).json(top10);

  } catch (err) {
    console.error("RESULTS ERROR:", err);
    res.status(500).json({ error: "Error fetching results" });
  }
}
