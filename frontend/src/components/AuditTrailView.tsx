import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Download,
  History,
  Loader2,
  RotateCcw,
  Search,
  Shield,
  User,
} from 'lucide-react';
import { api } from '../api/client';
import { AuditLog } from '../types';
import { onSync } from '../utils/sync';

export const AuditTrailView: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');

  const loadLogs = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await api.getAuditLogs();
      setLogs(data);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);
  useEffect(() => onSync(() => { void loadLogs(); }), []);

  const actions = useMemo(() => {
    const s = new Set<string>();
    logs.forEach((l) => l.action && s.add(l.action));
    return Array.from(s).sort();
  }, [logs]);

  const entities = useMemo(() => {
    const s = new Set<string>();
    logs.forEach((l) => l.entity_type && s.add(l.entity_type));
    return Array.from(s).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    return logs
      .filter((l) => {
        const matchAction = actionFilter === 'all' || l.action === actionFilter;
        const matchEntity = entityFilter === 'all' || l.entity_type === entityFilter;
        const q = searchTerm.trim().toLowerCase();
        const matchSearch =
          q === '' ||
          l.user_name?.toLowerCase().includes(q) ||
          l.user_email?.toLowerCase().includes(q) ||
          l.action?.toLowerCase().includes(q) ||
          l.entity_type?.toLowerCase().includes(q) ||
          l.entity_id?.toLowerCase().includes(q) ||
          l.details?.toLowerCase().includes(q);
        return matchAction && matchEntity && matchSearch;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [logs, actionFilter, entityFilter, searchTerm]);

  const uniqueUsers = useMemo(() => {
    const s = new Set<string>();
    logs.forEach((l) => l.user_email && s.add(l.user_email));
    return s.size;
  }, [logs]);

  const handleExport = () => {
    const headers = ['Timestamp', 'User Name', 'User Email', 'Action', 'Entity Type', 'Entity ID', 'Details'];
    const rows = filtered.map((l) => [
      l.timestamp,
      l.user_name,
      l.user_email,
      l.action,
      l.entity_type,
      l.entity_id || '',
      (l.details || '').replace(/"/g, '""'),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header - distinct from Reports */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Audit Trail</h2>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-amber-950 text-amber-300 border border-amber-800">
              SECURITY
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Immutable record of who changed what and when — logins, production saves, locks, master edits.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadLogs}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 border border-slate-700 rounded-lg transition-colors"
            title="Refresh audit logs"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3 py-2 rounded-lg border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 block">Total Events</span>
          <div className="text-lg font-bold font-mono text-white mt-1">{logs.length}</div>
          <span className="text-[10px] text-slate-400">All time logged</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 block">Unique Users</span>
          <div className="text-lg font-bold font-mono text-white mt-1">{uniqueUsers}</div>
          <span className="text-[10px] text-slate-400">Distinct actors</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 block">Showing</span>
          <div className="text-lg font-bold font-mono text-emerald-400 mt-1">{filtered.length}</div>
          <span className="text-[10px] text-slate-400">After filters</span>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-red-950/50 border border-red-800/80 rounded-lg p-3 text-xs text-red-300 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Filters + Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search user, action, entity, details..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Entities</option>
            {entities.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-[11px] uppercase bg-slate-800 text-slate-400 font-semibold border-b border-slate-700">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Actor / User</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">Entity</th>
                <th className="py-2.5 px-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    <History className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                    No audit events found
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2 px-3 font-medium text-white">
                      <span className="flex items-center gap-1.5">
                        <User className="w-3 h-3 text-slate-500" />
                        {log.user_name}
                      </span>
                      <span className="block text-[10px] text-slate-400 font-mono ml-4">{log.user_email}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="bg-slate-800 text-amber-300 border border-amber-800/60 px-2 py-0.5 rounded font-mono text-[10px] whitespace-nowrap">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {log.entity_type} {log.entity_id ? `(${log.entity_id.slice(0, 8)})` : ''}
                    </td>
                    <td className="py-2 px-3 text-slate-300 max-w-md break-words">{log.details || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
