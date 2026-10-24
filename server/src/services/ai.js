// AI assistant: LLM picks a tool, the backend runs it with the caller's scope, the LLM writes the answer.
// The key stays on the server; the model never touches the database; nothing is saved by the AI.
const config = require('../config');
const { AiLog, Department, LeaveType } = require('../models');
const { HttpError, today, nowParts, isISO, round } = require('../utils');
const A = require('./analytics');
const { balance } = require('./leave');
const { loadSettings } = require('./context');

const monthStart = () => today().slice(0, 7) + '-01';
const range = (a) => ({ from: isISO(a.from) ? a.from : monthStart(), to: isISO(a.to) ? a.to : today() });
const dept = async (name) => {
  if (!name) return undefined;
  const d = await Department.findOne({ name: new RegExp('^' + String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') });
  if (!d) throw new Error(`Unknown department "${name}"`);
  return d._id;
};
const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
const dateProps = { from: { type: 'string', description: 'YYYY-MM-DD, default start of this month' }, to: { type: 'string', description: 'YYYY-MM-DD, default today' }, department: { type: 'string', description: 'Department name (optional)' } };

const TOOLS = {
  get_headcount: { roles: ['admin', 'hr'], description: 'Number of active employees, overall and by department.', parameters: P({ department: dateProps.department }), run: async (a) => A.headcount({ department: await dept(a.department) }) },
  get_attendance_summary: { roles: ['admin', 'hr', 'employee'], description: 'Attendance totals, attendance rate, late %, absenteeism for a period. Employees only get their own.', parameters: P(dateProps), run: async (a, u) => A.attendanceSummary({ ...range(a), department: u.role === 'employee' ? undefined : await dept(a.department), employeeId: u.role === 'employee' ? u.employee : undefined }) },
  get_late_comers: { roles: ['admin', 'hr'], description: 'Top 5 employees who came late most often in a period.', parameters: P(dateProps), run: async (a) => (await A.attendanceSummary({ ...range(a), department: await dept(a.department) })).topLateComers },
  get_leave_summary: { roles: ['admin', 'hr'], description: 'Approved leave days by type, who is on leave today, pending requests.', parameters: P(dateProps), run: async (a) => A.leaveSummary({ ...range(a), department: await dept(a.department) }) },
  get_my_leave_balance: { roles: ['admin', 'hr', 'employee'], description: "The current user's own leave quota, used, pending and remaining days this year.", parameters: P({}), run: async (a, u) => (u.employee ? balance(u.employee) : { message: 'This account has no employee record' }) },
  get_payroll_summary: { roles: ['admin', 'hr'], description: 'Payroll totals and per-department cost for a month (latest run if month omitted).', parameters: P({ month: { type: 'string', description: 'YYYY-MM' } }), run: async (a) => A.payrollSummary({ month: a.month }) },
  search_employees: { roles: ['admin', 'hr'], description: 'Find employees by name, code or email. Never returns salary.', parameters: P({ query: { type: 'string' }, department: dateProps.department }), run: async (a) => A.searchEmployees({ query: a.query, department: await dept(a.department) }) },
};
const toolsFor = (role) => Object.entries(TOOLS).filter(([, t]) => t.roles.includes(role)).map(([name, t]) => ({ type: 'function', function: { name, description: t.description, parameters: t.parameters } }));

async function policyText() {
  const s = await loadSettings(), types = await LeaveType.find();
  return `COMPANY POLICY (answer policy questions ONLY from this; otherwise say you do not know):
- Office starts ${s.officeStart}; grace ${s.graceMin} min, so check-in after the grace period is LATE. Worked time under ${s.halfDayHours} hours = half day. Absent = no attendance record and no approved leave. Missing checkout = no check-out. Weekend days: ${s.weekend.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}. One check-in per day. The server stamps the time.
- Leave counts working days only (weekends and public holidays are skipped). Yearly quotas: ${types.map((t) => `${t.name} ${t.quota ?? 'unlimited'}`).join(', ')}. Overlapping requests or exceeding the balance are rejected. HR approves or rejects leave.
- Payroll: gross = 1.5 x basic (HRA 40%, medical 10% of basic). Per-day pay = gross / working days. Deductions: absent days, unpaid leave, 0.5 day per half day. Joiners/leavers are prorated. Tax is on annual gross (gross x 12): up to 600k none; 5% up to 1.2M; 30k + 15% up to 2.4M; 210k + 25% up to 3.6M; 510k + 35% above. Admin finalizes payroll; finalized runs are locked.`;
}

async function callLLM(body) {
  if (!config.ai.key) throw new HttpError(503, 'AI assistant is not configured (AI_API_KEY missing). You can still use the normal screens.');
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(config.ai.base + '/chat/completions', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.ai.key }, body: JSON.stringify({ model: config.ai.model, temperature: 0.2, ...body }) });
    if (!r.ok) throw new Error('AI provider error ' + r.status);
    return (await r.json()).choices[0].message;
  } catch (e) {
    throw new HttpError(e.name === 'AbortError' ? 504 : 502, 'The AI assistant is taking too long or is unavailable. Please try again, or use the normal screens.');
  } finally { clearTimeout(timer); }
}

async function guard(user, kind, prompt, fn) {
  const since = new Date(Date.now() - 3600e3);
  if ((await AiLog.countDocuments({ user: user._id, createdAt: { $gte: since } })) >= 20) throw new HttpError(429, 'AI limit reached (20 requests per hour). Please try again later.');
  const t0 = Date.now(), log = { user: user._id, kind, prompt: String(prompt).slice(0, 500) };
  try { const out = await fn(log); await AiLog.create({ ...log, ok: true, ms: Date.now() - t0 }); return out; }
  catch (e) { await AiLog.create({ ...log, ok: false, error: e.message, ms: Date.now() - t0 }); throw e; }
}

const chat = (user, history) => guard(user, 'chat', history.at(-1)?.content, async (log) => {
  const np = nowParts();
  const system = `You are the HCM Lite assistant for a company HR system. Current user: ${user.name}, role: ${user.role}. Today is ${np.date}.
Rules: use the provided tools for any number or fact about people, attendance, leave or payroll; never invent data. Answer in the user's language (English, Urdu or Roman Urdu). Be brief.
Never reveal another person's salary or private data; if asked, politely refuse. If a tool is not available to this user, say you cannot access that for their role.
${await policyText()}`;
  const msgs = [{ role: 'system', content: system }, ...history.slice(-10).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 1000) }))];
  const tools = toolsFor(user.role), used = [];
  for (let i = 0; i < 3; i++) {
    const m = await callLLM({ messages: msgs, tools, tool_choice: 'auto' });
    if (!m.tool_calls?.length) { log.tool = used.join(','); return { answer: m.content, tools: used, aiGenerated: true }; }
    msgs.push(m);
    for (const c of m.tool_calls) {
      let out; const def = TOOLS[c.function.name];
      try {
        if (!def || !def.roles.includes(user.role)) throw new Error('Tool not permitted for this role');
        out = await def.run(JSON.parse(c.function.arguments || '{}'), user); used.push(c.function.name);
      } catch (e) { out = { error: e.message }; }
      msgs.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(out).slice(0, 6000) });
    }
  }
  const m = await callLLM({ messages: msgs });
  return { answer: m.content, tools: used, aiGenerated: true };
});

const summarize = (user, kpis) => guard(user, 'summary', 'dashboard summary', async () => {
  const m = await callLLM({ messages: [
    { role: 'system', content: 'You write dashboard insights for HR managers. Use ONLY the numbers in the JSON. Return 3 to 5 short bullet points, each starting with "- ". No invented figures. If data is empty, say there is not enough data yet.' },
    { role: 'user', content: JSON.stringify(kpis).slice(0, 12000) }] });
  return { summary: m.content, aiGenerated: true };
});

// Smart leave: sentence -> {type,start,end,reason}. Validate; retry once; on failure the UI shows the normal form.
const smartLeave = (user, text) => guard(user, 'smart_leave', text, async () => {
  const types = await LeaveType.find(), keys = types.map((t) => t.key), np = nowParts();
  const wd = new Date(np.date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const sys = `Convert the employee's leave request into JSON only: {"type":"<one of ${keys.join('|')}>","start":"YYYY-MM-DD","end":"YYYY-MM-DD","reason":"short text"}.
Today is ${np.date} (${wd}). "next Monday" means the first Monday strictly after today. Pick "sick" for illness, "annual" for vacation/travel, "casual" for weddings, errands and other personal events unless stated otherwise. Understand English, Urdu and Roman Urdu.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const m = await callLLM({ messages: [{ role: 'system', content: sys }, { role: 'user', content: String(text).slice(0, 500) }], response_format: { type: 'json_object' } });
      const j = JSON.parse(m.content);
      if (keys.includes(j.type) && isISO(j.start) && isISO(j.end) && j.start <= j.end) return { leave: { type: j.type, start: j.start, end: j.end, reason: String(j.reason || '').slice(0, 200) }, aiGenerated: true };
    } catch (e) { if (e.status) throw e; }
  }
  throw new HttpError(422, 'Could not understand that request. Please fill the form manually.', { fallback: true });
});
module.exports = { chat, summarize, smartLeave };
