// /api/years.js
export default async function handler(req, res) {
  try {
    const response = await fetch("https://api.jolpi.ca/ergast/f1/seasons.json");
    if (!response.ok) throw new Error("Jolpica request failed");
    const data = await response.json();

    // Jolpica follows Ergast format: data.MRData.SeasonTable.Seasons
    const seasons = data.MRData?.SeasonTable?.Seasons?.map(s => s.season) || [];
    res.status(200).json(seasons.sort((a,b) => b-a)); // latest first
  } catch (err) {
    console.error("YEARS ERROR:", err);
    res.status(500).json({ error: "Error fetching years" });
  }
}
