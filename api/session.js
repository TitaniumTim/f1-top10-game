// Returns the top 10 for a specific session
export default async function handler(req, res) {
  const { year, round, session } = req.query;
  if (!year || !round || !session)
    return res.status(400).json({ error: "Year, round and session required" });

  try {
    // Step 1: Find session
    const sessionResponse = await fetch(
      `https://api.openf1.org/v1/sessions?year=${year}&meeting_key=${round}&session_name=${session}`
    );

    const sessions = await sessionResponse.json();
    if (!sessions.length)
      return res.status(404).json({ error: "Session not found" });

    const sessionKey = sessions[0].session_key;

    // Step 2: Get session results
    const resultsResponse = await fetch(
      `https://api.openf1.org/v1/session_results?session_key=${sessionKey}`
    );

    const results = await resultsResponse.json();

    // Step 3: Sort by position and take top 10
    const top10 = results
      .sort((a, b) => a.position - b.position)
      .slice(0, 10)
      .map(r => ({
        driver: r.driver_name,
        team: r.team_name,
        number: r.driver_number
      }));

    res.status(200).json({ top10 });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching session results" });
  }
}
