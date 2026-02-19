// /api/rounds.js
export default async function handler(req, res) {
  const { year } = req.query;
  if (!year) return res.status(400).json({ error: "Year required" });

  try {
    const response = await fetch(`https://api.jolpi.ca/ergast/f1/${year}.json`);
    if (!response.ok) throw new Error("Jolpica request failed");

    const data = await response.json();
    const races = data.MRData?.RaceTable?.Races || [];

    // Build rounds array: { number: roundNumber, name: raceName }
    const rounds = races.map(r => ({
      number: parseInt(r.round),
      name: r.raceName
    })).sort((a,b) => a.number - b.number);

    res.status(200).json(rounds);
  } catch (err) {
    console.error("ROUNDS ERROR:", err);
    res.status(500).json({ error: "Error fetching rounds" });
  }
}
