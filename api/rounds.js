// api/rounds.js

export default async function handler(req, res) {
  try {
    const { year } = req.query;

    if (!year) {
      return res.status(400).json({ error: "Year is required" });
    }

    const url = `https://api.openf1.org/v1/meetings?year=${year}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const text = await response.text();

    if (!response.ok) {
      console.error("OpenF1 response error:", response.status, text);
      return res.status(500).json({
        error: "OpenF1 returned error",
        status: response.status,
        details: text
      });
    }

    const data = JSON.parse(text);

    const meetings = data
      .sort((a, b) => a.meeting_number - b.meeting_number)
      .map((meeting) => ({
        meeting_key: meeting.meeting_key,
        meeting_name: meeting.meeting_name,
        meeting_number: meeting.meeting_number,
        country_name: meeting.country_name
      }));

    res.status(200).json(meetings);

  } catch (err) {
    console.error("ROUNDS ERROR:", err);
    res.status(500).json({
      error: "Failed to fetch rounds",
      message: err.message
    });
  }
}
