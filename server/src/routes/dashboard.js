const r = require('express').Router();
const { Employee, Leave, Correction, Attendance, Announcement, Payroll, Audit } = require('../models');
const { auth } = require('../middleware');
const { h, today, isISO, addDays, hoursBetween, round } = require('../utils');
const A = require('../services/analytics');
const { balance } = require('../services/leave');
r.use(auth);

// All numbers are computed on the server and are filterable by date range and department.
r.get('/', h(async (req, res) => {
  const t = today(), from = isISO(req.query.from) ? req.query.from : t.slice(0, 7) + '-01', to = isISO(req.query.to) ? req.query.to : t;
  const department = req.query.department || undefined, role = req.user.role;
  const announcements = await Announcement.find().sort('-createdAt').limit(5);

  if (role === 'employee') {
    const e = req.user.employee, dow = (new Date(t + 'T00:00:00Z').getUTCDay() + 6) % 7, weekStart = addDays(t, -dow);
    const [week, att, bal, runs, todayRec] = await Promise.all([
      Attendance.find({ employee: e, date: { $gte: weekStart, $lte: t } }), A.attendanceSummary({ from, to, employeeId: e }), balance(e),
      Payroll.find({ status: 'final', 'lines.employee': String(e) }).sort('-month').limit(1), Attendance.findOne({ employee: e, date: t }),
    ]);
    const hours = week.filter((x) => x.checkIn && x.checkOut).reduce((a, x) => a + hoursBetween(x.checkIn, x.checkOut), 0);
    const last = runs[0]?.lines.find((l) => l.employee === String(e));
    return res.json({ role, from, to, hoursThisWeek: round(hours), weeklyTarget: 40, lateCount: att.totals.late, attendanceRatePct: att.attendanceRatePct, leaveBalance: bal, today: todayRec, lastPayslip: last ? { runId: runs[0]._id, month: runs[0].month, net: last.net, employee: String(e) } : null, announcements });
  }

  const [hc, att, leave, pendingLeave, pendingCorr] = await Promise.all([
    A.headcount({ department }), A.attendanceSummary({ from, to, department }), A.leaveSummary({ from, to, department }),
    Leave.countDocuments({ status: 'pending' }), Correction.countDocuments({ status: 'pending' }),
  ]);
  const todayAtt = await A.attendanceSummary({ from: t, to: t, department });
  const base = { role, from, to, department: department || null, headcount: hc.total, headcountByDepartment: hc.byDepartment, announcements, presentToday: todayAtt.totals.present + todayAtt.totals.late + todayAtt.totals.half_day, onLeaveToday: leave.onLeaveToday.length, lateToday: todayAtt.totals.late };

  if (role === 'hr') return res.json({ ...base, pendingApprovals: pendingLeave + pendingCorr, pendingLeave, pendingCorrections: pendingCorr, attendanceRatePct: att.attendanceRatePct, latePct: att.latePct, absenteeismPct: att.absenteeismPct, attendanceTrend: att.trend, absenteeismByDepartment: att.absenteeismByDepartment, leaveByType: leave.byType, topLateComers: att.topLateComers });

  const [attr, pay, audit, runs] = await Promise.all([A.attrition(to.slice(0, 4)), A.payrollSummary({}), Audit.find().sort('-createdAt').limit(8), Payroll.find().select('month status totals').sort('month')]);
  res.json({ ...base, attritionYtdPct: attr.attritionPct, exitsYtd: attr.exits, payrollCost: pay.message ? null : { month: pay.month, status: pay.status, gross: pay.totalGross, net: pay.totalNet }, averageSalary: pay.averageGross ?? null, payrollCostByDepartment: pay.byDepartment || [], payrollByMonth: runs.map((x) => ({ month: x.month, gross: x.totals.gross, net: x.totals.net })), gender: (await A.headcount({ department })).gender, tenure: (await A.headcount({ department })).tenure, attendanceRatePct: att.attendanceRatePct, auditFeed: audit.map((a) => ({ at: a.createdAt, actor: a.actorName, action: a.action, entity: a.entity })) });
}));
module.exports = r;
