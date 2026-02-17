const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use('/api/years', require('./years'));
app.use('/api/rounds', require('./rounds'));
app.use('/api/sessions', require('./sessions'));
app.use('/api/session', require('./session'));

// Serve static frontend files if needed
app.use(express.static('public'));

app.listen(port, () => console.log(`F1 Top 10 API running on port ${port}`));
