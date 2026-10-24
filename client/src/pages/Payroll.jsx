import { useState } from 'react';
import { api, download } from '../api';
import { useAuth, useFetch, State, Card, Badge, Table, Form, money } from '../ui';

export function Payroll() {
  const { user } = useAuth(), runs = useFetch('/payroll'), [open, setOpen] = useState(null), run = useFetch(open ? '/payroll/' + open : null);
  const finalize = async () => { if (!window.confirm('Finalize and lock this month? This cannot be undone.')) return; try { await api(`/payroll/${open}/finalize`, { method: 'POST' }); runs.reload(); run.reload(); } catch (e) { alert(e.message); } };
  const p = run.data;
  return <><h2>Payroll</h2>
    {user.role === 'hr' && <Card title="Create / refresh monthly draft"><Form submit="Run payroll draft" initial={{ month: new Date().toISOString().slice(0, 7) }} fields={[{ name: 'month', label: 'Month', type: 'month', required: true }]}
      onSubmit={async (v) => { const d = await api('/payroll/run', { method: 'POST', body: v }); runs.reload(); setOpen(d._id); }} /></Card>}
    <Card title="Payroll runs"><State loading={runs.loading} error={runs.error}><Table rows={runs.data} empty="No payroll runs yet." cols={[{ label: 'Month', key: 'month' }, { label: 'Status', render: (r) => <Badge s={r.status} /> }, { label: 'Employees', render: (r) => r.totals?.count }, { label: 'Gross', render: (r) => money(r.totals?.gross) }, { label: 'Net', render: (r) => money(r.totals?.net) }, { label: '', render: (r) => <button className="sm ghost" onClick={() => setOpen(r._id)}>Open</button> }]} /></State></Card>
    {open && <Card title={p ? `Payroll ${p.month}` : 'Payroll'} right={p && user.role === 'admin' && p.status === 'draft' && <button onClick={finalize}>Finalize & lock</button>}>
      <State loading={run.loading} error={run.error}>{p && <><p><Badge s={p.status} /> {p.status === 'final' && <span className="muted">Locked — cannot be edited.</span>}</p>
        <Table rows={p.lines} cols={[{ label: 'Code', key: 'code' }, { label: 'Name', key: 'name' }, { label: 'Dept', key: 'department' }, { label: 'Gross', render: (l) => money(l.gross) }, { label: 'Absent', key: 'absent' }, { label: 'Unpaid', key: 'unpaid' }, { label: 'Half', key: 'half' }, { label: 'Deduction', render: (l) => money(l.deduction) }, { label: 'Tax', render: (l) => money(l.tax) }, { label: 'Net', render: (l) => <b>{money(l.net)}</b> }, { label: '', render: (l) => <button className="sm ghost" onClick={() => download(`/payroll/${p._id}/payslip/${l.employee}`, `payslip-${p.month}-${l.code}.pdf`).catch((e) => alert(e.message))}>PDF</button> }]} /></>}</State></Card>}</>;
}
export function Payslips() {
  const { data, loading, error } = useFetch('/payroll/my');
  return <><h2>My payslips</h2><Card><State loading={loading} error={error}><Table rows={data} empty="No finalized payslips yet." cols={[{ label: 'Month', key: 'month' }, { label: 'Gross', render: (r) => money(r.gross) }, { label: 'Deductions', render: (r) => money(r.deduction) }, { label: 'Tax', render: (r) => money(r.tax) }, { label: 'Net', render: (r) => <b>{money(r.net)}</b> }, { label: '', render: (r) => <button className="sm" onClick={() => download(`/payroll/${r.runId}/payslip/${r.employee}`, `payslip-${r.month}.pdf`).catch((e) => alert(e.message))}>Download PDF</button> }]} /></State></Card></>;
}
