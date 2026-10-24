const r = require('express').Router();
const { Leave, Employee } = require('../models');
const { auth, allow } = require('../middleware');
const { h, need, HttpError, today } = require('../utils');
const { audit, notify, notifyRoles } = require('../services/comms');
const { balance, quote } = require('../services/leave');
r.use(auth);

const ownEmp = (req) => { if (!req.user.employee) throw new HttpError(403, 'This account has no employee record'); return req.user.employee; };

r.get('/balance', allow('hr', 'employee'), h(async (req, res) => res.json(await balance(ownEmp(req)))));
r.post('/', allow('hr', 'employee'), h(async (req, res) => {
  need(req.body, ['type', 'start', 'end']);
  const emp = ownEmp(req), days = await quote({ empId: emp, ...req.body });
  const l = await Leave.create({ employee: emp, type: req.body.type, start: req.body.start, end: req.body.end, days, reason: req.body.reason });
  await audit(req, 'create', 'leave', l._id, null, l); await notifyRoles(['hr'], `${req.user.name} applied for ${days} day(s) of ${l.type} leave (${l.start} to ${l.end})`);
  res.status(201).json(l);
}));
// Own history (HR/Employee) or everything (HR/Admin with ?scope=all)
r.get('/', h(async (req, res) => {
  const all = req.query.scope === 'all' && req.user.role !== 'employee', f = all ? {} : { employee: ownEmp(req) };
  if (req.query.status) f.status = req.query.status;
  res.json(await Leave.find(f).populate('employee', 'name code').sort('-createdAt').limit(200));
}));
r.post('/:id/cancel', allow('hr', 'employee'), h(async (req, res) => {
  const l = await Leave.findById(req.params.id); if (!l || String(l.employee) !== String(ownEmp(req))) throw new HttpError(404, 'Leave not found');
  if (!(l.status === 'pending' || (l.status === 'approved' && l.start > today()))) throw new HttpError(409, 'Only pending or future approved leave can be cancelled');
  const before = l.toObject(); l.status = 'cancelled'; await l.save(); await audit(req, 'cancel', 'leave', l._id, before, l); res.json(l);
}));
r.post('/:id/decide', allow('hr'), h(async (req, res) => {
  const l = await Leave.findById(req.params.id).populate('employee'); if (!l) throw new HttpError(404, 'Leave not found');
  if (l.status !== 'pending') throw new HttpError(409, `Already ${l.status}`);
  if (String(l.employee._id) === String(req.user.employee)) throw new HttpError(403, 'You cannot approve your own leave');
  const d = req.body.decision; if (!['approve', 'reject'].includes(d)) throw new HttpError(422, 'decision must be approve or reject');
  if (d === 'reject' && !req.body.comment) throw new HttpError(422, 'A comment is required when rejecting');
  const before = l.toObject(); l.status = d === 'approve' ? 'approved' : 'rejected'; l.comment = req.body.comment; l.decidedBy = req.user._id; await l.save();
  await audit(req, d === 'approve' ? 'approve' : 'reject', 'leave', l._id, before, l);
  await notify(l.employee.user, `Your ${l.type} leave (${l.start} to ${l.end}) was ${l.status}${l.comment ? ': ' + l.comment : ''}`);
  res.json(l);
}));
module.exports = r;
