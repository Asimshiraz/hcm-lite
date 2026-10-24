const { Employee } = require('../models');
const { workingDays, monthRange, eachDay, annualTax, round, today } = require('../utils');
const { buildCtx, dayStatus } = require('./context');

// Gross = 1.5 x basic (HRA 40%, medical 10%). Per day = gross / working days. Deduct absent + unpaid + 0.5 x half days.
// Joiners/leavers are prorated. Tax from annual slab on gross x 12, divided by 12.
async function computePayroll(month) {
  const [ms, me] = monthRange(month);
  const emps = await Employee.find({ basic: { $gt: 0 }, joinDate: { $lte: me }, $or: [{ exitDate: null }, { exitDate: { $exists: false } }, { exitDate: { $gte: ms } }] }).populate('department', 'name').sort('code');
  const ctx = await buildCtx(ms, me, emps.map((e) => e._id));
  const wdFull = workingDays(ms, me, ctx.settings, ctx.hol);
  const lines = emps.map((e) => {
    const s = e.joinDate > ms ? e.joinDate : ms, en = e.exitDate && e.exitDate < me ? e.exitDate : me;
    const gross = e.basic * 1.5, perDay = wdFull ? gross / wdFull : 0;
    const wdEmp = workingDays(s, en, ctx.settings, ctx.hol);
    let absent = 0, unpaid = 0, half = 0;
    eachDay(s, en < today() ? en : today()).forEach((d) => {
      const st = dayStatus(d, e, ctx);
      if (st === 'absent') absent++;
      else if (st === 'half_day') half++;
      else if (st === 'on_leave' && ctx.leaves(e._id).get(d) === false) unpaid++;
    });
    const earned = perDay * wdEmp, deduction = perDay * (absent + unpaid + 0.5 * half);
    const tax = annualTax(gross * 12) / 12;
    return {
      employee: String(e._id), code: e.code, name: e.name, department: e.department?.name || '—',
      basic: round(e.basic), hra: round(e.basic * 0.4), medical: round(e.basic * 0.1), gross: round(gross),
      workingDays: wdFull, payableDays: wdEmp, absent, unpaid, half, deduction: round(deduction), tax: round(tax), net: round(earned - deduction - tax),
    };
  });
  const totals = { gross: round(lines.reduce((a, l) => a + l.gross, 0)), net: round(lines.reduce((a, l) => a + l.net, 0)), count: lines.length };
  return { lines, totals };
}
module.exports = { computePayroll };
