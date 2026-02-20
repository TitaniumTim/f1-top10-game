// api/sessions.js

export default async function handler(req, res) {
  try {
    const { meeting_key } = req.query;

    if (!meeting_key) {
      return res.status(400).json({ error: "meeting_key is required" });
    }

    const response = await fetch(
      `https://api.openf1.org/v1/sessions?meeting_key=${meeting_key}`
    );

    if (!response.ok) {
      throw new Error("OpenF1 API error");
    }

    const data = await response.json();

    const sessions = data.map((session) => ({
      session_key: session.session_key,
      session_name: session.session_name,
      date_start: session.date_start
    }));

    res.status(200).json(sessions);
  } catch (err) {
    console.error("SESSIONS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
}
