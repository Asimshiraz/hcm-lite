const r = require('express').Router();
const { auth, allow } = require('../middleware');
const { h, HttpError } = require('../utils');
const ai = require('../services/ai');
r.use(auth);
r.post('/chat', h(async (req, res) => {
  const msgs = Array.isArray(req.body.messages) ? req.body.messages.filter((m) => m && typeof m.content === 'string' && m.content.trim()) : [];
  if (!msgs.length || msgs.at(-1).role !== 'user') throw new HttpError(422, 'Send at least one user message');
  res.json(await ai.chat(req.user, msgs));
}));
r.post('/summary', allow('admin', 'hr'), h(async (req, res) => {
  if (!req.body.kpis || typeof req.body.kpis !== 'object') throw new HttpError(422, 'kpis object is required');
  res.json(await ai.summarize(req.user, req.body.kpis));
}));
r.post('/smart-leave', allow('hr', 'employee'), h(async (req, res) => {
  if (!req.body.text?.trim()) throw new HttpError(422, 'Describe the leave you need');
  res.json(await ai.smartLeave(req.user, req.body.text)); // returns a suggestion only; the user confirms and submits the normal form
}));
module.exports = r;
