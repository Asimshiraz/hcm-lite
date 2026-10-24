const r = require('express').Router();
const { Employee, Department, Designation, User, Leave, Payroll } = require('../models');
const { auth, allow } = require('../middleware');
const { h, need, pick, HttpError, isISO, today, parseCSV, toCSV } = require('../utils');
const { audit } = require('../services/comms');
const { registerPerson } = require('../services/people');
const { balance } = require('../services/leave');
const A = require('../services/analytics');
r.use(auth);

const FIELDS = ['name', 'phone', 'address', 'gender', 'department', 'designation', 'joinDate', 'exitDate', 'status', 'basic'];
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pop = (q) => q.populate('department designation', 'name');

r.get('/', h(async (req, res) => {
  const { q, department, designation, status } = req.query, page = Math.max(1, +req.query.page || 1), limit = Math.min(100, +req.query.limit || 10);
  const f = {};
  if (req.user.role === 'employee') f._id = req.user.employee;
  if (department) f.department = department;
  if (designation) f.designation = designation;
  if (status) f.status = status;
  if (q) { const re = new RegExp(esc(q), 'i'); f.$or = [{ name: re }, { code: re }, { email: re }]; }
  const [items, total] = await Promise.all([pop(Employee.find(f).sort('code').skip((page - 1) * limit).limit(limit)), Employee.countDocuments(f)]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) || 1 });
}));
r.post('/', allow('hr'), h(async (req, res) => {
  need(req.body, ['name', 'email', 'joinDate', 'basic']);
  if (!isISO(req.body.joinDate)) throw new HttpError(422, 'Join date must be YYYY-MM-DD');
  if (!(Number(req.body.basic) > 0)) throw new HttpError(422, 'Salary must be greater than 0');
  const { emp, temp } = await registerPerson({ ...pick(req.body, [...FIELDS, 'email', 'code']), department: req.body.department || undefined, designation: req.body.designation || undefined });
  await audit(req, 'create', 'employee', emp._id, null, emp);
  res.status(201).json({ employee: emp, tempPassword: temp });
}));

// ---- CSV import (dry run returns row + field + reason) / export
const COLS = ['code', 'name', 'email', 'department', 'designation', 'joinDate', 'basic', 'phone', 'gender'];
r.post('/import', allow('hr'), h(async (req, res) => {
  const rows = parseCSV(String(req.body.csv || '')); if (rows.length < 2) throw new HttpError(422, 'CSV needs a header row and at least one data row');
  const head = rows[0].map((x) => x.trim()), errors = [], good = [];
  const [depts, desigs, codes, emails] = await Promise.all([Department.find(), Designation.find(), Employee.distinct('code'), Employee.distinct('email')]);
  const dMap = Object.fromEntries(depts.map((d) => [d.name.toLowerCase(), d._id])), gMap = Object.fromEntries(desigs.map((d) => [d.name.toLowerCase(), d._id]));
  const seenC = new Set(codes), seenE = new Set(emails);
  rows.slice(1).forEach((cells, i) => {
    const row = i + 2, o = Object.fromEntries(head.map((k, j) => [k, (cells[j] || '').trim()])), bad = (field, reason) => errors.push({ row, field, reason });
    ['code', 'name', 'email', 'department', 'joinDate', 'basic'].forEach((f) => { if (!o[f]) bad(f, 'required'); });
    if (o.code && seenC.has(o.code)) bad('code', 'duplicate code'); if (o.email && seenE.has(o.email.toLowerCase())) bad('email', 'duplicate email');
    if (o.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) bad('email', 'invalid email');
    if (o.department && !dMap[o.department.toLowerCase()]) bad('department', 'unknown department');
    if (o.designation && !gMap[o.designation.toLowerCase()]) bad('designation', 'unknown designation');
    if (o.joinDate && !isISO(o.joinDate)) bad('joinDate', 'must be ISO date YYYY-MM-DD');
    if (o.basic && !(Number(o.basic) > 0)) bad('basic', 'salary must be greater than 0');
    if (!errors.some((e) => e.row === row)) { seenC.add(o.code); seenE.add(o.email.toLowerCase()); good.push({ ...o, department: dMap[o.department.toLowerCase()], designation: o.designation ? gMap[o.designation.toLowerCase()] : undefined }); }
  });
  if (req.query.dry === '1' || req.body.dry) return res.json({ dryRun: true, validRows: good.length, errors });
  if (errors.length) throw new HttpError(422, 'Fix the errors first (run a dry run)', { errors });
  const out = [];
  for (const g of good) { const { emp, temp } = await registerPerson(g); out.push({ code: emp.code, email: emp.email, tempPassword: temp }); }
  await audit(req, 'import', 'employee', '', null, { created: out.length });
  res.status(201).json({ created: out.length, logins: out });
}));
r.get('/export', allow('hr'), h(async (req, res) => {
  const list = await pop(Employee.find().sort('code'));
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename=employees.csv');
  res.send(toCSV([[...COLS, 'status'], ...list.map((e) => [e.code, e.name, e.email, e.department?.name, e.designation?.name, e.joinDate, e.basic, e.phone, e.gender, e.status])]));
}));

r.put('/me/profile', h(async (req, res) => {
  if (!req.user.employee) throw new HttpError(404, 'No employee record');
  const e = await Employee.findById(req.user.employee), before = pick(e, ['phone', 'address']);
  Object.assign(e, pick(req.body, ['phone', 'address'])); await e.save(); await audit(req, 'update', 'profile', e._id, before, pick(e, ['phone', 'address']));
  res.json(e);
}));

// Employee 360
r.get('/:id', h(async (req, res) => {
  if (req.user.role === 'employee' && String(req.user.employee) !== req.params.id) throw new HttpError(403, 'You can only view your own profile');
  const e = await pop(Employee.findById(req.params.id)); if (!e) throw new HttpError(404, 'Employee not found');
  const t = today(), from = t.slice(0, 7) + '-01';
  const [bal, leaves, att, runs] = await Promise.all([
    balance(e._id), Leave.find({ employee: e._id }).sort('-start').limit(10), A.attendanceSummary({ from, to: t, employeeId: e._id }),
    Payroll.find({ status: 'final', 'lines.employee': String(e._id) }).sort('-month').limit(6),
  ]);
  res.json({ employee: e, balance: bal, recentLeaves: leaves, attendanceThisMonth: att.totals, attendanceRatePct: att.attendanceRatePct, payslips: runs.map((p) => ({ runId: p._id, month: p.month })) });
}));
r.put('/:id', allow('hr'), h(async (req, res) => {
  const e = await Employee.findById(req.params.id); if (!e) throw new HttpError(404, 'Employee not found');
  const before = e.toObject(), b = pick(req.body, FIELDS);
  if (b.basic !== undefined && !(Number(b.basic) >= 0)) throw new HttpError(422, 'Invalid salary');
  if (b.joinDate && !isISO(b.joinDate)) throw new HttpError(422, 'Join date must be YYYY-MM-DD');
  if (b.status === 'exited' && !b.exitDate && !e.exitDate) b.exitDate = today();
  Object.assign(e, b); await e.save();
  if (b.status === 'exited' && e.user) await User.updateOne({ _id: e.user }, { active: false });
  await audit(req, b.basic !== undefined && b.basic !== before.basic ? 'update_salary' : 'update', 'employee', e._id, before, e);
  res.json(e);
}));
module.exports = r;
