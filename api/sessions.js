// /api/sessions.js
export default async function handler(req, res) {
  const { year, round } = req.query;
  if (!year || !round) return res.status(400).json({ error: "Year and round required" });

  try {
    const response = await fetch(`https://api.jolpi.ca/ergast/f1/${year}/${round}.json`);
    if (!response.ok) throw new Error("Jolpica request failed");

    const data = await response.json();
    const races = data.MRData?.RaceTable?.Races || [];
    if (races.length === 0) return res.status(404).json({ error: "No race found" });

    const race = races[0];

    // Jolpica/Ergast doesn't explicitly list FP1/FP2 etc., just results for sessions.
    // For your prototype, we can return sessions you want: Qualifying, Sprint (if present), Race
    const sessions = [];
    if (race.Qualifying) sessions.push("Qualifying");
    if (race.Sprint) sessions.push("Sprint");
    sessions.push("Race"); // always include race

    res.status(200).json(sessions);

  } catch (err) {
    console.error("SESSIONS ERROR:", err);
    res.status(500).json({ error: "Error fetching sessions" });
  }
}
