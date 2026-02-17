// /api/rounds.js
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

router.get('/', async (req, res) => {
  const year = req.query.year;
  if (!year) return res.status(400).json({error: 'Year required'});

  try {
    // Example OpenF1 API: Replace with actual endpoint
    const apiRes = await fetch(`https://api.openf1.org/${year}/rounds`);
    const data = await apiRes.json();

    // Ensure format: [{number:1, name:"Bahrain GP"}, ...]
    const rounds = data.map(r => ({number: r.round, name: r.name}));
    res.json(rounds);
  } catch (err) {
    console.error(err);
    res.status(500).json({error:'Failed to fetch rounds'});
  }
});

module.exports = router;
