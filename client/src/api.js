const BASE = import.meta.env.VITE_API_URL || '/api';
export const tok = { get: () => localStorage.getItem('hcm_token'), set: (t) => localStorage.setItem('hcm_token', t), clear: () => localStorage.removeItem('hcm_token') };
const headers = () => ({ 'Content-Type': 'application/json', ...(tok.get() ? { Authorization: 'Bearer ' + tok.get() } : {}) });

export async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(BASE + path, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || 'Request failed'); e.status = r.status; e.data = d; throw e; }
  return d;
}
export async function download(path, filename) {
  const r = await fetch(BASE + path, { headers: headers() });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Download failed'); }
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
