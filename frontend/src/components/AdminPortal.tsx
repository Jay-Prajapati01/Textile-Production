import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { Activity, Building2, Factory, Gauge, Layers3, Plus, RefreshCw, Search, Users, X } from 'lucide-react';
import { getTodayString, toLocalDateString } from '../utils/date';

interface Tenant {
  id: string; name: string; email: string; is_active: boolean; created_at?: string;
  last_activity?: string | null; loom_count?: number; active_loom_count?: number; worker_count?: number;
  days_recorded?: number; production?: number; meters?: number; revenue?: number;
}
interface Point { date: string; production: number; meters: number; revenue: number; factories_reporting: number }
interface Leader { factory: string; loom?: string; worker?: string; code?: string; meters: number; production?: number; wages?: number }
interface Overview {
  from: string; to: string; tenant_count: number; active_tenants: number; inactive_tenants: number;
  total_looms: number; active_looms: number; total_workers: number; shift_a: number; shift_b: number;
  production: number; meters: number; revenue: number; recorded_days: number; average_efficiency: number;
  trend: Point[]; factories: Tenant[]; top_looms: Leader[]; top_workers: Leader[];
}
const headers = (token: string) => ({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' });
const fmt = (value = 0) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 });
const money = (value = 0) => '₹' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const defaultFrom = () => { const date = new Date(); date.setDate(date.getDate() - 29); return toLocalDateString(date); };

export function AdminPortal({ accessToken, tenants, onTenantsChange, onSelectFactory, onLogout }: {
  accessToken: string; tenants: Tenant[]; onTenantsChange: (items: Tenant[]) => void;
  onSelectFactory: (id: string) => void; onLogout: () => void;
}) {
  const [tab, setTab] = useState<'overview' | 'factories'>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(getTodayString);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');

  async function loadOverview() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/overview?from=' + from + '&to=' + to, { headers: headers(accessToken) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load analytics');
      setOverview(data); onTenantsChange(data.factories);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load analytics'); }
    finally { setLoading(false); }
  }
  async function loadTenants() {
    const response = await fetch('/api/admin/tenants', { headers: headers(accessToken) });
    if (!response.ok) throw new Error('Could not load factories');
    onTenantsChange(await response.json());
  }
  useEffect(() => { void loadOverview(); }, [accessToken, from, to]);

  async function createFactory(event: FormEvent) {
    event.preventDefault(); setError('');
    const response = await fetch('/api/admin/tenants', { method: 'POST', headers: headers(accessToken), body: JSON.stringify({ name, email, password }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || 'Could not create factory'); return; }
    setName(''); setEmail(''); setPassword(''); setShowCreate(false);
    await loadTenants(); await loadOverview();
  }
  async function updateFactory(id: string, updates: Partial<Tenant>) {
    setError('');
    const response = await fetch('/api/admin/tenants/' + id, { method: 'PATCH', headers: headers(accessToken), body: JSON.stringify(updates) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || 'Could not update factory'); return; }
    setEditing(null); await loadTenants(); await loadOverview();
  }
  const filtered = useMemo(() => (overview?.factories || tenants).filter((item) =>
    (item.name + ' ' + item.email).toLowerCase().includes(search.trim().toLowerCase())), [overview, tenants, search]);
  const points = overview?.trend.length && overview.trend.length > 40
    ? overview.trend.filter((_, i) => i % Math.ceil(overview.trend.length / 40) === 0 || i === overview.trend.length - 1)
    : overview?.trend || [];
  const max = Math.max(1, ...(points || []).map((point) => point.production));

  return <main className="min-h-[calc(100vh-36px)] bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><div className="flex items-center gap-2 text-emerald-400"><Building2 size={18}/><span className="text-xs uppercase tracking-[0.2em]">Platform administration</span></div><h1 className="mt-2 text-2xl sm:text-3xl font-semibold">Factory control center</h1><p className="text-sm text-slate-400 mt-1">Portfolio performance, factory accounts, and production health.</p></div>
        <div className="flex gap-2"><button onClick={() => void (tab === 'overview' ? loadOverview() : loadTenants())} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"><RefreshCw size={15}/>Refresh</button><button onClick={onLogout} className="rounded-lg border border-slate-700 px-3 py-2 text-sm">Sign out</button></div>
      </header>
      <nav className="flex gap-2 border-b border-slate-800">
        <Tab active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</Tab>
        <Tab active={tab === 'factories'} onClick={() => setTab('factories')}>Factories <span className="ml-1 text-slate-500">{tenants.length}</span></Tab>
      </nav>
      {error && <div role="alert" className="rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">{error}</div>}
      {tab === 'overview' && <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div><h2 className="font-medium">Portfolio analytics</h2><p className="text-xs text-slate-400 mt-1">Production totals across active factories for the selected period.</p></div>
          <div className="flex gap-2"><label className="text-xs text-slate-400">From<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="block mt-1 rounded-md border border-slate-700 bg-slate-950 p-2 text-sm text-white"/></label><label className="text-xs text-slate-400">To<input type="date" value={to} min={from} max={getTodayString()} onChange={(e) => setTo(e.target.value)} className="block mt-1 rounded-md border border-slate-700 bg-slate-950 p-2 text-sm text-white"/></label></div>
        </div>
        {loading && !overview ? <div className="py-20 text-center text-slate-400">Loading portfolio analytics…</div> : <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <Metric icon={<Factory size={17}/>} label="Active factories" value={fmt(overview?.active_tenants)} note={fmt(overview?.inactive_tenants) + ' inactive'}/>
            <Metric icon={<Layers3 size={17}/>} label="Active looms" value={fmt(overview?.active_looms)} note={fmt(overview?.total_looms) + ' total registered'}/>
            <Metric icon={<Activity size={17}/>} label="Production" value={fmt(overview?.production)} note={'Shift A ' + fmt(overview?.shift_a) + ' · Shift B ' + fmt(overview?.shift_b)}/>
            <Metric icon={<Gauge size={17}/>} label="Meters produced" value={fmt(overview?.meters) + ' m'} note={fmt(overview?.recorded_days) + ' factory-days recorded'}/>
            <Metric icon={<Users size={17}/>} label="Active workers" value={fmt(overview?.total_workers)} note="Across active factories"/>
            <Metric icon={<Activity size={17}/>} label="Production value" value={money(overview?.revenue)} note="Sum of factory loom rates"/>
            <Metric icon={<Gauge size={17}/>} label="Average efficiency" value={fmt(overview?.average_efficiency) + '%'} note="Average on recorded production days"/>
            <Metric icon={<Building2 size={17}/>} label="Factory accounts" value={fmt(overview?.tenant_count)} note="Active and inactive"/>
          </div>
          <div className="grid xl:grid-cols-[1.6fr_1fr] gap-4">
            <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5"><div className="flex justify-between gap-3"><div><h2 className="font-semibold">Daily production trend</h2><p className="text-xs text-slate-400 mt-1">Combined production output by date</p></div><span className="text-xs text-slate-500">{from} – {to}</span></div>
              <div className="mt-6 flex h-48 items-end gap-1 border-b border-l border-slate-700 px-2">{points?.map((point) => <div key={point.date} title={point.date + ': ' + fmt(point.production) + ' production · ' + fmt(point.meters) + ' m'} className="group relative flex-1 min-w-[3px] h-full flex items-end"><div className="w-full rounded-t bg-emerald-500/80 group-hover:bg-emerald-300" style={{ height: Math.max(2, point.production / max * 100) + '%' }}/></div>)}</div>
              <div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>{points?.[0]?.date}</span><span>{points?.[Math.floor((points?.length || 1) / 2)]?.date}</span><span>{points?.at(-1)?.date}</span></div>
              {!overview?.trend.some((point) => point.production > 0) && <p className="text-xs text-slate-500 mt-3">No production recorded in this date range.</p>}
            </section>
            <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5"><h2 className="font-semibold">Factory performance</h2><p className="text-xs text-slate-400 mt-1">Ranked by meters for this period</p><div className="mt-4 space-y-3">{(overview?.factories || []).slice(0, 6).map((factory, index) => <button key={factory.id} onClick={() => onSelectFactory(factory.id)} disabled={!factory.is_active} className="w-full text-left disabled:cursor-not-allowed disabled:opacity-50"><div className="flex justify-between gap-2 text-sm"><span className="truncate"><span className="text-slate-500 mr-2">{index + 1}.</span>{factory.name}{!factory.is_active && <span className="ml-2 text-[10px] uppercase text-slate-500">Inactive</span>}</span><span className="text-emerald-300 whitespace-nowrap">{fmt(factory.meters)} m</span></div><div className="h-1.5 mt-1.5 rounded bg-slate-800 overflow-hidden"><div className="h-full rounded bg-emerald-500" style={{ width: Math.max(2, (factory.meters || 0) / Math.max(1, overview?.factories[0]?.meters || 1) * 100) + '%' }}/></div></button>)}{!overview?.factories.length && <p className="text-sm text-slate-500">No active factories yet.</p>}</div></section>
          </div>
          <div className="grid xl:grid-cols-2 gap-4">
            <Leaderboard title="Top looms" subtitle="By estimated meters in selected period" rows={overview?.top_looms || []} label={(row) => row.factory + ' · ' + row.loom} metric={(row) => fmt(row.meters) + ' m'}/>
            <Leaderboard title="Top worker earnings" subtitle="Wivar estimate from assigned production" rows={overview?.top_workers || []} label={(row) => row.worker + ' (' + row.code + ') · ' + row.factory} metric={(row) => money(row.wages)}/>
          </div>
        </>}</section>}
      {tab === 'factories' && <section className="space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-3"><div><h2 className="text-xl font-semibold">Factory accounts</h2><p className="text-sm text-slate-400">Create owners, maintain account details, and open a factory workspace.</p></div><button onClick={() => setShowCreate((value) => !value)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950"><Plus size={16}/>Add factory</button></div>
        {showCreate && <form onSubmit={createFactory} className="grid md:grid-cols-4 gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4"><label className="text-xs text-slate-400">Factory name<input required value={name} onChange={(e) => setName(e.target.value)} className="block mt-1 w-full rounded-md bg-slate-950 border border-slate-700 p-2.5 text-sm text-white"/></label><label className="text-xs text-slate-400">Owner email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="block mt-1 w-full rounded-md bg-slate-950 border border-slate-700 p-2.5 text-sm text-white"/></label><label className="text-xs text-slate-400">Temporary password (8+)<input type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="block mt-1 w-full rounded-md bg-slate-950 border border-slate-700 p-2.5 text-sm text-white"/></label><button className="self-end rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-slate-950">Create owner account</button></form>}
        <div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-500"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search factory or owner email" className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2.5 pl-9 pr-10 text-sm text-white"/>{search && <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-slate-500"><X size={16}/></button>}</div>
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/70"><table className="w-full min-w-[950px] text-sm"><thead className="bg-slate-900 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Factory / owner</th><th className="p-3">Status</th><th className="p-3 text-right">Looms</th><th className="p-3 text-right">Workers</th><th className="p-3 text-right">Period meters</th><th className="p-3 text-right">Period value</th><th className="p-3">Last activity</th><th className="p-3 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-800">{filtered.map((factory) => <tr key={factory.id} className="hover:bg-slate-800/40"><td className="p-3"><div className="font-medium text-white">{factory.name}</div><div className="text-xs text-slate-500">{factory.email}</div>{editing === factory.id && <form onSubmit={(event) => { event.preventDefault(); void updateFactory(factory.id, { name: editName, email: editEmail }); }} className="mt-2 flex flex-wrap gap-2"><input aria-label="Factory name" value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded bg-slate-950 border border-slate-700 px-2 py-1"/><input aria-label="Owner email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="rounded bg-slate-950 border border-slate-700 px-2 py-1"/><button className="text-emerald-300">Save</button><button type="button" onClick={() => setEditing(null)} className="text-slate-400">Cancel</button></form>}</td><td className="p-3"><span className={'rounded-full px-2 py-1 text-xs ' + (factory.is_active ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400')}>{factory.is_active ? 'Active' : 'Inactive'}</span></td><td className="p-3 text-right">{factory.active_loom_count ?? '—'}<span className="text-slate-500"> / {factory.loom_count ?? '—'}</span></td><td className="p-3 text-right">{factory.worker_count ?? '—'}</td><td className="p-3 text-right">{fmt(factory.meters)} m</td><td className="p-3 text-right">{money(factory.revenue)}</td><td className="p-3 text-xs text-slate-400">{factory.last_activity ? new Date(factory.last_activity).toLocaleDateString() : 'No entries'}</td><td className="p-3"><div className="flex justify-end gap-2"><button onClick={() => onSelectFactory(factory.id)} disabled={!factory.is_active} className="rounded-md bg-slate-700 px-2.5 py-1.5 text-xs disabled:opacity-40">Open</button><button onClick={() => { setEditing(editing === factory.id ? null : factory.id); setEditName(factory.name); setEditEmail(factory.email); }} className="rounded-md border border-slate-700 px-2.5 py-1.5 text-xs">Edit</button><button onClick={() => void updateFactory(factory.id, { is_active: !factory.is_active })} className="rounded-md border border-slate-700 px-2.5 py-1.5 text-xs">{factory.is_active ? 'Suspend' : 'Activate'}</button></div></td></tr>)}
          {!filtered.length && <tr><td colSpan={8} className="p-8 text-center text-slate-500">No factories match this search.</td></tr>}</tbody></table></div>
      </section>}
    </div>
  </main>;
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className={'px-4 py-3 text-sm border-b-2 ' + (active ? 'border-emerald-400 text-white' : 'border-transparent text-slate-400')}>{children}</button>;
}
function Metric({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><div className="flex justify-between text-slate-400"><span className="text-xs">{label}</span>{icon}</div><div className="mt-3 text-2xl font-semibold text-white">{value}</div><div className="mt-1 text-xs text-slate-500 truncate">{note}</div></div>;
}
function Leaderboard({ title, subtitle, rows, label, metric }: { title: string; subtitle: string; rows: Leader[]; label: (row: Leader) => string; metric: (row: Leader) => string }) {
  return <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5"><h2 className="font-semibold">{title}</h2><p className="text-xs text-slate-400 mt-1">{subtitle}</p><div className="mt-4 divide-y divide-slate-800">{rows.map((row, i) => <div key={label(row) + i} className="flex justify-between gap-3 py-2.5 text-sm"><span className="truncate text-slate-300"><span className="mr-2 text-slate-600">{i + 1}.</span>{label(row)}</span><span className="whitespace-nowrap text-emerald-300">{metric(row)}</span></div>)}{!rows.length && <p className="py-4 text-sm text-slate-500">No activity for this period.</p>}</div></section>;
}
