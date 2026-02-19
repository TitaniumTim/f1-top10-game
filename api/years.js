// api/years.js
export default function handler(req, res) {
  const years = [
    { year: 2023 },
    { year: 2024 },
    { year: 2025 },
    { year: 2026 },
  ];

  res.status(200).json(years);
}
