// api/sessions.js
export default async function handler(req, res) {
  const { year } = req.query;

  if (!year) {
    return res.status(400).json({ error: "Missing 'year' query parameter" });
  }

  try {
    // Get all sessions for the year
    const raw = await fetch(`https://api.openf1.org/v1/sessions?year=${year}`);
    const sessions = await raw.json();

    // Group by meeting_key (round / GP)
    const grouped = {};
    sessions.forEach(s => {
      const event = s.circuit_short_name || s.location || "Unknown GP";
      if (!grouped[s.meeting_key]) {
        grouped[s.meeting_key] = {
          meeting_key: s.meeting_key,
          event_name: event,
          sessions: []
        };
      }
      grouped[s.meeting_key].sessions.push({
        session_key: s.session_key,
        session_name: s.session_name,
        session_type: s.session_type,
        date: s.date_start
      });
    });

    // Sort sessions per GP by date
    const sorted = Object.values(grouped).map(event => {
      event.sessions.sort((a, b) => new Date(a.date) - new Date(b.date));
      return event;
    });

    // Sort GPs by meeting_key (round number order)
    sorted.sort((a, b) => a.meeting_key - b.meeting_key);

    res.status(200).json(sorted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
}
