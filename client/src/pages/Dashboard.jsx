import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { api, download } from '../api';
import { useAuth, useFetch, State, Card, Kpi, Table, money } from '../ui';
import { CheckInWidget } from './Attendance';

const COLORS = ['#0f9d88', '#5b4bc9', '#e8962a', '#d64545', '#3b82f6'];
const Bars = ({ data, x, y, h = 220 }) => !data?.length ? <p className="muted">No data yet.</p> : <ResponsiveContainer width="100%" height={h}><BarChart data={data}><CartesianGrid strokeDasharray="3 3" opacity={.3} /><XAxis dataKey={x} /><YAxis /><Tooltip /><Bar dataKey={y} fill="#0f9d88" /></BarChart></ResponsiveContainer>;

function Summary({ kpis }) {
  const [s, setS] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); setErr(''); try { setS((await api('/ai/summary', { method: 'POST', body: { kpis } })).summary); } catch (e) { setErr(e.message); } setBusy(false); };
  return <Card title="AI summary" right={<button className="sm" onClick={run} disabled={busy}>{busy ? 'Thinking…' : 'Summarize'}</button>}>
    {err && <p className="err">{err}</p>}{s ? <><div style={{ whiteSpace: 'pre-wrap' }}>{s}</div><small className="muted">AI-generated · based only on the numbers on this dashboard</small></> : <p className="muted">Click Summarize for 3–5 insight bullets.</p>}</Card>;
}

function Staff({ role }) {
  const t = new Date().toISOString().slice(0, 10), [f, setF] = useState({ from: t.slice(0, 8) + '01', to: t, department: '' });
  const lk = useFetch('/org/lookups'), q = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { data: d, loading, error } = useFetch('/dashboard?' + q);
  return <>
    <div className="top"><h2>{role === 'admin' ? 'Company dashboard' : 'HR dashboard'}</h2>
      <div className="form" style={{ gridTemplateColumns: 'repeat(3, 150px)' }}>
        <label>From<input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label>To<input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <label>Department<select value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}><option value="">All</option>{lk.data?.departments.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
      </div></div>
    <State loading={loading} error={error}>{d && <>
      <div className="kpis">
        <Kpi label="Headcount" value={d.headcount} /><Kpi label="Present today" value={d.presentToday} /><Kpi label="On leave today" value={d.onLeaveToday} /><Kpi label="Late today" value={d.lateToday} />
        {role === 'hr' ? <><Kpi label="Pending approvals" value={d.pendingApprovals} sub={`${d.pendingLeave} leave · ${d.pendingCorrections} corrections`} /><Kpi label="Attendance rate" value={d.attendanceRatePct != null ? d.attendanceRatePct + '%' : null} /></>
          : <><Kpi label="Attrition YTD" value={d.attritionYtdPct + '%'} sub={`${d.exitsYtd} exits`} /><Kpi label={'Payroll cost' + (d.payrollCost ? ' · ' + d.payrollCost.month : '')} value={d.payrollCost ? money(d.payrollCost.gross) : null} sub={d.payrollCost?.status} /><Kpi label="Average salary (gross)" value={d.averageSalary != null ? money(d.averageSalary) : null} /></>}
      </div>
      <Summary kpis={d} />
      <div className="grid">
        <Card title="Headcount by department"><Bars data={d.headcountByDepartment} x="department" y="count" /></Card>
        {role === 'hr' ? <>
          <Card title="Attendance trend (%)"><ResponsiveContainer width="100%" height={220}><LineChart data={d.attendanceTrend}><CartesianGrid strokeDasharray="3 3" opacity={.3} /><XAxis dataKey="date" tickFormatter={(x) => x.slice(5)} /><YAxis domain={[0, 100]} /><Tooltip /><Line dataKey="ratePct" stroke="#e8962a" /></LineChart></ResponsiveContainer></Card>
          <Card title="Absenteeism by department (%)"><Bars data={d.absenteeismByDepartment} x="department" y="absenteeismPct" /></Card>
          <Card title="Leave by type (approved days)"><Bars data={d.leaveByType} x="type" y="approvedDays" /></Card>
          <Card title="Top 5 late-comers"><Table cols={[{ label: 'Employee', key: 'employee' }, { label: 'Department', key: 'department' }, { label: 'Late days', key: 'lateDays' }]} rows={d.topLateComers} empty="No late arrivals in this range." /></Card>
        </> : <>
          <Card title="Payroll cost by department"><Bars data={d.payrollCostByDepartment} x="department" y="gross" /></Card>
          <Card title="Gender"><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={d.gender} dataKey="count" nameKey="gender" label>{d.gender.map((_, i) => <Cell key={i} fill={COLORS[i % 5]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></Card>
          <Card title="Tenure"><Bars data={d.tenure} x="band" y="count" /></Card>
          <Card title="Recent activity"><Table cols={[{ label: 'When', render: (r) => new Date(r.at).toLocaleString() }, { label: 'Who', key: 'actor' }, { label: 'Action', render: (r) => `${r.action} ${r.entity}` }]} rows={d.auditFeed} /></Card>
        </>}
      </div>
      <Announce items={d.announcements} /></>}
    </State></>;
}
const Announce = ({ items }) => <Card title="Announcements">{items?.length ? items.map((a) => <p key={a._id}><b>{a.title}</b> — {a.body}<br /><small className="muted">{a.authorName} · {new Date(a.createdAt).toLocaleDateString()}</small></p>) : <p className="muted">No announcements.</p>}</Card>;

function Personal() {
  const { data: d, loading, error } = useFetch('/dashboard');
  return <><h2>My dashboard</h2><CheckInWidget />
    <State loading={loading} error={error}>{d && <>
      <div className="kpis"><Kpi label="Hours this week" value={`${d.hoursThisWeek} / ${d.weeklyTarget}`} /><Kpi label="Late count (this month)" value={d.lateCount} /><Kpi label="Attendance rate" value={d.attendanceRatePct != null ? d.attendanceRatePct + '%' : null} />
        {d.leaveBalance.filter((b) => b.quota != null).map((b) => <Kpi key={b.key} label={b.name + ' leave left'} value={b.left} sub={b.pending ? `${b.pending} pending` : ''} />)}</div>
      <Card title="Last payslip">{d.lastPayslip ? <p>{d.lastPayslip.month} · net PKR {money(d.lastPayslip.net)} <button className="sm" onClick={() => download(`/payroll/${d.lastPayslip.runId}/payslip/${d.lastPayslip.employee}`, `payslip-${d.lastPayslip.month}.pdf`).catch((e) => alert(e.message))}>Download PDF</button></p> : <p className="muted">No payslip yet. <Link to="/payslips">Payslips</Link></p>}</Card>
      <Announce items={d.announcements} /></>}</State></>;
}
export default function Dashboard() { const { user } = useAuth(); return user.role === 'employee' ? <Personal /> : <><Staff role={user.role} />{user.employee && <CheckInWidget />}</>; }
