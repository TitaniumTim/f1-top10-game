// Returns all rounds for a given year
// Example: /api/rounds?year=2023
export default function handler(req, res) {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: "Year required" });

    // Example rounds data — replace with real F1 rounds if desired
    const roundsByYear = {
      2023: [
        { number: 1, name: "Bahrain GP" },
        { number: 2, name: "Saudi Arabia GP" },
        { number: 3, name: "Australia GP" }
      ],
      2024: [
        { number: 1, name: "Bahrain GP" },
        { number: 2, name: "Saudi Arabia GP" }
      ],
      2025: [
        { number: 1, name: "Bahrain GP" }
      ]
    };

    const rounds = roundsByYear[year] || [];
    res.status(200).json(rounds);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}
