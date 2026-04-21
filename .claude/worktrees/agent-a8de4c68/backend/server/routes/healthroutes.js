const express = require('express');
const router = express.Router();
const { query } = require('../db/pg');

router.get('/healthz', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch (e) {
    res.status(500).json({ status: 'error', db: 'down', message: e.message });
  }
});

module.exports = router;
