const r = require('express').Router();
const PDF = require('pdfkit');
const { Payroll, Setting, Employee } = require('../models');
const { auth, allow } = require('../middleware');
const { h, HttpError, monthRange, today } = require('../utils');
const { audit, notify } = require('../services/comms');
const { computePayroll } = require('../services/payroll');
r.use(auth);

r.get('/', allow('hr', 'admin'), h(async (req, res) => res.json(await Payroll.find().select('-lines').sort('-month'))));
// Own payslips from finalized runs (HR and Employee)
r.get('/my', allow('hr', 'employee'), h(async (req, res) => {
  const id = String(req.user.employee || '');
  const runs = await Payroll.find({ status: 'final', 'lines.employee': id }).sort('-month');
  res.json(runs.map((p) => ({ runId: p._id, month: p.month, ...p.lines.find((l) => l.employee === id) })));
}));
r.post('/run', allow('hr'), h(async (req, res) => {
  const month = req.body.month; if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw new HttpError(422, 'month must be YYYY-MM');
  if (monthRange(month)[0] > today()) throw new HttpError(422, 'Cannot run payroll for a future month');
  let run = await Payroll.findOne({ month });
  if (run?.status === 'final') throw new HttpError(409, 'This month is finalized and locked');
  const before = run?.toObject(), { lines, totals } = await computePayroll(month);
  if (!lines.length) throw new HttpError(422, 'No employees with a salary for that month. Register employees first.');
  run = run || new Payroll({ month, createdBy: req.user._id }); run.lines = lines; run.totals = totals; run.status = 'draft'; await run.save();
  await audit(req, before ? 'recalculate' : 'create', 'payroll', run._id, before && { month, totals: before.totals }, { month, totals });
  res.status(201).json(run);
}));
r.get('/:id', allow('hr', 'admin'), h(async (req, res) => { const p = await Payroll.findById(req.params.id); if (!p) throw new HttpError(404, 'Not found'); res.json(p); }));
r.post('/:id/finalize', allow('admin'), h(async (req, res) => {
  const p = await Payroll.findById(req.params.id); if (!p) throw new HttpError(404, 'Not found');
  if (p.status === 'final') throw new HttpError(409, 'Already finalized');
  const before = { status: p.status }; p.status = 'final'; p.finalizedBy = req.user._id; p.finalizedAt = new Date(); await p.save();
  await audit(req, 'finalize', 'payroll', p._id, before, { status: 'final', month: p.month, totals: p.totals });
  const emps = await Employee.find({ _id: { $in: p.lines.map((l) => l.employee) } }).select('user');
  await notify(emps.map((e) => e.user), `Your payslip for ${p.month} is ready`);
  res.json(p);
}));
r.get('/:id/payslip/:employeeId', h(async (req, res) => {
  const p = await Payroll.findById(req.params.id); if (!p) throw new HttpError(404, 'Not found');
  if (req.user.role !== 'admin' && req.user.role !== 'hr' && String(req.user.employee) !== req.params.employeeId) throw new HttpError(403, 'You can only download your own payslip');
  if (req.user.role === 'employee' && p.status !== 'final') throw new HttpError(403, 'Payslip is not published yet');
  if (req.user.role === 'hr' && String(req.user.employee) === req.params.employeeId && p.status !== 'final') throw new HttpError(403, 'Payslip is not published yet');
  const l = p.lines.find((x) => x.employee === req.params.employeeId); if (!l) throw new HttpError(404, 'No payslip for this employee');
  const company = (await Setting.findOne())?.company || 'Company', fmt = (n) => Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=payslip-${p.month}-${l.code}.pdf`);
  const d = new PDF({ margin: 50 }); d.pipe(res);
  d.fontSize(20).text(company).fontSize(12).fillColor('#555').text(`Payslip - ${p.month}${p.status === 'draft' ? ' (DRAFT)' : ''}`).moveDown();
  d.fillColor('#000').text(`Employee: ${l.name} (${l.code})`).text(`Department: ${l.department}`).moveDown();
  [['Basic', l.basic], ['House rent (40%)', l.hra], ['Medical (10%)', l.medical], ['Gross', l.gross], [`Deductions (${l.absent} absent, ${l.unpaid} unpaid, ${l.half} half day)`, -l.deduction], ['Income tax', -l.tax]].forEach(([k, v]) => d.text(`${k}: ${fmt(v)}`));
  d.moveDown().fontSize(14).text(`Net pay: PKR ${fmt(l.net)}`).moveDown().fontSize(9).fillColor('#777').text(`Working days: ${l.workingDays}, payable days: ${l.payableDays}`); d.end();
}));
module.exports = r;
