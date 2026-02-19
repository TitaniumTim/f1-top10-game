export default async function handler(req, res) {
  try {
    const response = await fetch("https://f1api.dev/api/v1/seasons");
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error("YEARS ERROR:", err);
    res.status(500).json({ error: "Error fetching seasons" });
  }
}
