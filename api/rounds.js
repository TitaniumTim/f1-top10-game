export default async function handler(req, res) {
  const { year } = req.query;
  if (!year) return res.status(400).json({ error: "Year required" });

  try {
    const response = await fetch(`https://f1api.dev/api/v1/races/${year}`);
    const data = await response.json();

    // map to round array
    const rounds = data.map(r => ({
      number: r.round,
      name: r.raceName,
      sessions: r.sessions || []
    }));

    res.status(200).json(rounds);
  } catch (err) {
    console.error("ROUNDS ERROR:", err);
    res.status(500).json({ error: "Error fetching rounds" });
  }
}
