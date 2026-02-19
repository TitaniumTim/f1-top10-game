// Returns all rounds for a given year
// Example: /api/rounds?year=2023
export default async function handler(req, res) {
  const { year } = req.query;
  if (!year) return res.status(400).json({ error: "Year required" });

  try {
    const response = await fetch(`https://api.openf1.org/v1/meetings?year=${year}`);
    const meetings = await response.json();

    const rounds = meetings
      .sort((a, b) => a.meeting_key - b.meeting_key)
      .map(m => ({
        number: m.meeting_key,
        name: m.meeting_name
      }));

    res.status(200).json(rounds);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching rounds" });
  }
}
