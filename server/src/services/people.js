const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Employee, User, Setting, LeaveType } = require('../models');
const { HttpError, today } = require('../utils');

const tempPassword = () => crypto.randomBytes(6).toString('base64url');

// Creates the employee record AND its login (temporary password, must be changed on first sign-in).
async function registerPerson(d, role = 'employee') {
  const email = String(d.email).toLowerCase().trim();
  const code = d.code || `EMP-${String((await Employee.countDocuments()) + 1).padStart(4, '0')}`;
  const temp = tempPassword();
  const emp = await Employee.create({ ...d, email, code, joinDate: d.joinDate || today(), basic: Number(d.basic) || 0 });
  try {
    const user = await User.create({ name: d.name, email, password: await bcrypt.hash(temp, 10), role, employee: emp._id, mustChangePassword: true });
    emp.user = user._id; await emp.save();
    return { emp, user, temp };
  } catch (e) { await Employee.deleteOne({ _id: emp._id }); throw e; }
}

async function setupCompany({ company, name, email, password }) {
  if (await Setting.findOne({ setupDone: true })) throw new HttpError(409, 'Setup is already done');
  if (!company || !name || !email || !password) throw new HttpError(422, 'Company, name, email and password are required');
  if (String(password).length < 8) throw new HttpError(422, 'Password must be at least 8 characters');
  await Setting.create({ company, setupDone: true });
  const user = await User.create({ name, email: email.toLowerCase(), password: await bcrypt.hash(password, 10), role: 'admin' });
  await LeaveType.insertMany([
    { key: 'annual', name: 'Annual', quota: 14 }, { key: 'sick', name: 'Sick', quota: 8 },
    { key: 'casual', name: 'Casual', quota: 10 }, { key: 'unpaid', name: 'Unpaid', quota: null, paid: false },
  ]);
  return user;
}
module.exports = { registerPerson, setupCompany, tempPassword };
