const r = require('express').Router();
const bcrypt = require('bcryptjs');
const { Setting, Department, Designation, LeaveType, Holiday, Employee, User } = require('../models');
const { auth, allow } = require('../middleware');
const { h, need, pick, HttpError, isISO } = require('../utils');
const { audit } = require('../services/comms');
const { registerPerson, tempPassword } = require('../services/people');
const { loadSettings } = require('../services/context');
r.use(auth);

r.get('/lookups', h(async (req, res) => {
  const [departments, designations, leaveTypes, holidays] = await Promise.all([Department.find().sort('name'), Designation.find().sort('name'), LeaveType.find().sort('name'), Holiday.find().sort('date')]);
  res.json({ departments, designations, leaveTypes, holidays });
}));
r.get('/settings', allow('admin', 'hr'), h(async (req, res) => res.json(await loadSettings())));
r.put('/settings', allow('admin'), h(async (req, res) => {
  const s = await Setting.findOne(), before = s.toObject();
  const b = pick(req.body, ['company', 'officeStart', 'graceMin', 'halfDayHours', 'weekend', 'officeLat', 'officeLng', 'radius']);
  if (b.officeStart && !/^\d{2}:\d{2}$/.test(b.officeStart)) throw new HttpError(422, 'Office start must be HH:MM');
  Object.assign(s, b); await s.save(); await audit(req, 'update', 'settings', s._id, before, s);
  res.json(s);
}));

const crud = (path, Model, fields, inUse) => {
  r.post(path, allow('admin'), h(async (req, res) => {
    need(req.body, fields.req);
    if (path === '/holidays' && !isISO(req.body.date)) throw new HttpError(422, 'Date must be YYYY-MM-DD');
    const d = await Model.create(pick(req.body, fields.all)); await audit(req, 'create', path.slice(1), d._id, null, d); res.status(201).json(d);
  }));
  r.put(path + '/:id', allow('admin'), h(async (req, res) => {
    const d = await Model.findById(req.params.id); if (!d) throw new HttpError(404, 'Not found');
    const before = d.toObject(); Object.assign(d, pick(req.body, fields.all)); await d.save(); await audit(req, 'update', path.slice(1), d._id, before, d); res.json(d);
  }));
  r.delete(path + '/:id', allow('admin'), h(async (req, res) => {
    const d = await Model.findById(req.params.id); if (!d) throw new HttpError(404, 'Not found');
    if (inUse && (await inUse(d))) throw new HttpError(409, 'In use by employees; cannot delete');
    await d.deleteOne(); await audit(req, 'delete', path.slice(1), d._id, d, null); res.json({ ok: true });
  }));
};
crud('/departments', Department, { req: ['name'], all: ['name'] }, (d) => Employee.exists({ department: d._id }));
crud('/designations', Designation, { req: ['name'], all: ['name'] }, (d) => Employee.exists({ designation: d._id }));
crud('/holidays', Holiday, { req: ['date', 'name'], all: ['date', 'name'] });
crud('/leave-types', LeaveType, { req: ['key', 'name'], all: ['key', 'name', 'quota', 'paid'] });

// Admin manages logins (HR accounts are created here; employee logins are created by HR on registration).
r.get('/users', allow('admin'), h(async (req, res) => res.json(await User.find().select('-password').sort('role name'))));
r.post('/users', allow('admin'), h(async (req, res) => {
  need(req.body, ['name', 'email']);
  const { emp, user, temp } = await registerPerson({ name: req.body.name, email: req.body.email, department: req.body.department || undefined, basic: req.body.basic }, 'hr');
  await audit(req, 'create', 'hr_user', user._id, null, { name: user.name, email: user.email, role: 'hr' });
  res.status(201).json({ id: user._id, employee: emp._id, tempPassword: temp });
}));
r.post('/users/:id/toggle', allow('admin'), h(async (req, res) => {
  const u = await User.findById(req.params.id); if (!u) throw new HttpError(404, 'Not found');
  if (String(u._id) === String(req.user._id)) throw new HttpError(422, 'You cannot deactivate your own account');
  u.active = !u.active; await u.save(); await audit(req, u.active ? 'activate' : 'deactivate', 'user', u._id, { active: !u.active }, { active: u.active });
  res.json({ active: u.active });
}));
r.post('/users/:id/reset', allow('admin'), h(async (req, res) => {
  const u = await User.findById(req.params.id); if (!u) throw new HttpError(404, 'Not found');
  const temp = tempPassword(); u.password = await bcrypt.hash(temp, 10); u.mustChangePassword = true; await u.save();
  await audit(req, 'reset_password', 'user', u._id); res.json({ tempPassword: temp });
}));
module.exports = r;
