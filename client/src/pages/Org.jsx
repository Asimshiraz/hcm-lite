import { useState } from 'react';
import { api } from '../api';
import { useAuth, useFetch, State, Card, Table, Form, Badge } from '../ui';

function Settings({ ro }) {
  const { data, loading, error, reload } = useFetch('/org/settings');
  return <Card title="Company settings"><State loading={loading} error={error}>{data && <Form key={data.updatedAt} initial={{ ...data, weekend: (data.weekend || []).join(',') }} submit={ro ? undefined : 'Save settings'}
    fields={[{ name: 'company', label: 'Company name' }, { name: 'officeStart', label: 'Office start (HH:MM)' }, { name: 'graceMin', label: 'Grace (minutes)', type: 'number' }, { name: 'halfDayHours', label: 'Half day under (hours)', type: 'number', step: '0.5' }, { name: 'weekend', label: 'Weekend days (0=Sun … 6=Sat)' }, { name: 'officeLat', label: 'Office latitude', type: 'number', step: 'any' }, { name: 'officeLng', label: 'Office longitude', type: 'number', step: 'any' }, { name: 'radius', label: 'Radius (m)', type: 'number' }]}
    onSubmit={async (v) => { if (ro) return; await api('/org/settings', { method: 'PUT', body: { ...v, weekend: String(v.weekend).split(',').filter((x) => x !== '').map(Number), graceMin: +v.graceMin, halfDayHours: +v.halfDayHours, radius: +v.radius, officeLat: v.officeLat === '' ? undefined : +v.officeLat, officeLng: v.officeLng === '' ? undefined : +v.officeLng } }); reload(); }} />}</State>
    {ro && <p className="muted">View only — Admin manages company settings.</p>}</Card>;
}
function List({ title, path, rows, fields, cols, ro, reload }) {
  const del = async (r) => { if (!window.confirm('Delete?')) return; try { await api(`/org/${path}/${r._id}`, { method: 'DELETE' }); reload(); } catch (e) { alert(e.message); } };
  return <Card title={title}>
    {!ro && <Form resetOnSuccess submit="Add" fields={fields} onSubmit={async (v) => { await api('/org/' + path, { method: 'POST', body: v }); reload(); }} />}
    <Table rows={rows} empty="None yet." cols={[...cols, ...(ro ? [] : [{ label: '', render: (r) => <button className="sm bad" onClick={() => del(r)}>Delete</button> }])]} /></Card>;
}
function Users() {
  const { data, loading, error, reload } = useFetch('/org/users'), [info, setInfo] = useState('');
  const act = async (u, what) => { try { const d = await api(`/org/users/${u._id}/${what}`, { method: 'POST' }); if (d.tempPassword) setInfo(`${u.email}: new temporary password ${d.tempPassword}`); reload(); } catch (e) { alert(e.message); } };
  return <Card title="Logins (Admin creates HR; HR registers employees)">
    <Form resetOnSuccess submit="Create HR login" fields={[{ name: 'name', label: 'HR name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }]}
      onSubmit={async (v) => { const d = await api('/org/users', { method: 'POST', body: v }); setInfo(`HR login created: ${v.email} / temporary password ${d.tempPassword} (shown once)`); reload(); }} />
    {info && <p className="ok">{info}</p>}
    <State loading={loading} error={error}><Table rows={data} cols={[{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Role', key: 'role' }, { label: 'State', render: (u) => <Badge s={u.active ? 'active' : 'exited'} /> },
      { label: '', render: (u) => <><button className="sm ghost" onClick={() => act(u, 'toggle')}>{u.active ? 'Deactivate' : 'Activate'}</button> <button className="sm ghost" onClick={() => act(u, 'reset')}>Reset password</button></> }]} /></State></Card>;
}
export default function Org() {
  const { user } = useAuth(), ro = user.role !== 'admin', { data, reload } = useFetch('/org/lookups');
  const name = [{ name: 'name', label: 'Name', required: true }];
  return <><h2>Organization setup</h2><Settings ro={ro} />
    <div className="grid">
      <List ro={ro} reload={reload} title="Departments" path="departments" rows={data?.departments} fields={name} cols={[{ label: 'Name', key: 'name' }]} />
      <List ro={ro} reload={reload} title="Designations" path="designations" rows={data?.designations} fields={name} cols={[{ label: 'Name', key: 'name' }]} />
      <List ro={ro} reload={reload} title="Public holidays" path="holidays" rows={data?.holidays} fields={[{ name: 'date', label: 'Date', type: 'date', required: true }, { name: 'name', label: 'Name', required: true }]} cols={[{ label: 'Date', key: 'date' }, { label: 'Name', key: 'name' }]} />
      <List ro={ro} reload={reload} title="Leave types & yearly quotas" path="leave-types" rows={data?.leaveTypes} fields={[{ name: 'key', label: 'Key (e.g. study)', required: true }, { name: 'name', label: 'Name', required: true }, { name: 'quota', label: 'Yearly quota (empty = unlimited)', type: 'number' }]} cols={[{ label: 'Name', key: 'name' }, { label: 'Quota', render: (r) => r.quota ?? 'unlimited' }, { label: 'Paid', render: (r) => (r.paid ? 'yes' : 'no') }]} />
    </div>{!ro && <Users />}</>;
}
