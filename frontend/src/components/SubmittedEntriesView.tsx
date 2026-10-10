import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Download,
  Filter,
  Loader2,
  Search,
  Table,
} from 'lucide-react';
import { api } from '../api/client';
import { SubmittedEntry } from '../types';
import { onSync } from '../utils/sync';

// Machine ids are stored as strings like "MC-04" — extract the numeric part
// so display / sort / filter never produce NaN.
const machineNum = (m: unknown): number => {
  const n = parseInt(String(m ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : NaN;
};

const formatMachineLabel = (m: unknown): string => {
  const n = machineNum(m);
  return Number.isFinite(n) ? `#${n.toString().padStart(2, '0')}` : String(m ?? '—');
};

interface SubmittedEntriesViewProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  onRefreshData?: () => void;
  refreshTrigger?: number;
}

export const SubmittedEntriesView: React.FC<SubmittedEntriesViewProps> = ({
  currentDate,
  onDateChange,
  onRefreshData,
  refreshTrigger,
}) => {
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const loadingRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [entries, setEntries] = useState<SubmittedEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [machineFilter, setMachineFilter] = useState<string>('all');

  const loadData = async () => {
    // Single-flight guard: StrictMode / refreshTrigger double-invokes
    // used to fire overlapping fetches that flickered the whole table.
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setErrorMessage(null);
    try {
      const allEntries = await api.getEntries();
      setEntries(allEntries);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to load entries');
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setHasLoaded(true);
    }
  };

  // Single effect covers mount + parent refreshTrigger bumps.
  // (Previously two effects both fired on mount = double fetch + blink.)
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);
  useEffect(() => onSync((msg) => {
    if (msg.type === 'entries') void loadData();
  }), []);

  const processedEntries = useMemo(() => {
    const grouped = new Map<string, SubmittedEntry[]>();

    entries.forEach((entry) => {
      const key = entry.machineNumber;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(entry);
    });

    const result: (SubmittedEntry & { endDate: string | null; status: 'Running' | 'Ideal' })[] = [];

    grouped.forEach((machineEntries) => {
      const sorted = [...machineEntries].sort((a, b) =>
        new Date(a.startedDate).getTime() - new Date(b.startedDate).getTime()
      );

      sorted.forEach((entry, index) => {
        const endDate = index < sorted.length - 1 ? sorted[index + 1].startedDate : null;
        result.push({
          ...entry,
          endDate,
          status: 'Running',
        });
      });
    });

    return result.sort((a, b) =>
      new Date(b.startedDate).getTime() - new Date(a.startedDate).getTime()
    );
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return processedEntries.filter((entry) => {
      const matchMachine = machineFilter === 'all' || entry.machineNumber === machineFilter;
      const matchSearch = searchTerm === '' ||
        entry.machineNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.productionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.flangeNumber.toLowerCase().includes(searchTerm.toLowerCase());
      return matchMachine && matchSearch;
    });
  }, [processedEntries, machineFilter, searchTerm]);

  const machineNumbers = useMemo(() => {
    const nums = new Set<string>();
    entries.forEach((e) => nums.add(e.machineNumber));
    return Array.from(nums).sort((a, b) => {
      const na = machineNum(a);
      const nb = machineNum(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }, [entries]);

  const handleExport = () => {
    const headers = [
      'Machine #',
      'Start Date',
      'End Date (Auto)',
      'Production #',
      'Sort #',
      'Flange #',
      'Batch #',
      'Beam Meter',
      'Beam Net Weight',
      'GLM',
      'Status',
      'Submitted At',
    ];

    const rows = filteredEntries.map((e) => [
      e.machineNumber,
      e.startedDate,
      e.endDate || '—',
      e.productionNumber,
      e.sortNumber,
      e.flangeNumber,
      e.batchNumber,
      e.beamMeter.toString(),
      e.beamNetWeight.toString(),
      e.glm.toFixed(4),
      e.status,
      e.submittedAt,
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `submitted-entries-${currentDate}.csv`;
    link.click();
  };

  if (loading && !hasLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Submitted Entries</h2>
          <p className="text-slate-400 text-sm">All first entries with auto-calculated end dates</p>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              Refreshing…
            </span>
          )}
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search machine, production, batch, flange..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="relative flex-1 max-w-xs">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <select
              value={machineFilter}
              onChange={(e) => setMachineFilter(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-8 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 appearance-none"
            >
              <option value="all">All Machines</option>
              {machineNumbers.map((num) => (
                <option key={num} value={num}>
                  Machine {formatMachineLabel(num)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-red-950/50 border border-red-800/80 rounded-lg p-3 text-xs text-red-300 flex items-center space-x-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] text-xs text-left">
            <thead className="text-[11px] uppercase bg-slate-800/90 text-slate-400 font-semibold border-b border-slate-700">
              <tr>
                <th className="py-3 px-3 whitespace-nowrap">Machine #</th>
                <th className="py-3 px-3 whitespace-nowrap">Start Date</th>
                <th className="py-3 px-3 whitespace-nowrap">End Date (Auto)</th>
                <th className="py-3 px-3">Production #</th>
                <th className="py-3 px-2">Sort #</th>
                <th className="py-3 px-2">Flange #</th>
                <th className="py-3 px-2">Batch #</th>
                <th className="py-3 px-2 text-right">Beam Meter</th>
                <th className="py-3 px-2 text-right">Beam Net Wt</th>
                <th className="py-3 px-2 text-right">GLM</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 whitespace-nowrap">Submitted At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-500">
                    No entries found
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-semibold text-white">
                      <span className="font-mono text-emerald-400">{formatMachineLabel(entry.machineNumber)}</span>
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-300 whitespace-nowrap">{entry.startedDate || '—'}</td>
                    <td className="py-2 px-3 font-mono text-slate-300 whitespace-nowrap">
                      {entry.endDate ? (
                        <span className="text-amber-300">{entry.endDate}</span>
                      ) : (
                        <span className="text-slate-500">— (Latest)</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-300">{entry.productionNumber || '—'}</td>
                    <td className="py-2 px-2 font-mono text-slate-400">{entry.sortNumber || '—'}</td>
                    <td className="py-2 px-2 font-mono text-slate-400">{entry.flangeNumber || '—'}</td>
                    <td className="py-2 px-2 font-mono text-slate-400">{entry.batchNumber || '—'}</td>
                    <td className="py-2 px-2 text-right font-mono text-slate-300">{entry.beamMeter.toFixed(1)}m</td>
                    <td className="py-2 px-2 text-right font-mono text-slate-300">{entry.beamNetWeight.toFixed(2)}kg</td>
                    <td className="py-2 px-2 text-right font-mono text-teal-400">{entry.glm.toFixed(2)}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                        entry.status === 'Running'
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                          : 'bg-amber-950/80 text-amber-300 border border-amber-800'
                      }`}>
                        {entry.status === 'Running' ? (
                          <>
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Running
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Ideal
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-400 whitespace-nowrap">
                      {(() => {
                        const d = new Date(entry.submittedAt);
                        return `${d.toLocaleString('default', { month: 'short' })} ${String(d.getDate()).padStart(2, '0')}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredEntries.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-800 text-sm text-slate-400">
            Showing {filteredEntries.length} of {processedEntries.length} entries
          </div>
        )}
      </div>
    </div>
  );
};
