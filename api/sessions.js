// Returns available sessions for a given year and round
// Example: /api/sessions?year=2023&round=1
export default async function handler(req, res) {
  const { year, round } = req.query;
  if (!year || !round) return res.status(400).json({ error: "Year and round required" });

  try {
    const response = await fetch(`https://api.openf1.org/v1/calendar/${year}.json`);
    const calendar = await response.json();
    const race = calendar.find(r => r.round == round);

    if (!race) return res.status(404).json({ error: "Round not found" });

    // OpenF1 sessions: FP1, FP2, FP3, Qualifying, Sprint, Race
    const sessions = [];
    if (race?.FP1) sessions.push("FP1");
    if (race?.FP2) sessions.push("FP2");
    if (race?.FP3) sessions.push("FP3");
    if (race?.Qualifying) sessions.push("Qualifying");
    if (race?.Sprint) sessions.push("Sprint");
    sessions.push("Race"); // always include race

    res.status(200).json(sessions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching sessions" });
  }
}
