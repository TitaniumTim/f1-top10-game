export default async function handler(req, res) {
  try {
    const response = await fetch("https://api.openf1.org/v1/meetings?year=2024");
    const data = await response.json();

    res.status(200).json({
      success: true,
      count: data.length
    });
  } catch (err) {
    console.error("TEST ERROR:", err);
    res.status(500).json({ error: "Test failed" });
  }
}
