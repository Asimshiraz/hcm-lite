import { useState } from 'react';
import { api } from '../api';
import { Form, Card } from '../ui';

export function Setup({ onDone }) {
  const [ok, setOk] = useState(false);
  if (ok) return <div className="center"><Card title="Company created"><p>Your Admin account is ready.</p><button onClick={onDone}>Go to sign in</button></Card></div>;
  return (
    <div className="center"><Card title="Welcome to HCM Lite — first-run setup">
      <p className="muted">Create your company and the Admin account. The system starts empty.</p>
      <Form submit="Create company" fields={[
        { name: 'company', label: 'Company name', required: true }, { name: 'name', label: 'Admin name', required: true },
        { name: 'email', label: 'Admin email', type: 'email', required: true }, { name: 'password', label: 'Password (min 8 chars)', type: 'password', required: true }]}
        onSubmit={async (v) => { await api('/setup', { method: 'POST', body: v }); setOk(true); }} />
    </Card></div>
  );
}
export function Login({ onLogin }) {
  return (
    <div className="center"><Card title="Sign in to HCM Lite">
      <Form submit="Sign in" fields={[{ name: 'email', label: 'Email', type: 'email', required: true }, { name: 'password', label: 'Password', type: 'password', required: true }]}
        onSubmit={async (v) => { const d = await api('/auth/login', { method: 'POST', body: v }); onLogin(d.user, d.token); }} />
    </Card></div>
  );
}
export function ChangePassword({ forced, onDone, onLogout }) {
  return (
    <div className="center"><Card title={forced ? 'Set a new password' : 'Change password'}>
      {forced && <p className="muted">You signed in with a temporary password. Choose a new one to continue.</p>}
      <Form submit="Change password" fields={[{ name: 'currentPassword', label: 'Current / temporary password', type: 'password', required: true }, { name: 'newPassword', label: 'New password (min 8 chars)', type: 'password', required: true }]}
        onSubmit={async (v) => { const d = await api('/auth/change-password', { method: 'POST', body: v }); onDone(d.user); }} />
      {onLogout && <p><a href="#" onClick={(e) => { e.preventDefault(); onLogout(); }}>Sign out</a></p>}
    </Card></div>
  );
}
