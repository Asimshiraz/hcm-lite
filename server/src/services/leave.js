const { Leave, LeaveType, Holiday } = require('../models');
const { HttpError, isISO, workingDays, today } = require('../utils');
const { loadSettings } = require('./context');

async function balance(empId, year = today().slice(0, 4)) {
  const [types, ls] = await Promise.all([LeaveType.find().sort('name'), Leave.find({ employee: empId, status: { $in: ['approved', 'pending'] }, start: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } })]);
  return types.map((t) => {
    const sum = (st) => ls.filter((l) => l.type === t.key && l.status === st).reduce((a, l) => a + l.days, 0);
    const used = sum('approved'), pending = sum('pending');
    return { key: t.key, name: t.name, quota: t.quota, used, pending, left: t.quota == null ? null : t.quota - used, available: t.quota == null ? null : t.quota - used - pending };
  });
}

// Validates a request and returns the number of working days. Overlap or over-balance => 422.
async function quote({ empId, type, start, end, ignoreId }) {
  if (!isISO(start) || !isISO(end)) throw new HttpError(422, 'Dates must be YYYY-MM-DD');
  if (start > end) throw new HttpError(422, 'End date is before start date');
  const lt = await LeaveType.findOne({ key: type });
  if (!lt) throw new HttpError(422, 'Unknown leave type');
  const [settings, hols] = await Promise.all([loadSettings(), Holiday.find({ date: { $gte: start, $lte: end } })]);
  const days = workingDays(start, end, settings, new Set(hols.map((h) => h.date)));
  if (days === 0) throw new HttpError(422, 'Selected dates have no working days (weekends/holidays are skipped)');
  const clash = await Leave.findOne({ employee: empId, status: { $in: ['pending', 'approved'] }, start: { $lte: end }, end: { $gte: start }, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) });
  if (clash) throw new HttpError(422, `Overlaps with an existing ${clash.status} leave (${clash.start} to ${clash.end})`);
  if (lt.quota != null) {
    const b = (await balance(empId, start.slice(0, 4))).find((x) => x.key === type);
    if (days > b.available) throw new HttpError(422, `Not enough ${lt.name} leave: ${b.available} day(s) available, ${days} requested`);
  }
  return days;
}
module.exports = { balance, quote };
