// api/session_results.js
export default async function handler(req, res) {
  const { session_key } = req.query;

  if (!session_key) {
    return res.status(400).json({ error: "Missing 'session_key' query parameter" });
  }

  try {
    // 1️⃣ Top 10 results for the session
    const resultsRaw = await fetch(
      `https://api.openf1.org/v1/session_result?session_key=${session_key}&position<=10`
    );
    const results = await resultsRaw.json();

    // 2️⃣ Driver info for that session
    const driversRaw = await fetch(
      `https://api.openf1.org/v1/drivers?session_key=${session_key}`
    );
    const drivers = await driversRaw.json();

    // Combine results with driver info
    const top10 = results.map(r => {
      const drv = drivers.find(d => d.driver_number === r.driver_number);
      return {
        position: r.position,
        driver: drv ? `${drv.given_name} ${drv.family_name}` : "",
        number: r.driver_number,
        team: drv?.team_name || ""
      };
    });

    res.status(200).json(top10);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch session results" });
  }
}
