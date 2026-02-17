// /api/session.js
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

router.get('/', async (req, res) => {
  const {year, round, session} = req.query;
  if (!year || !round || !session) return res.status(400).json({error:'Year, round, session required'});

  try {
    // Example OpenF1 API call: replace with actual endpoint
    const apiRes = await fetch(`https://api.openf1.org/${year}/round/${round}/${session}`);
    const data = await apiRes.json();

    // Extract the top 10 drivers: [{driver:"Hamilton", team:"Mercedes", number:44}, ...]
    const top10 = data.results.slice(0,10).map(d => ({
      driver: d.driver,
      team: d.constructor,
      number: d.number
    }));

    res.json({top10});
  } catch (err) {
    console.error(err);
    res.status(500).json({error:'Failed to fetch session results'});
  }
});

module.exports = router;
