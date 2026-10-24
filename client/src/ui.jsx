import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { api } from './api';

export const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function useFetch(path) {
  const [s, setS] = useState({ data: null, loading: !!path, error: '' });
  const load = useCallback(() => {
    if (!path) return;
    setS((x) => ({ ...x, loading: true, error: '' }));
    api(path).then((data) => setS({ data, loading: false, error: '' })).catch((e) => setS({ data: null, loading: false, error: e.message }));
  }, [path]);
  useEffect(load, [load]);
  return { ...s, reload: load };
}
export const State = ({ loading, error, empty, children }) =>
  loading ? <p className="muted">Loading…</p> : error ? <p className="err">{error}</p> : empty ? <p className="muted">Nothing here yet.</p> : children;
export const Card = ({ title, right, children, className = '' }) => (
  <section className={'card ' + className}>{(title || right) && <header><h3>{title}</h3><div>{right}</div></header>}{children}</section>
);
export const Badge = ({ s }) => <span className={'badge ' + s}>{String(s ?? '').replace(/_/g, ' ')}</span>;
export const Kpi = ({ label, value, sub }) => <div className="kpi"><b>{value ?? '—'}</b><span>{label}</span>{sub && <small>{sub}</small>}</div>;
export const Modal = ({ title, onClose, children }) => (
  <div className="overlay" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><header><h3>{title}</h3><button className="ghost" onClick={onClose}>✕</button></header>{children}</div></div>
);
export const money = (n) => (n == null ? '—' : Number(n).toLocaleString('en-PK', { maximumFractionDigits: 0 }));

// Generic form: fields = [{name,label,type,options:[{value,label}],required,placeholder}]
export function Form({ fields, onSubmit, submit = 'Save', initial = {}, resetOnSuccess = false }) {
  const [v, setV] = useState(initial), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await onSubmit(v); if (resetOnSuccess) setV(initial); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={go} className="form">
      {fields.map((f) => (
        <label key={f.name}>{f.label}
          {f.type === 'select' ? (
            <select required={f.required} value={v[f.name] ?? ''} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>
              <option value="">{f.placeholder || '— select —'}</option>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : f.type === 'textarea' ? (
            <textarea required={f.required} value={v[f.name] ?? ''} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
          ) : (
            <input type={f.type || 'text'} required={f.required} placeholder={f.placeholder} value={v[f.name] ?? ''} step={f.step} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
          )}
        </label>
      ))}
      {err && <p className="err">{err}</p>}
      <button disabled={busy}>{busy ? 'Please wait…' : submit}</button>
    </form>
  );
}
export const Table = ({ cols, rows, empty = 'No records.' }) => !rows?.length ? <p className="muted">{empty}</p> : (
  <div className="scroll"><table><thead><tr>{cols.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={r._id || r.id || i}>{cols.map((c) => <td key={c.label}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>)}</tbody></table></div>
);
