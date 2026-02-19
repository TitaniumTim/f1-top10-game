export default async function handler(req, res) {
  const { year, round } = req.query;
  if (!year || !round) return res.status(400).json({ error: "Year and round required" });

  try {
    const response = await fetch(`https://f1api.dev/api/v1/races/${year}`);
    const races = await response.json();

    const race = races.find(r => String(r.round) === String(round));
    if (!race) return res.status(404).json({ error: "Round not found" });

    // Return all session types (fp1, fp2, fp3, qualifying, sprint*, race)
    res.status(200).json(race.sessions || []);
  } catch (err) {
    console.error("SESSIONS ERROR:", err);
    res.status(500).json({ error: "Error fetching sessions" });
  }
}
