const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { errorHandler } = require('./middleware');

const app = express();
app.use(cors({ origin: config.origin === '*' ? true : config.origin.split(',') }));
app.use(express.json({ limit: '2mb' }));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', require('./routes/auth'));
app.use('/api/org', require('./routes/org'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/leave', require('./routes/leave'));
app.use('/api/payroll', require('./routes/payroll'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api', require('./routes/comms'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Single-service hosting: serve the built React app if present.
const dist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html'))); }
app.use(errorHandler);
module.exports = app;
