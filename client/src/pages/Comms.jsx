import { useState } from 'react';
import { api } from '../api';
import { useAuth, useFetch, State, Card, Table, Form } from '../ui';

export function Announcements() {
  const { user } = useAuth(), { data, loading, error, reload } = useFetch('/announcements');
  return <><h2>Announcements</h2>
    {user.role !== 'employee' && <Card title="Post an announcement"><Form resetOnSuccess submit="Post" fields={[{ name: 'title', label: 'Title', required: true }, { name: 'body', label: 'Message', type: 'textarea', required: true }]} onSubmit={async (v) => { await api('/announcements', { method: 'POST', body: v }); reload(); }} /></Card>}
    <State loading={loading} error={error} empty={data && !data.length}>{data?.map((a) => <Card key={a._id} title={a.title}><p>{a.body}</p><small className="muted">{a.authorName} · {new Date(a.createdAt).toLocaleString()}</small></Card>)}</State></>;
}
export function Notifications() {
  const { data, loading, error, reload } = useFetch('/notifications');
  return <><div className="top"><h2>Notifications</h2><button className="ghost" onClick={async () => { await api('/notifications/read', { method: 'POST' }); reload(); }}>Mark all read</button></div>
    <Card><State loading={loading} error={error} empty={data && !data.length}>{data?.map((n) => <p key={n._id} style={{ fontWeight: n.read ? 400 : 700 }}>{n.text}<br /><small className="muted">{new Date(n.createdAt).toLocaleString()}</small></p>)}</State></Card></>;
}
export function Audit() {
  const [page, setPage] = useState(1), { data, loading, error } = useFetch('/audit?page=' + page);
  return <><h2>Audit log</h2><Card><p className="muted">Append-only. Entries cannot be edited or deleted.</p>
    <State loading={loading} error={error}><Table rows={data?.items} empty="No activity yet." cols={[{ label: 'When', render: (a) => new Date(a.createdAt).toLocaleString() }, { label: 'Actor', key: 'actorName' }, { label: 'Action', key: 'action' }, { label: 'Entity', key: 'entity' },
      { label: 'Before → After', render: (a) => <details><summary>view</summary><pre style={{ maxWidth: 420, overflow: 'auto', fontSize: 11 }}>{JSON.stringify({ before: a.before, after: a.after }, null, 1)}</pre></details> }]} />
      {data && <p className="muted">Page {data.page} of {data.pages} <button className="sm ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button> <button className="sm ghost" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button></p>}</State></Card></>;
}
