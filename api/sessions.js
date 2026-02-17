// /api/sessions.js
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

router.get('/', async (req, res) => {
  const {year, round} = req.query;
  if (!year || !round) return res.status(400).json({error:'Year and round required'});

  try {
    // Example: fetch session types for that round
    const apiRes = await fetch(`https://api.openf1.org/${year}/round/${round}/sessions`);
    const data = await apiRes.json();

    // Should return an array like ["FP1","FP2","Qualifying","Race","Sprint"]
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({error:'Failed to fetch sessions'});
  }
});

module.exports = router;
