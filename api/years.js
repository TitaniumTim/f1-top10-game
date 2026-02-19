export default async function handler(req, res) {
  try {
    const response = await fetch("https://f1api.dev/api/seasons");
    if (!response.ok) throw new Error("Failed to fetch seasons");

    const data = await response.json();

    // Extract years 2023+
    const years = data.championships
      .map(c => c.year)
      .filter(y => y >= 2023)
      .sort((a, b) => b - a); // descending so newest first

    res.status(200).json(years);
  } catch (err) {
    console.error("YEARS ERROR:", err);
    res.status(500).json({ error: "Error fetching seasons" });
  }
}
