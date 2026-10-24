const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const S = (def, opts = {}) => new Schema(def, { timestamps: true, ...opts });
const ref = (m) => ({ type: Schema.Types.ObjectId, ref: m });

const Setting = model('Setting', S({
  company: String, officeStart: { type: String, default: '09:00' }, graceMin: { type: Number, default: 15 },
  halfDayHours: { type: Number, default: 5 }, weekend: { type: [Number], default: [6, 0] },
  officeLat: Number, officeLng: Number, radius: { type: Number, default: 150 }, setupDone: { type: Boolean, default: false },
}));
const User = model('User', S({
  name: String, email: { type: String, unique: true, lowercase: true, trim: true }, password: String,
  role: { type: String, enum: ['admin', 'hr', 'employee'], required: true }, employee: ref('Employee'),
  active: { type: Boolean, default: true }, mustChangePassword: { type: Boolean, default: false },
}));
const Department = model('Department', S({ name: { type: String, unique: true, trim: true, required: true } }));
const Designation = model('Designation', S({ name: { type: String, unique: true, trim: true, required: true } }));
const LeaveType = model('LeaveType', S({ key: { type: String, unique: true, lowercase: true, trim: true, required: true }, name: String, quota: { type: Number, default: null }, paid: { type: Boolean, default: true } }));
const Holiday = model('Holiday', S({ date: { type: String, unique: true, required: true }, name: String }));
const Employee = model('Employee', S({
  code: { type: String, unique: true }, name: { type: String, required: true }, email: { type: String, unique: true, lowercase: true, trim: true },
  phone: String, address: String, gender: String, department: ref('Department'), designation: ref('Designation'),
  joinDate: String, exitDate: String, status: { type: String, enum: ['active', 'probation', 'exited'], default: 'active' },
  basic: { type: Number, default: 0 }, user: ref('User'),
}));
const attSchema = S({
  employee: { ...ref('Employee'), required: true }, date: { type: String, required: true }, checkIn: String, checkOut: String,
  status: { type: String, default: 'present' }, source: { type: String, default: 'web' }, lat: Number, lng: Number, distance: Number,
});
attSchema.index({ employee: 1, date: 1 }, { unique: true });
const Attendance = model('Attendance', attSchema);
const Correction = model('Correction', S({
  employee: ref('Employee'), date: String, checkIn: String, checkOut: String, reason: String,
  status: { type: String, default: 'pending' }, comment: String, decidedBy: ref('User'),
}));
const Leave = model('Leave', S({
  employee: ref('Employee'), type: String, start: String, end: String, days: Number, reason: String,
  status: { type: String, default: 'pending' }, comment: String, decidedBy: ref('User'),
}));
const Payroll = model('Payroll', S({
  month: { type: String, unique: true }, status: { type: String, default: 'draft' }, lines: [Schema.Types.Mixed], totals: Schema.Types.Mixed,
  createdBy: ref('User'), finalizedBy: ref('User'), finalizedAt: Date,
}));
const Announcement = model('Announcement', S({ title: String, body: String, author: ref('User'), authorName: String }));
const Notification = model('Notification', S({ user: ref('User'), text: String, read: { type: Boolean, default: false } }));
const Audit = model('Audit', S({ actor: ref('User'), actorName: String, action: String, entity: String, entityId: String, before: Schema.Types.Mixed, after: Schema.Types.Mixed }));
const AiLog = model('AiLog', S({ user: ref('User'), kind: String, prompt: String, tool: String, ok: Boolean, error: String, ms: Number }));

module.exports = { Setting, User, Department, Designation, LeaveType, Holiday, Employee, Attendance, Correction, Leave, Payroll, Announcement, Notification, Audit, AiLog };
