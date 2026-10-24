const r = require('express').Router();
const { Announcement, Notification, Audit } = require('../models');
const { auth, allow } = require('../middleware');
const { h, need } = require('../utils');
const { audit, notify } = require('../services/comms');
const { User } = require('../models');
r.use(auth);

r.get('/announcements', h(async (req, res) => res.json(await Announcement.find().sort('-createdAt').limit(50))));
r.post('/announcements', allow('admin', 'hr'), h(async (req, res) => {
  need(req.body, ['title', 'body']);
  const a = await Announcement.create({ title: req.body.title, body: req.body.body, author: req.user._id, authorName: req.user.name });
  await audit(req, 'create', 'announcement', a._id, null, a);
  await notify((await User.find({ active: true, _id: { $ne: req.user._id } }).select('_id')).map((u) => u._id), `Announcement: ${a.title}`);
  res.status(201).json(a);
}));
r.get('/notifications', h(async (req, res) => res.json(await Notification.find({ user: req.user._id }).sort('-createdAt').limit(50))));
r.post('/notifications/read', h(async (req, res) => { await Notification.updateMany({ user: req.user._id, read: false }, { read: true }); res.json({ ok: true }); }));
// Audit log is append-only: only a read endpoint exists, and only Admin can use it.
r.get('/audit', allow('admin'), h(async (req, res) => {
  const page = Math.max(1, +req.query.page || 1), limit = 25, f = {};
  if (req.query.entity) f.entity = req.query.entity; if (req.query.action) f.action = req.query.action;
  const [items, total] = await Promise.all([Audit.find(f).sort('-createdAt').skip((page - 1) * limit).limit(limit), Audit.countDocuments(f)]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) || 1 });
}));
module.exports = r;
