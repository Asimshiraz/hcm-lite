// All dashboard / AI numbers come from here, so dashboards and the assistant always agree.
const { Types } = require('mongoose');
const { Employee, Leave, LeaveType, Payroll } = require('../models');
const { eachDay, round, today, isWorking } = require('../utils');
const { buildCtx, dayStatus } = require('./context');

const people = ({ department, employeeId, from }) => {
  const q = { $or: [{ status: { $ne: 'exited' } }, { exitDate: { $gte: from || '0000-01-01' } }] };
  if (department) q.department = department;
  if (employeeId) q._id = employeeId;
  return Employee.find(q).populate('department', 'name');
};

async function headcount({ department } = {}) {
  const q = { status: { $in: ['active', 'probation'] } };
  if (department) q.department = new Types.ObjectId(String(department));
  const total = await Employee.countDocuments(q);
  const byDepartment = await Employee.aggregate([
    { $match: q }, { $group: { _id: '$department', count: { $sum: 1 } } },
    { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } },
    { $project: { _id: 0, count: 1, department: { $ifNull: [{ $arrayElemAt: ['$d.name', 0] }, 'Unassigned'] } } }, { $sort: { department: 1 } },
  ]);
  const gender = await Employee.aggregate([{ $match: q }, { $group: { _id: { $ifNull: ['$gender', 'unspecified'] }, count: { $sum: 1 } } }, { $project: { _id: 0, gender: '$_id', count: 1 } }]);
  const t = today(), tenure = { '<1y': 0, '1-3y': 0, '3y+': 0 };
  (await Employee.find(q).select('joinDate')).forEach((e) => {
    const yrs = (new Date(t) - new Date(e.joinDate)) / (365.25 * 864e5);
    tenure[yrs < 1 ? '<1y' : yrs < 3 ? '1-3y' : '3y+']++;
  });
  return { total, byDepartment, gender, tenure: Object.entries(tenure).map(([band, count]) => ({ band, count })) };
}

async function attrition(year = today().slice(0, 4)) {
  const start = `${year}-01-01`;
  const exits = await Employee.countDocuments({ exitDate: { $regex: `^${year}` } });
  const startHC = await Employee.countDocuments({ joinDate: { $lt: start }, $or: [{ exitDate: null }, { exitDate: { $exists: false } }, { exitDate: { $gte: start } }] });
  const endHC = await Employee.countDocuments({ status: { $in: ['active', 'probation'] } });
  const avg = (startHC + endHC) / 2;
  return { year, exits, averageHeadcount: avg, attritionPct: avg ? round((exits / avg) * 100) : 0 };
}

// attendance rate = (present + late + missing_checkout + 0.5*half_day) / (working-day records - on_leave)
async function attendanceSummary({ from, to, department, employeeId }) {
  const emps = await people({ department, employeeId, from });
  const ctx = await buildCtx(from, to, emps.map((e) => e._id));
  const tot = { present: 0, late: 0, half_day: 0, missing_checkout: 0, absent: 0, on_leave: 0 };
  const byDay = {}, byDept = {}, perEmp = [];
  for (const e of emps) {
    const dn = e.department?.name || 'Unassigned', bd = (byDept[dn] ||= { absent: 0, days: 0, late: 0, present: 0 });
    const pe = { employee: e.name, code: e.code, department: dn, late: 0, absent: 0 };
    for (const d of eachDay(from, to)) {
      const s = dayStatus(d, e, ctx);
      if (!(s in tot)) continue;
      tot[s]++;
      if (s !== 'on_leave') bd.days++;
      if (s === 'absent') { bd.absent++; pe.absent++; }
      if (s === 'late') { bd.late++; pe.late++; }
      if (s === 'present' || s === 'late') bd.present++;
      if (s !== 'on_leave') { const x = (byDay[d] ||= { date: d, num: 0, den: 0 }); x.den++; x.num += s === 'half_day' ? 0.5 : s === 'absent' ? 0 : 1; }
    }
    perEmp.push(pe);
  }
  const den = tot.present + tot.late + tot.half_day + tot.missing_checkout + tot.absent;
  const rate = den ? ((tot.present + tot.late + tot.missing_checkout + 0.5 * tot.half_day) / den) * 100 : null;
  return {
    from, to, totals: tot, attendanceRatePct: round(rate),
    latePct: tot.present + tot.late ? round((tot.late / (tot.present + tot.late)) * 100) : null,
    absenteeismPct: den ? round((tot.absent / den) * 100) : null,
    trend: Object.values(byDay).sort((a, b) => (a.date < b.date ? -1 : 1)).map((x) => ({ date: x.date, ratePct: round((x.num / x.den) * 100) })),
    absenteeismByDepartment: Object.entries(byDept).map(([department, v]) => ({ department, absenteeismPct: v.days ? round((v.absent / v.days) * 100) : 0 })),
    topLateComers: perEmp.filter((p) => p.late > 0).sort((a, b) => b.late - a.late).slice(0, 5).map((p) => ({ employee: p.employee, department: p.department, lateDays: p.late })),
  };
}

async function leaveSummary({ from, to, department, employeeId }) {
  const emps = await people({ department, employeeId, from });
  const ids = emps.map((e) => e._id), names = Object.fromEntries(emps.map((e) => [String(e._id), e]));
  const ctx = await buildCtx(from, to, ids);
  const [leaves, types] = await Promise.all([Leave.find({ employee: { $in: ids }, status: 'approved', start: { $lte: to }, end: { $gte: from } }), LeaveType.find()]);
  const byType = {}, t = today();
  leaves.forEach((l) => {
    const d = eachDay(l.start < from ? from : l.start, l.end > to ? to : l.end).filter((x) => isWorking(x, ctx.settings, ctx.hol)).length;
    byType[l.type] = (byType[l.type] || 0) + d;
  });
  const onLeaveToday = leaves.filter((l) => l.start <= t && l.end >= t).map((l) => ({ employee: names[String(l.employee)]?.name, type: l.type }));
  const pendingRequests = await Leave.countDocuments({ employee: { $in: ids }, status: 'pending' });
  return {
    from, to, pendingRequests, onLeaveToday,
    byType: types.map((ty) => ({ type: ty.key, approvedDays: byType[ty.key] || 0, utilizationPct: ty.quota ? round(((byType[ty.key] || 0) / (ty.quota * (emps.length || 1))) * 100) : null })),
  };
}

async function payrollSummary({ month } = {}) {
  const run = await Payroll.findOne(month ? { month } : {}).sort('-month');
  if (!run) return { message: 'No payroll run exists yet' };
  const by = {};
  run.lines.forEach((l) => { const d = (by[l.department] ||= { department: l.department, gross: 0, net: 0, n: 0 }); d.gross += l.gross; d.net += l.net; d.n++; });
  return {
    month: run.month, status: run.status, totalGross: run.totals.gross, totalNet: run.totals.net, employees: run.totals.count,
    byDepartment: Object.values(by).map((d) => ({ department: d.department, gross: round(d.gross), net: round(d.net), avgGross: round(d.gross / d.n) })),
    averageGross: run.totals.count ? round(run.totals.gross / run.totals.count) : 0,
  };
}

async function searchEmployees({ query, department }) {
  const q = {}; if (department) q.department = department;
  if (query) { const re = new RegExp(String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); q.$or = [{ name: re }, { code: re }, { email: re }]; }
  const rows = await Employee.find(q).populate('department designation', 'name').limit(15);
  return rows.map((e) => ({ name: e.name, code: e.code, department: e.department?.name, designation: e.designation?.name, status: e.status, joined: e.joinDate }));
}
module.exports = { headcount, attrition, attendanceSummary, leaveSummary, payrollSummary, searchEmployees };
