// /api/years.js
export default function handler(req, res) {
  try {
    // List of years you want available
    const years = [2023, 2024, 2025];
    res.status(200).json(years);
  } catch (err) {
    console.error(err);
    res.status(500).json({error: "Server error"});
  }
}
