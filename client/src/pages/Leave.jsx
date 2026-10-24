import { useState } from 'react';
import { api } from '../api';
import { useAuth, useFetch, State, Card, Badge, Table, Form, Kpi } from '../ui';

function MyLeave() {
  const lk = useFetch('/org/lookups'), bal = useFetch('/leave/balance'), hist = useFetch('/leave');
  const [text, setText] = useState(''), [prefill, setPrefill] = useState({}), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const smart = async () => { setMsg(''); setBusy(true); try { const d = await api('/ai/smart-leave', { method: 'POST', body: { text } }); setPrefill(d.leave); setMsg('AI-generated suggestion — check the form below and confirm.'); } catch (e) { setMsg(e.message); } setBusy(false); };
  const cancel = async (l) => { try { await api(`/leave/${l._id}/cancel`, { method: 'POST' }); hist.reload(); bal.reload(); } catch (e) { alert(e.message); } };
  return <>
    <State loading={bal.loading} error={bal.error}><div className="kpis">{bal.data?.map((b) => <Kpi key={b.key} label={`${b.name} left`} value={b.quota == null ? '∞' : b.left} sub={`${b.used} used${b.pending ? ' · ' + b.pending + ' pending' : ''}`} />)}</div></State>
    <Card title="Smart leave — describe it in plain words">
      <div className="form"><label style={{ gridColumn: '1/-1' }}><input value={text} placeholder="e.g. I need next Monday and Tuesday off for my sister's wedding" onChange={(e) => setText(e.target.value)} /></label><button onClick={smart} disabled={busy || !text.trim()}>{busy ? 'Thinking…' : 'Fill the form'}</button></div>
      {msg && <p className={msg.startsWith('AI') ? 'ok' : 'err'}>{msg}</p>}
    </Card>
    <Card title="Apply for leave">
      <Form key={JSON.stringify(prefill)} initial={prefill} submit="Submit request" fields={[{ name: 'type', label: 'Type', type: 'select', required: true, options: (lk.data?.leaveTypes || []).map((t) => ({ value: t.key, label: t.name })) }, { name: 'start', label: 'From', type: 'date', required: true }, { name: 'end', label: 'To', type: 'date', required: true }, { name: 'reason', label: 'Reason' }]}
        onSubmit={async (v) => { await api('/leave', { method: 'POST', body: v }); setPrefill({}); setMsg(''); hist.reload(); bal.reload(); }} />
    </Card>
    <Card title="My leave history"><State loading={hist.loading} error={hist.error}><Table rows={hist.data} empty="No leave requests yet." cols={[{ label: 'Type', key: 'type' }, { label: 'From', key: 'start' }, { label: 'To', key: 'end' }, { label: 'Days', key: 'days' }, { label: 'Status', render: (l) => <Badge s={l.status} /> }, { label: 'HR comment', key: 'comment' }, { label: '', render: (l) => ['pending', 'approved'].includes(l.status) && <button className="sm ghost" onClick={() => cancel(l)}>Cancel</button> }]} /></State></Card></>;
}
function Inbox() {
  const { user } = useAuth(), [st, setSt] = useState('pending'), { data, loading, error, reload } = useFetch('/leave?scope=all' + (st ? '&status=' + st : ''));
  const decide = async (l, decision) => { const comment = window.prompt(decision === 'reject' ? 'Reason for rejection (required)' : 'Comment (optional)') ?? ''; try { await api(`/leave/${l._id}/decide`, { method: 'POST', body: { decision, comment } }); reload(); } catch (e) { alert(e.message); } };
  return <Card title={user.role === 'hr' ? 'Leave approval inbox' : 'All leave requests (view only)'} right={<select value={st} onChange={(e) => setSt(e.target.value)}>{['pending', 'approved', 'rejected', 'cancelled', ''].map((s) => <option key={s} value={s}>{s || 'all'}</option>)}</select>}>
    <State loading={loading} error={error}><Table rows={data} empty="Nothing in this list." cols={[{ label: 'Employee', render: (l) => l.employee?.name }, { label: 'Type', key: 'type' }, { label: 'From', key: 'start' }, { label: 'To', key: 'end' }, { label: 'Days', key: 'days' }, { label: 'Reason', key: 'reason' }, { label: 'Status', render: (l) => <Badge s={l.status} /> },
      { label: '', render: (l) => user.role === 'hr' && l.status === 'pending' && l.employee?._id !== user.employee && <><button className="sm" onClick={() => decide(l, 'approve')}>Approve</button> <button className="sm bad" onClick={() => decide(l, 'reject')}>Reject</button></> }]} /></State></Card>;
}
export default function Leave() { const { user } = useAuth(); return <><h2>Leave</h2>{user.employee && <MyLeave />}{user.role !== 'employee' && <Inbox />}</>; }
