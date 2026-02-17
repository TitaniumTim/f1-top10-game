export default async function handler(req, res) {
  const { year, round, type } = req.query;

  const response = await fetch(`https://api.openf1.org/v1/results?year=${year}&round=${round}`);
  const data = await response.json();

  const top10 = data
    .sort((a, b) => a.position - b.position)
    .slice(0, 10)
    .map(d => ({
      position: d.position,
      driver: d.driver_full_name,
      number: d.driver_number,
      team: d.team_name
    }));

  res.status(200).json(top10);
}
