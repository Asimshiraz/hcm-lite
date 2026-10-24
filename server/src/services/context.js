// Loads settings + holidays + attendance + approved leave for a date range, and derives the status of any day.
const { Setting, Holiday, Attendance, Leave, LeaveType } = require('../models');
const { today, eachDay, isWeekend, isWorking } = require('../utils');

const loadSettings = async () => (await Setting.findOne()) || new Setting();

async function buildCtx(from, to, empIds) {
  const f = empIds ? { employee: { $in: empIds } } : {};
  const [settings, hols, att, leaves, types] = await Promise.all([
    loadSettings(), Holiday.find({ date: { $gte: from, $lte: to } }),
    Attendance.find({ date: { $gte: from, $lte: to }, ...f }),
    Leave.find({ status: 'approved', start: { $lte: to }, end: { $gte: from }, ...f }), LeaveType.find(),
  ]);
  const hol = new Set(hols.map((x) => x.date));
  const paid = Object.fromEntries(types.map((t) => [t.key, t.paid]));
  const attBy = new Map(), leaveBy = new Map();
  att.forEach((r) => { const k = String(r.employee); if (!attBy.has(k)) attBy.set(k, new Map()); attBy.get(k).set(r.date, r); });
  leaves.forEach((l) => {
    const k = String(l.employee); if (!leaveBy.has(k)) leaveBy.set(k, new Map());
    eachDay(l.start < from ? from : l.start, l.end > to ? to : l.end).forEach((d) => { if (isWorking(d, settings, hol)) leaveBy.get(k).set(d, paid[l.type] !== false); });
  });
  const none = new Map();
  return { settings, hol, today: today(), att: (id) => attBy.get(String(id)) || none, leaves: (id) => leaveBy.get(String(id)) || none };
}

// status: inactive | weekend | holiday | future | on_leave | present | late | half_day | missing_checkout | absent | pending
function dayStatus(d, emp, ctx) {
  if (d < emp.joinDate || (emp.exitDate && d > emp.exitDate)) return 'inactive';
  if (isWeekend(d, ctx.settings.weekend)) return 'weekend';
  if (ctx.hol.has(d)) return 'holiday';
  if (d > ctx.today) return 'future';
  const r = ctx.att(emp._id).get(d);
  if (r) return r.checkOut || d >= ctx.today ? r.status : 'missing_checkout';
  if (ctx.leaves(emp._id).has(d)) return 'on_leave';
  return d === ctx.today ? 'pending' : 'absent';
}
module.exports = { loadSettings, buildCtx, dayStatus };
