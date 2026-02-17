// Returns available sessions for a given year and round
// Example: /api/sessions?year=2023&round=1
export default function handler(req, res) {
  try {
    const { year, round } = req.query;
    if (!year || !round) return res.status(400).json({ error: "Year and round required" });

    // Example sessions
    const sessions = ["FP1", "FP2", "FP3", "Qualifying", "Sprint", "Race"];
    res.status(200).json(sessions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}
