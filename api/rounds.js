// Returns all rounds for a given year
// Example: /api/rounds?year=2023
export default async function handler(req, res) {
  const { year } = req.query;

  if (!year) {
    return res.status(400).json({ error: "Year required" });
  }

  try {
    const response = await fetch(
      "https://api.openf1.org/v1/meetings",
      { headers: { "User-Agent": "F1-Top10-Game" } }
    );

    if (!response.ok) {
      return res.status(500).json({ error: "OpenF1 request failed" });
    }

    const data = await response.json();

    // Access the actual meetings array
    const meetings = data.meetings || [];

    // Filter by year
    const filtered = meetings.filter(m => String(m.year) === String(year));

    // Filter out testing sessions
    const raceMeetings = filtered.filter(
      m => m.meeting_name && !m.meeting_name.toLowerCase().includes("test")
    );

    // Sort by start date
    raceMeetings.sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

    // Build rounds list
    const rounds = raceMeetings.map(m => ({
      number: m.meeting_key,
      name: m.meeting_name
    }));

    res.status(200).json(rounds);

  } catch (err) {
    console.error("ROUNDS ERROR:", err);
    res.status(500).json({ error: "Error fetching rounds" });
  }
}
