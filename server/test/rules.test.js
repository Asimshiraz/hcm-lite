const test = require('node:test');
const assert = require('node:assert');
const u = require('../src/utils');
const S = { officeStart: '09:00', graceMin: 15, halfDayHours: 5, weekend: [6, 0] };

test('late only after grace period', () => {
  assert.equal(u.checkInStatus('09:15', S), 'present');
  assert.equal(u.checkInStatus('09:16', S), 'late');
});
test('working days skip weekends and holidays', () => {
  // 2026-10-19 is Monday .. 2026-10-25 Sunday
  assert.equal(u.workingDays('2026-10-19', '2026-10-25', S, new Set()), 5);
  assert.equal(u.workingDays('2026-10-19', '2026-10-25', S, new Set(['2026-10-21'])), 4);
});
test('month range', () => { assert.deepEqual(u.monthRange('2026-02'), ['2026-02-01', '2026-02-28']); });
test('tax slabs match the brief', () => {
  assert.equal(u.annualTax(600000), 0);
  assert.equal(u.annualTax(1200000), 30000);
  assert.equal(u.annualTax(2400000), 210000);
  assert.equal(u.annualTax(3600000), 510000);
  assert.equal(u.annualTax(4000000), 510000 + 140000);
});
test('haversine ~111 km per degree latitude', () => {
  const d = u.haversine(24.86, 67.0, 25.86, 67.0); assert.ok(Math.abs(d - 111195) < 500);
});
test('hours and CSV round trip', () => {
  assert.equal(u.hoursBetween('09:00', '13:30'), 4.5);
  const rows = u.parseCSV('a,b\n"x,1","he said ""hi"""\n'); assert.deepEqual(rows[1], ['x,1', 'he said "hi"']);
  assert.equal(u.toCSV(rows), 'a,b\n"x,1","he said ""hi"""');
});
