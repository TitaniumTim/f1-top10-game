// Returns the top 10 for a specific session
// Example: /api/session?year=2023&round=1&session=Race
export default function handler(req, res) {
  try {
    const { year, round, session } = req.query;
    if (!year || !round || !session) return res.status(400).json({ error: "Year, round and session required" });

    // Dummy top 10 data for testing — replace with real F1 API integration later
    const top10 = [
      { driver: "Verstappen", team: "Red Bull", number: 1 },
      { driver: "Hamilton", team: "Mercedes", number: 44 },
      { driver: "Leclerc", team: "Ferrari", number: 16 },
      { driver: "Norris", team: "McLaren", number: 4 },
      { driver: "Russell", team: "Mercedes", number: 63 },
      { driver: "Piastri", team: "McLaren", number: 81 },
      { driver: "Alonso", team: "Aston Martin", number: 14 },
      { driver: "Sainz", team: "Ferrari", number: 55 },
      { driver: "Albon", team: "Williams", number: 23 },
      { driver: "Ocon", team: "Alpine", number: 31 }
    ];

    res.status(200).json({ top10 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}
