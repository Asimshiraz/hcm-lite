import { useState } from 'react';
import { api, download } from '../api';
import { useAuth, useFetch, State, Card, Badge, Table, Form, Modal, Kpi, money } from '../ui';
import { ChangePassword } from './Auth';

const opt = (a) => (a || []).map((x) => ({ value: x._id, label: x.name }));

function Detail({ id, onClose, onChanged }) {
  const { user } = useAuth(), { data, loading, error, reload } = useFetch('/employees/' + id), lk = useFetch('/org/lookups'), [edit, setEdit] = useState(false);
  const e = data?.employee;
  return <Modal title={e ? `${e.name} · ${e.code}` : 'Employee'} onClose={onClose}>
    <State loading={loading} error={error}>{data && <>
      <div className="kpis"><Kpi label="Attendance rate (month)" value={data.attendanceRatePct != null ? data.attendanceRatePct + '%' : null} /><Kpi label="Late (month)" value={data.attendanceThisMonth.late} /><Kpi label="Absent (month)" value={data.attendanceThisMonth.absent} />{data.balance.filter((b) => b.quota != null).map((b) => <Kpi key={b.key} label={b.name + ' left'} value={b.left} />)}</div>
      <p>{e.email} · {e.phone || 'no phone'} · {e.department?.name || 'no department'} / {e.designation?.name || 'no designation'} · joined {e.joinDate} <Badge s={e.status} /><br />Basic salary: <b>{money(e.basic)}</b></p>
      {user.role === 'hr' && <button className="ghost" onClick={() => setEdit(!edit)}>{edit ? 'Close edit' : 'Edit details & salary'}</button>}
      {edit && <Form initial={{ name: e.name, phone: e.phone, address: e.address, department: e.department?._id, designation: e.designation?._id, status: e.status, basic: e.basic, joinDate: e.joinDate, gender: e.gender }} fields={[{ name: 'name', label: 'Name' }, { name: 'phone', label: 'Phone' }, { name: 'address', label: 'Address' }, { name: 'gender', label: 'Gender', type: 'select', options: ['male', 'female', 'other'].map((x) => ({ value: x, label: x })) }, { name: 'department', label: 'Department', type: 'select', options: opt(lk.data?.departments) }, { name: 'designation', label: 'Designation', type: 'select', options: opt(lk.data?.designations) }, { name: 'status', label: 'Status', type: 'select', options: ['active', 'probation', 'exited'].map((x) => ({ value: x, label: x })) }, { name: 'basic', label: 'Basic salary', type: 'number' }]}
        onSubmit={async (v) => { await api('/employees/' + id, { method: 'PUT', body: { ...v, department: v.department || null, designation: v.designation || null } }); reload(); onChanged(); }} />}
      <h4>Recent leave</h4><Table rows={data.recentLeaves} empty="No leave." cols={[{ label: 'Type', key: 'type' }, { label: 'From', key: 'start' }, { label: 'To', key: 'end' }, { label: 'Days', key: 'days' }, { label: 'Status', render: (l) => <Badge s={l.status} /> }]} />
      <h4>Payslips</h4>{data.payslips.length ? data.payslips.map((p) => <button key={p.runId} className="sm ghost" onClick={() => download(`/payroll/${p.runId}/payslip/${id}`, `payslip-${p.month}.pdf`).catch((x) => alert(x.message))}>{p.month}</button>) : <p className="muted">No finalized payslips.</p>}</>}</State></Modal>;
}
function Import({ onDone }) {
  const [csv, setCsv] = useState(''), [res, setRes] = useState(null), [err, setErr] = useState('');
  const run = async (dry) => { setErr(''); try { setRes(await api('/employees/import' + (dry ? '?dry=1' : ''), { method: 'POST', body: { csv } })); if (!dry) onDone(); } catch (e) { setErr(e.message); setRes(e.data?.errors ? { errors: e.data.errors } : null); } };
  return <Card title="CSV import">
    <p className="muted">Columns: code,name,email,department,designation,joinDate,basic,phone,gender (department/designation must already exist)</p>
    <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files[0]; if (f) setCsv(await f.text()); }} />
    <textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="Paste CSV here" />
    <button className="ghost" onClick={() => run(true)} disabled={!csv}>Dry run</button> <button onClick={() => run(false)} disabled={!csv}>Import</button>
    {err && <p className="err">{err}</p>}
    {res?.validRows != null && <p className="ok">{res.validRows} valid row(s), {res.errors.length} error(s).</p>}
    {res?.created != null && <><p className="ok">Created {res.created} employees. Share these temporary passwords:</p><Table rows={res.logins} cols={[{ label: 'Code', key: 'code' }, { label: 'Email', key: 'email' }, { label: 'Temp password', key: 'tempPassword' }]} /></>}
    {res?.errors?.length > 0 && <Table rows={res.errors} cols={[{ label: 'Row', key: 'row' }, { label: 'Field', key: 'field' }, { label: 'Reason', key: 'reason' }]} />}</Card>;
}
export default function Employees() {
  const { user } = useAuth(), [f, setF] = useState({ q: '', department: '', status: '', page: 1 }), [sel, setSel] = useState(null), [made, setMade] = useState(null), [imp, setImp] = useState(false);
  const lk = useFetch('/org/lookups'), qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString(), { data, loading, error, reload } = useFetch('/employees?' + qs);
  return <>
    <div className="top"><h2>Employees</h2>{user.role === 'hr' && <div><button className="ghost" onClick={() => setImp(!imp)}>Import CSV</button> <button className="ghost" onClick={() => download('/employees/export', 'employees.csv')}>Export CSV</button></div>}</div>
    {user.role === 'hr' && <Card title="Register employee (creates their login)">
      <Form resetOnSuccess submit="Register" fields={[{ name: 'name', label: 'Full name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'code', label: 'Code (auto if empty)' }, { name: 'department', label: 'Department', type: 'select', options: opt(lk.data?.departments) }, { name: 'designation', label: 'Designation', type: 'select', options: opt(lk.data?.designations) }, { name: 'joinDate', label: 'Join date', type: 'date', required: true }, { name: 'basic', label: 'Basic salary', type: 'number', required: true }, { name: 'phone', label: 'Phone' }, { name: 'gender', label: 'Gender', type: 'select', options: ['male', 'female', 'other'].map((x) => ({ value: x, label: x })) }]}
        onSubmit={async (v) => { const d = await api('/employees', { method: 'POST', body: v }); setMade({ name: d.employee.name, email: d.employee.email, pw: d.tempPassword }); reload(); }} />
      {made && <p className="ok">Login created for <b>{made.name}</b>: {made.email} / temporary password <b>{made.pw}</b> (shown once; must be changed on first sign-in).</p>}
    </Card>}
    {imp && <Import onDone={reload} />}
    <Card>
      <div className="form"><label>Search<input value={f.q} placeholder="name, code, email" onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} /></label>
        <label>Department<select value={f.department} onChange={(e) => setF({ ...f, department: e.target.value, page: 1 })}><option value="">All</option>{opt(lk.data?.departments).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label>Status<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}><option value="">All</option>{['active', 'probation', 'exited'].map((s) => <option key={s}>{s}</option>)}</select></label></div>
      <State loading={loading} error={error}><Table rows={data?.items} empty="No employees found." cols={[{ label: 'Code', key: 'code' }, { label: 'Name', render: (r) => <a href="#" onClick={(e) => { e.preventDefault(); setSel(r._id); }}>{r.name}</a> }, { label: 'Department', render: (r) => r.department?.name }, { label: 'Designation', render: (r) => r.designation?.name }, { label: 'Joined', key: 'joinDate' }, { label: 'Status', render: (r) => <Badge s={r.status} /> }]} />
        {data && <p className="muted">Page {data.page} of {data.pages} · {data.total} total <button className="sm ghost" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>Prev</button> <button className="sm ghost" disabled={f.page >= data.pages} onClick={() => setF({ ...f, page: f.page + 1 })}>Next</button></p>}</State>
    </Card>
    {sel && <Detail id={sel} onClose={() => setSel(null)} onChanged={reload} />}</>;
}
export function Profile() {
  const { user } = useAuth(), { data, loading, error, reload } = useFetch('/employees/' + user.employee), [pw, setPw] = useState(false);
  const e = data?.employee;
  return <><h2>My profile</h2><State loading={loading} error={error}>{e && <Card><p><b>{e.name}</b> · {e.code}<br />{e.email} · {e.department?.name} / {e.designation?.name} · joined {e.joinDate}</p>
    <h4>Edit contact details</h4><Form initial={{ phone: e.phone, address: e.address }} fields={[{ name: 'phone', label: 'Phone' }, { name: 'address', label: 'Address' }]} onSubmit={async (v) => { await api('/employees/me/profile', { method: 'PUT', body: v }); reload(); }} />
    <p><button className="ghost" onClick={() => setPw(true)}>Change password</button></p></Card>}</State>
    {pw && <Modal title="Change password" onClose={() => setPw(false)}><ChangePassword onDone={() => setPw(false)} /></Modal>}</>;
}
