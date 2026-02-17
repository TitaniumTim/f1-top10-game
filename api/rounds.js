// Returns all rounds for a given year
// Example: /api/rounds?year=2023
export default async function handler(req, res) {
  const { year } = req.query;
  if (!year) return res.status(400).json({ error: "Year required" });

  try {
    const response = await fetch(`https://api.openf1.org/v1/calendar/${year}.json`);
    const data = await response.json();

    // Map rounds into {number, name}
    const rounds = data.map(event => ({
      number: event.round,
      name: event.raceName
    }));

    res.status(200).json(rounds);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching rounds" });
  }
}
