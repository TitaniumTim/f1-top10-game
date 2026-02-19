// Returns all rounds for a given year
// Example: /api/rounds?year=2023
export default async function handler(req, res) {
  const { year } = req.query;

  if (!year) {
    return res.status(400).json({ error: "Year required" });
  }

  try {
    const response = await fetch(
      `https://api.openf1.org/v1/meetings?year=${year}`,
      {
        headers: { "User-Agent": "F1-Top10-Game" }
      }
    );

    if (!response.ok) {
      return res.status(500).json({ error: "OpenF1 request failed" });
    }

    const meetings = await response.json();

    if (!Array.isArray(meetings)) {
      return res.status(500).json({ error: "Unexpected API format" });
    }

    // Filter out testing sessions if desired
    const raceMeetings = meetings.filter(
      m => m.meeting_name && !m.meeting_name.toLowerCase().includes("test")
    );

    // Sort by date (safer than meeting_key)
    raceMeetings.sort(
      (a, b) => new Date(a.date_start) - new Date(b.date_start)
    );

    const rounds = raceMeetings.map((m, index) => ({
      number: m.meeting_key,
      name: m.meeting_name
    }));

    res.status(200).json(rounds);

  } catch (err) {
    console.error("ROUNDS ERROR:", err);
    res.status(500).json({ error: "Error fetching rounds" });
  }
}
