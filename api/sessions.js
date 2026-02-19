// Returns available sessions for a given year and round
// Example: /api/sessions?year=2023&round=1
export default async function handler(req, res) {
  const { year, round } = req.query;
  if (!year || !round)
    return res.status(400).json({ error: "Year and round required" });

  try {
    const response = await fetch(
      `https://api.openf1.org/v1/sessions?year=${year}&meeting_key=${round}`
    );

    const sessions = await response.json();

    const sessionList = sessions.map(s => s.session_name);

    res.status(200).json(sessionList);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching sessions" });
  }
}
