import { FormEvent, useEffect, useState } from 'react';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import App from './App';
import { api, setCurrentUser } from './api/client';
import { User } from './types';
import { postSync } from './utils/sync';
import { AdminPortal } from './components/AdminPortal';

interface Tenant { id: string; name: string; email: string; is_active: boolean }
const TOKEN = 'textile.accessToken';
const REFRESH = 'textile.refreshToken';
const SELECTED = 'textile.selectedTenant';

async function refreshSession() {
  const refreshToken = localStorage.getItem(REFRESH);
  if (!refreshToken) throw new Error('Please sign in');
  const response = await fetch('/api/auth/refresh', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) throw new Error('Session expired');
  const session = await response.json();
  localStorage.setItem(TOKEN, session.token);
  localStorage.setItem(REFRESH, session.refreshToken);
  return session.token as string;
}

export default function AuthShell() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState(localStorage.getItem(TOKEN) || '');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selected, setSelected] = useState(localStorage.getItem(SELECTED) || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');

  async function loadAccount() {
    let account: User;
    try { account = await api.getMe(); }
    catch { setAccessToken(await refreshSession()); account = await api.getMe(); }
    setCurrentUser(account);
    setUser(account);
    if (account.role === 'admin') {
      const response = await fetch('/api/admin/tenants', { headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN)}` } });
      if (!response.ok) throw new Error('Could not load factories');
      const list: Tenant[] = await response.json();
      setTenants(list);
      if (!list.some((t) => t.id === selected)) {
        setSelected(''); localStorage.removeItem(SELECTED);
      }
    } else if (account.tenantId) {
      setSelected(account.tenantId);
      localStorage.setItem(SELECTED, account.tenantId);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem(TOKEN)) { setLoading(false); return; }
    loadAccount().catch(() => { localStorage.removeItem(TOKEN); localStorage.removeItem(REFRESH); setUser(null); }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    const renew = () => { refreshSession().then(setAccessToken).catch(() => logout()); };
    const interval = window.setInterval(renew, 40 * 60 * 1000);
    window.addEventListener('focus', renew);
    return () => { clearInterval(interval); window.removeEventListener('focus', renew); };
  }, [user]);

  useEffect(() => {
    const tenantId = user?.role === 'factory_owner' ? user.tenantId : selected;
    if (!user || (user.role === 'factory_owner' && user.tenantActive === false) || !tenantId || !accessToken || !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) return;
    const client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: `textile-realtime-${crypto.randomUUID()}` },
    });
    let channel: RealtimeChannel | undefined;
    client.realtime.setAuth(accessToken);
    channel = client.channel(`tenant-state-${tenantId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tenant_states', filter: `tenant_id=eq.${tenantId}` }, () => {
        postSync({ type: 'masters' });
        postSync({ type: 'entries' });
        postSync({ type: 'saved', date: '' });
      }).subscribe();
    return () => { if (channel) void client.removeChannel(channel); };
  }, [user, selected, accessToken]);

  function logout() {
    localStorage.removeItem(TOKEN); localStorage.removeItem(REFRESH); localStorage.removeItem(SELECTED);
    setUser(null); setSelected(''); setTenants([]); setAccessToken('');
  }

  async function login(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const session = await api.login(email, password);
      localStorage.setItem(TOKEN, session.token); localStorage.setItem(REFRESH, session.refreshToken);
      setAccessToken(session.token);
      await loadAccount(); setPassword('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign in failed'); }
  }

  function chooseTenant(id: string) {
    setSelected(id);
    localStorage.setItem(SELECTED, id);
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault(); setPasswordNotice('');
    const response = await fetch('/api/auth/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const result = await response.json();
    if (!response.ok) { setPasswordNotice(result.error || 'Password change failed'); return; }
    setCurrentPassword(''); setNewPassword(''); setShowPasswordForm(false);
    setPasswordNotice('Password changed');
  }

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white">Loading account…</div>;
  if (!user) return <main className="min-h-screen grid place-items-center bg-slate-950 text-white p-4"><form onSubmit={login} className="w-full max-w-sm p-6 space-y-4 rounded-xl border border-slate-700 bg-slate-900">
    <h1 className="text-xl font-semibold">Loom Production · Sign in</h1>
    <label className="block">Email<input className="mt-1 w-full p-2 rounded bg-slate-800 border border-slate-600" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
    <label className="block">Password<input className="mt-1 w-full p-2 rounded bg-slate-800 border border-slate-600" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    <button className="w-full rounded bg-white text-black p-2 font-semibold">Sign in</button>
  </form></main>;
  if (user.role === 'factory_owner' && user.tenantActive === false) return <main className="min-h-screen grid place-items-center bg-slate-950 text-white p-4"><section className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 text-center"><h1 className="text-xl font-semibold">Factory account inactive</h1><p className="mt-2 text-sm text-slate-400">{user.companyName || 'Your factory'} is currently inactive. Contact your platform administrator to restore access.</p><button onClick={logout} className="mt-5 rounded bg-white px-4 py-2 font-semibold text-slate-950">Sign out</button></section></main>;
  if (user.role === 'admin' && !selected) return <>
    <div className="flex flex-wrap items-center justify-end gap-4 bg-slate-950 text-white px-4 py-2 text-sm">
      <span>{user.name}</span>{passwordNotice && <span role="status">{passwordNotice}</span>}
      <button onClick={() => setShowPasswordForm((value) => !value)}>Change password</button>
    </div>
    {showPasswordForm && <form onSubmit={changePassword} className="flex flex-wrap items-end gap-2 bg-slate-900 text-white px-4 py-3 text-sm">
      <label>Current password<input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="block p-2 rounded bg-slate-800" /></label>
      <label>New password (12+ characters)<input type="password" minLength={12} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="block p-2 rounded bg-slate-800" /></label>
      <button className="rounded bg-white text-black px-4 py-2">Save password</button>
    </form>}
    <AdminPortal accessToken={accessToken} tenants={tenants} onTenantsChange={setTenants} onSelectFactory={chooseTenant} onLogout={logout} />
  </>;
  return <><div className="flex items-center justify-end gap-4 bg-slate-950 text-white px-4 py-1 text-sm"><span>{user.name}{user.role === 'admin' ? ` · ${tenants.find((t) => t.id === selected)?.name || 'Factory'}` : user.companyName ? ` · ${user.companyName}` : ''}</span>{passwordNotice && <span role="status">{passwordNotice}</span>}<button onClick={() => setShowPasswordForm((value) => !value)}>Change password</button>{user.role === 'admin' && <button onClick={() => { setSelected(''); localStorage.removeItem(SELECTED); }}>Switch factory</button>}<button onClick={logout}>Sign out</button></div>{showPasswordForm && <form onSubmit={changePassword} className="flex flex-wrap items-end gap-2 bg-slate-900 text-white px-4 py-3 text-sm"><label>Current password<input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="block p-2 rounded bg-slate-800" /></label><label>New password (12+ characters)<input type="password" minLength={12} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="block p-2 rounded bg-slate-800" /></label><button className="rounded bg-white text-black px-4 py-2">Save password</button></form>}<App key={user.role === 'factory_owner' ? user.tenantId : selected} /></>;
}
