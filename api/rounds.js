// api/rounds.js

export default async function handler(req, res) {
  try {
    const { year } = req.query;

    if (!year) {
      return res.status(400).json({ error: "Year is required" });
    }

    const response = await fetch(
      `https://api.openf1.org/v1/meetings?year=${year}`
    );

    if (!response.ok) {
      throw new Error("OpenF1 API error");
    }

    const data = await response.json();

    // Sort by meeting number (round order)
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
    res.status(500).json({ error: "Failed to fetch rounds" });
  }
}
