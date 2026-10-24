import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { api, tok } from './api';
import { AuthCtx } from './ui';
import { Setup, Login, ChangePassword } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Org from './pages/Org';
import Employees, { Profile } from './pages/Employees';
import Attendance from './pages/Attendance';
import Leave from './pages/Leave';
import { Payroll, Payslips } from './pages/Payroll';
import { Announcements, Notifications, Audit } from './pages/Comms';
import AiChat from './pages/AiChat';

const MENU = {
  admin: [['/', 'Dashboard'], ['/org', 'Organization'], ['/employees', 'Employees'], ['/attendance', 'Attendance'], ['/leave', 'Leave'], ['/payroll', 'Payroll'], ['/announcements', 'Announcements'], ['/notifications', 'Notifications'], ['/audit', 'Audit log']],
  hr: [['/', 'Dashboard'], ['/employees', 'Employees'], ['/attendance', 'Attendance'], ['/leave', 'Leave'], ['/payroll', 'Payroll'], ['/payslips', 'My payslips'], ['/org', 'Organization'], ['/announcements', 'Announcements'], ['/notifications', 'Notifications']],
  employee: [['/', 'Dashboard'], ['/attendance', 'My attendance'], ['/leave', 'My leave'], ['/payslips', 'My payslips'], ['/profile', 'My profile'], ['/announcements', 'Announcements'], ['/notifications', 'Notifications']],
};

export default function App() {
  const [boot, setBoot] = useState({ loading: true }), [user, setUser] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const { setupDone } = await api('/setup/status');
        let u = null; if (setupDone && tok.get()) { try { u = await api('/auth/me'); } catch { tok.clear(); } }
        setUser(u); setBoot({ setupDone });
      } catch (e) { setBoot({ error: 'Cannot reach the server. ' + e.message }); }
    })();
  }, []);
  const logout = () => { tok.clear(); setUser(null); };
  if (boot.loading) return <div className="center"><p className="muted">Loading…</p></div>;
  if (boot.error) return <div className="center"><p className="err">{boot.error}</p></div>;
  if (!boot.setupDone) return <Setup onDone={() => setBoot({ setupDone: true })} />;
  if (!user) return <Login onLogin={(u, t) => { tok.set(t); setUser(u); }} />;
  if (user.mustChangePassword) return <ChangePassword forced onDone={setUser} onLogout={logout} />;
  return (
    <AuthCtx.Provider value={{ user, logout }}>
      <BrowserRouter>
        <div className="shell">
          <nav className="side"><h3 style={{ margin: '4px 10px 10px' }}>HCM Lite</h3>
            {MENU[user.role].map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}
            <div className="who">{user.name}<br />{user.role.toUpperCase()}<br /><a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>Sign out</a></div>
          </nav>
          <main>
            <Routes>
              <Route path="/" element={<Dashboard />} /><Route path="/org" element={<Org />} /><Route path="/employees" element={<Employees />} />
              <Route path="/attendance" element={<Attendance />} /><Route path="/leave" element={<Leave />} /><Route path="/payroll" element={<Payroll />} />
              <Route path="/payslips" element={<Payslips />} /><Route path="/profile" element={<Profile />} /><Route path="/announcements" element={<Announcements />} />
              <Route path="/notifications" element={<Notifications />} /><Route path="/audit" element={<Audit />} /><Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>
        <AiChat />
      </BrowserRouter>
    </AuthCtx.Provider>
  );
}
