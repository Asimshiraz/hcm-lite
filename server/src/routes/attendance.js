const r = require('express').Router();
const { Attendance, Correction, Employee } = require('../models');
const { auth, allow } = require('../middleware');
const { h, need, HttpError, nowParts, today, isISO, checkInStatus, hoursBetween, haversine, monthRange, eachDay, round } = require('../utils');
const { audit, notify } = require('../services/comms');
const { buildCtx, dayStatus, loadSettings } = require('../services/context');
r.use(auth);

const ownEmp = (req) => { if (!req.user.employee) throw new HttpError(403, 'This account has no employee record'); return req.user.employee; };

// Server stamps the time. One record per employee per day (second check-in = 409).
r.post('/check-in', allow('hr', 'employee'), h(async (req, res) => {
  const emp = ownEmp(req), s = await loadSettings(), { date, time } = nowParts(), b = req.body || {};
  let extra = {};
  if (b.source === 'camera') { // camera + location check, decided on the server
    if (Number(b.faceCount) !== 1) throw new HttpError(422, 'Exactly one face must be detected');
    if (b.lat == null || b.lng == null) throw new HttpError(422, 'Location is required');
    if (b.accuracy == null || Number(b.accuracy) > 100) throw new HttpError(422, 'GPS accuracy is worse than 100 m');
    if (s.officeLat == null || s.officeLng == null) throw new HttpError(422, 'Admin has not set the office location yet');
    const dist = haversine(+b.lat, +b.lng, s.officeLat, s.officeLng);
    if (dist > s.radius) throw new HttpError(422, `You are ${Math.round(dist)} m from the office (allowed ${s.radius} m). Ask HR for a correction.`);
    extra = { source: 'camera', lat: +b.lat, lng: +b.lng, distance: Math.round(dist) };
  }
  if (await Attendance.exists({ employee: emp, date })) throw new HttpError(409, 'You already checked in today');
  const rec = await Attendance.create({ employee: emp, date, checkIn: time, status: checkInStatus(time, s), ...extra });
  res.status(201).json(rec);
}));
r.post('/check-out', allow('hr', 'employee'), h(async (req, res) => {
  const emp = ownEmp(req), s = await loadSettings(), { date, time } = nowParts();
  const rec = await Attendance.findOne({ employee: emp, date }); if (!rec) throw new HttpError(404, 'You have not checked in today');
  if (rec.checkOut) throw new HttpError(409, 'You already checked out today');
  rec.checkOut = time; if (hoursBetween(rec.checkIn, time) < s.halfDayHours) rec.status = 'half_day'; await rec.save();
  res.json(rec);
}));
r.get('/today', allow('hr', 'employee'), h(async (req, res) => res.json((await Attendance.findOne({ employee: ownEmp(req), date: today() })) || null)));

// Calendar: own (employee) or any employee (HR/Admin via ?employeeId=)
r.get('/calendar', h(async (req, res) => {
  const month = req.query.month || today().slice(0, 7), [from, to] = monthRange(month);
  const id = req.user.role === 'employee' ? ownEmp(req) : req.query.employeeId || req.user.employee;
  if (!id) throw new HttpError(422, 'employeeId is required');
  const e = await Employee.findById(id); if (!e) throw new HttpError(404, 'Employee not found');
  const ctx = await buildCtx(from, to, [e._id]);
  res.json({ month, days: eachDay(from, to).map((d) => { const rec = ctx.att(e._id).get(d); return { date: d, status: dayStatus(d, e, ctx), checkIn: rec?.checkIn, checkOut: rec?.checkOut, source: rec?.source }; }) });
}));
r.get('/board', allow('hr', 'admin'), h(async (req, res) => {
  const date = isISO(req.query.date) ? req.query.date : today();
  const f = { $or: [{ status: { $ne: 'exited' } }, { exitDate: { $gte: date } }] }; if (req.query.department) f.department = req.query.department;
  const emps = await Employee.find(f).populate('department', 'name').sort('code'), ctx = await buildCtx(date, date, emps.map((e) => e._id));
  const rows = emps.map((e) => { const rec = ctx.att(e._id).get(date), st = dayStatus(date, e, ctx); return { employee: e._id, code: e.code, name: e.name, department: e.department?.name, status: st === 'pending' ? 'not_in_yet' : st, checkIn: rec?.checkIn, checkOut: rec?.checkOut, source: rec?.source }; });
  res.json({ date, rows });
}));

// Corrections: employee requests with a reason, HR approves/rejects, Admin views.
r.post('/corrections', allow('hr', 'employee'), h(async (req, res) => {
  need(req.body, ['date', 'reason']);
  if (!isISO(req.body.date) || req.body.date > today()) throw new HttpError(422, 'Date must be a valid past or current date');
  if (!req.body.checkIn && !req.body.checkOut) throw new HttpError(422, 'Provide a check-in and/or check-out time');
  const c = await Correction.create({ employee: ownEmp(req), date: req.body.date, checkIn: req.body.checkIn, checkOut: req.body.checkOut, reason: req.body.reason });
  await require('../services/comms').notifyRoles(['hr'], `${req.user.name} requested an attendance correction for ${c.date}`);
  res.status(201).json(c);
}));
r.get('/corrections', h(async (req, res) => {
  const f = req.user.role === 'employee' ? { employee: ownEmp(req) } : {}; if (req.query.status) f.status = req.query.status;
  res.json(await Correction.find(f).populate('employee', 'name code').sort('-createdAt').limit(100));
}));
r.post('/corrections/:id/decide', allow('hr'), h(async (req, res) => {
  const c = await Correction.findById(req.params.id).populate('employee'); if (!c) throw new HttpError(404, 'Not found');
  if (c.status !== 'pending') throw new HttpError(409, 'Already decided');
  const approve = req.body.decision === 'approve'; if (!approve && req.body.decision !== 'reject') throw new HttpError(422, 'decision must be approve or reject');
  c.status = approve ? 'approved' : 'rejected'; c.comment = req.body.comment; c.decidedBy = req.user._id; await c.save();
  if (approve) {
    const s = await loadSettings(); let rec = await Attendance.findOne({ employee: c.employee._id, date: c.date }) || new Attendance({ employee: c.employee._id, date: c.date });
    const before = rec.toObject(); rec.checkIn = c.checkIn || rec.checkIn; rec.checkOut = c.checkOut || rec.checkOut; rec.source = 'correction';
    if (rec.checkIn) rec.status = checkInStatus(rec.checkIn, s);
    if (rec.checkIn && rec.checkOut && hoursBetween(rec.checkIn, rec.checkOut) < s.halfDayHours) rec.status = 'half_day';
    await rec.save(); await audit(req, 'approve_correction', 'attendance', rec._id, before, rec);
  } else await audit(req, 'reject_correction', 'correction', c._id, null, c);
  await notify(c.employee.user, `Your attendance correction for ${c.date} was ${c.status}${c.comment ? ': ' + c.comment : ''}`);
  res.json(c);
}));
module.exports = r;
