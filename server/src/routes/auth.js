const r = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { User, Setting } = require('../models');
const { auth } = require('../middleware');
const { h, need, HttpError } = require('../utils');
const { setupCompany } = require('../services/people');
const { audit } = require('../services/comms');

const view = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, employee: u.employee, mustChangePassword: u.mustChangePassword });

r.get('/setup/status', h(async (req, res) => res.json({ setupDone: !!(await Setting.findOne({ setupDone: true })) })));
r.post('/setup', h(async (req, res) => {
  const u = await setupCompany(req.body);
  req.user = u; await audit(req, 'setup', 'company', u._id, null, { company: req.body.company });
  res.status(201).json({ ok: true });
}));
r.post('/auth/login', h(async (req, res) => {
  need(req.body, ['email', 'password']);
  const u = await User.findOne({ email: String(req.body.email).toLowerCase().trim() });
  if (!u || !(await bcrypt.compare(req.body.password, u.password))) throw new HttpError(401, 'Wrong email or password');
  if (!u.active) throw new HttpError(403, 'This account is deactivated. Contact your administrator.');
  res.json({ token: jwt.sign({ id: u._id, role: u.role }, config.jwt, { expiresIn: '12h' }), user: view(u) });
}));
r.get('/auth/me', auth, (req, res) => res.json(view(req.user)));
r.post('/auth/change-password', auth, h(async (req, res) => {
  need(req.body, ['currentPassword', 'newPassword']);
  if (!(await bcrypt.compare(req.body.currentPassword, req.user.password))) throw new HttpError(401, 'Current password is incorrect');
  if (req.body.newPassword.length < 8) throw new HttpError(422, 'New password must be at least 8 characters');
  if (req.body.newPassword === req.body.currentPassword) throw new HttpError(422, 'Choose a different password');
  req.user.password = await bcrypt.hash(req.body.newPassword, 10); req.user.mustChangePassword = false; await req.user.save();
  await audit(req, 'change_password', 'user', req.user._id);
  res.json({ ok: true, user: view(req.user) });
}));
module.exports = r;
