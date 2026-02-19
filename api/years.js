// /api/years.js
export default async function handler(req, res) {
  try {
    const response = await fetch("https://api.openf1.org/v1/meetings");
    const data = await response.json();

    // Extract unique years
    const years = [...new Set(data.map(m => m.year))].sort();

    res.status(200).json(years);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching years" });
  }
}
