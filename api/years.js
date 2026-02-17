// /api/years.js
const express = require('express');
const router = express.Router();

// Hardcoded for now – you can expand dynamically if needed
router.get('/', (req, res) => {
  res.json([2023, 2024, 2025]);
});

module.exports = router;
