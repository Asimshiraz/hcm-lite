import { useState } from 'react';
import { api } from '../api';
import { useAuth, useFetch, State, Card, Badge, Table, Form } from '../ui';

export function CheckInWidget() {
  const { data, loading, error, reload } = useFetch('/attendance/today'), [msg, setMsg] = useState('');
  const act = (p) => async () => { setMsg(''); try { await api('/attendance/' + p, { method: 'POST', body: {} }); reload(); } catch (e) { setMsg(e.message); } };
  return <Card title="Today">
    <State loading={loading} error={error}>
      {!data ? <p>You have not checked in yet. <button onClick={act('check-in')}>Check in</button></p>
        : <p>Checked in at <b>{data.checkIn}</b> <Badge s={data.status} /> {data.checkOut ? <>· checked out at <b>{data.checkOut}</b></> : <button onClick={act('check-out')}>Check out</button>}</p>}
      {msg && <p className="err">{msg}</p>}<small className="muted">Time is stamped by the server.</small>
    </State></Card>;
}
const thisMonth = () => new Date().toISOString().slice(0, 7);

function MyCalendar() {
  const [m, setM] = useState(thisMonth()), { data, loading, error } = useFetch('/attendance/calendar?month=' + m);
  return <Card title="My attendance calendar" right={<input type="month" value={m} onChange={(e) => setM(e.target.value)} />}>
    <State loading={loading} error={error}>{data && <div className="cal">{data.days.map((d) => <div key={d.date}><b>{d.date.slice(8)}</b><br />{!['future', 'inactive'].includes(d.status) && <Badge s={d.status} />}<br /><small>{d.checkIn || ''}{d.checkOut ? '–' + d.checkOut : ''}</small></div>)}</div>}</State></Card>;
}
function Board() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)), { data, loading, error } = useFetch('/attendance/board?date=' + date);
  return <Card title="Daily attendance board" right={<input type="date" value={date} onChange={(e) => setDate(e.target.value)} />}>
    <State loading={loading} error={error}><Table rows={data?.rows} empty="No employees registered yet." cols={[{ label: 'Code', key: 'code' }, { label: 'Name', key: 'name' }, { label: 'Department', key: 'department' }, { label: 'Status', render: (r) => <Badge s={r.status} /> }, { label: 'In', key: 'checkIn' }, { label: 'Out', key: 'checkOut' }, { label: 'Source', key: 'source' }]} /></State></Card>;
}
function Corrections() {
  const { user } = useAuth(), { data, loading, error, reload } = useFetch('/attendance/corrections');
  const decide = async (c, decision) => { const comment = window.prompt('Comment (optional)') ?? ''; try { await api(`/attendance/corrections/${c._id}/decide`, { method: 'POST', body: { decision, comment } }); reload(); } catch (e) { alert(e.message); } };
  return <Card title="Attendance corrections">
    {user.employee && <Form submit="Request correction" resetOnSuccess fields={[{ name: 'date', label: 'Date', type: 'date', required: true }, { name: 'checkIn', label: 'Check-in', type: 'time' }, { name: 'checkOut', label: 'Check-out', type: 'time' }, { name: 'reason', label: 'Reason', required: true }]}
      onSubmit={async (v) => { await api('/attendance/corrections', { method: 'POST', body: v }); reload(); }} />}
    <State loading={loading} error={error}><Table rows={data} empty="No correction requests." cols={[{ label: 'Employee', render: (c) => c.employee?.name }, { label: 'Date', key: 'date' }, { label: 'In/Out', render: (c) => `${c.checkIn || '—'} / ${c.checkOut || '—'}` }, { label: 'Reason', key: 'reason' }, { label: 'Status', render: (c) => <Badge s={c.status} /> },
      { label: '', render: (c) => user.role === 'hr' && c.status === 'pending' && c.employee?._id !== user.employee && <><button className="sm" onClick={() => decide(c, 'approve')}>Approve</button> <button className="sm bad" onClick={() => decide(c, 'reject')}>Reject</button></> }]} /></State></Card>;
}
export default function Attendance() {
  const { user } = useAuth();
  return <><h2>Attendance</h2>{user.employee && <><CheckInWidget /><MyCalendar /></>}{user.role !== 'employee' && <Board />}<Corrections /></>;
}
