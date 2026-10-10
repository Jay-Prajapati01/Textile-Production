import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  Check,
  CheckCircle,
  Download,
  Filter,
  Layers,
  Lock,
  RotateCcw,
  Save,
  Unlock,
  UserPlus,
  Wand2,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { cancelNavigation, proceedNavigation, requestNavigation, setNavBlocker } from '../utils/navGuard';
import { onSync, postSync } from '../utils/sync';
import { ModernCalendar } from './ModernCalendar';
import { CalculatedLoomRow, DailySummary, NumberLine, ProductionSettings, SubmittedEntry } from '../types';

// Machine ids are stored as strings like "MC-04" — Number("MC-04") is NaN,
// so extract the numeric part when matching entries to looms.
const machineNum = (m: unknown): number => {
  const n = parseInt(String(m ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : NaN;
};

type EditMap = Record<string, { shift_a: string | number; shift_b: string | number }>;

// Deterministic snapshot of local edits for dirty-checking against the last
// saved/loaded baseline (sorts keys so order never causes false positives).
const serializeEdits = (edits: EditMap): string =>
  JSON.stringify(
    Object.keys(edits)
      .sort()
      .map((k) => [k, Number(edits[k]?.shift_a) || 0, Number(edits[k]?.shift_b) || 0])
  );

interface DailyProductionViewProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  onExportClick: () => void;
  onRefreshData?: () => void;
  refreshTrigger?: number;
  onGoToEntry?: () => void;
  onGoToWorker?: () => void;
}

export const DailyProductionView: React.FC<DailyProductionViewProps> = ({
  currentDate,
  onDateChange,
  onExportClick,
  onRefreshData,
  refreshTrigger,
  onGoToEntry,
  onGoToWorker,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Single-flight + timer refs: stop overlapping reloads and stacked
  // success-timeouts (an old timer clearing a fresh "Saved" banner early
  // is what made success messages flash/disappear instantly).
  const loadingRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashSaved = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveSuccess(true);
    saveTimer.current = setTimeout(() => setSaveSuccess(false), 3000);
  };

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [settings, setSettings] = useState<ProductionSettings | null>(null);
  const [numberLines, setNumberLines] = useState<NumberLine[]>([]);
  const [firstEntries, setFirstEntries] = useState<SubmittedEntry[]>([]);

  // Local state for edits
  const [editValues, setEditValues] = useState<EditMap>({});
  const [baseline, setBaseline] = useState<string>(() => serializeEdits({}));
  const [leaveModal, setLeaveModal] = useState(false);
  const [selectedLineFilter, setSelectedLineFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  // "Workers not assigned" nudge — dismissed per date so it appears immediately
  // on load but never nags twice for the same date.
  const [assignNudgeDismissedFor, setAssignNudgeDismissedFor] = useState<string | null>(null);

  const dirty = useMemo(
    () => serializeEdits(editValues) !== baseline,
    [editValues, baseline]
  );
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Beam threshold alerts (carry-forward balance)
  const [alertDismissed, setAlertDismissed] = useState<Record<string, boolean>>({});
  const [activeAlert, setActiveAlert] = useState<{
    loomId: string;
    loomNumber: number;
    batchNumber: string | null;
    level: 0 | 50 | 100;
    remaining: number;
  } | null>(null);

  const isLocked = dailySummary?.status === 'locked';

  // Load data for current date
  const loadData = async (date: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setErrorMessage(null);
    try {
      const [summary, st, lines, entries] = await Promise.all([
        api.getDailySummary(date),
        api.getSettings(),
        api.getNumberLines(),
        api.getEntries(),
      ]);
      setDailySummary(summary);
      setSettings(st);
      setNumberLines(lines);
      // Active entries for this date (entry window covers the date)
      const dayEntries = entries.filter(
        (e) =>
          String(e.startedDate) <= date &&
          (!e.finishedDate || String(e.finishedDate) >= date)
      );
      setFirstEntries(dayEntries);
      setActiveAlert(null);

      // Populate local edits
      const edits: EditMap = {};
      summary.rows.forEach((r) => {
        edits[r.loom_id] = {
          shift_a: r.shift_a || 0,
          shift_b: r.shift_b || 0,
        };
      });
      setEditValues(edits);
      setBaseline(serializeEdits(edits));
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to load daily production');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  // Single effect for date changes AND parent refresh bumps.
  // (Previously two effects both fired on every date change = double fetch.)
  useEffect(() => {
    loadData(currentDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, refreshTrigger]);

  // Real-time: worker saves, loom active/inactive toggles, new looms, beam
  // entries (same tab via parent bumps, other tabs via broadcast) refresh this
  // view instantly — but never while unsaved local edits exist.
  useEffect(() => {
    return onSync((msg) => {
      if (msg.type === 'edits') return;
      if (msg.type === 'saved' && msg.date !== currentDate) return;
      if (loadingRef.current || dirtyRef.current) return;
      loadData(currentDate);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  // Handle input change
  const handleInputChange = (loomId: string, shift: 'shift_a' | 'shift_b', val: string) => {
    if (isLocked) return;
    // Inactive looms never accept readings, even programmatically.
    if (dailySummary?.rows.find((r) => r.loom_id === loomId)?.is_active === false) return;
    const num = val === '' ? '' : Math.max(0, Number(val));
    setEditValues((prev) => ({
      ...prev,
      [loomId]: {
        ...prev[loomId],
        [shift]: num,
      },
    }));
  };

  // Quick fill sample data for fast testing/evaluation
  // (inactive looms are skipped — they take no readings).
  const handleAutoFillSample = () => {
    if (isLocked) return;
    if (!dailySummary) return;

    const newEdits: EditMap = { ...editValues };
    let sampleIdx = 0;
    dailySummary.rows.forEach((r) => {
      if (r.is_active === false) return; // keep its stored readings untouched
      const base = 48 + ((sampleIdx * 3) % 18);
      sampleIdx++;
      newEdits[r.loom_id] = {
        shift_a: base,
        shift_b: base + 2,
      };
    });
    setEditValues(newEdits);
  };

  // Save changes to backend
  const handleSave = async (complete: boolean = false): Promise<boolean> => {
    if (!dailySummary) return false;
    setSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const productions = Object.entries(editValues).map(([loom_id, val]) => ({
        loom_id,
        shift_a: Number(val.shift_a) || 0,
        shift_b: Number(val.shift_b) || 0,
      }));

      const updated = await api.saveDailyProduction(currentDate, productions);
      let finalSummary = updated;

      if (complete && updated.day_id) {
        finalSummary = await api.completeProductionDay(updated.day_id);
      }

      // Re-sync local edits to the server truth and reset the dirty baseline.
      const savedEdits: EditMap = {};
      finalSummary.rows.forEach((r) => {
        savedEdits[r.loom_id] = {
          shift_a: r.shift_a || 0,
          shift_b: r.shift_b || 0,
        };
      });
      setEditValues(savedEdits);
      setBaseline(serializeEdits(savedEdits));
      setDailySummary(finalSummary);
      flashSaved();
      if (onRefreshData) onRefreshData();
      return true;
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save production data');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Block tab/date navigation (and discarding reloads) while edits are unsaved.
  useEffect(() => {
    setNavBlocker(() => {
      if (!dirtyRef.current) return false;
      setLeaveModal(true);
      return true;
    });
    return () => setNavBlocker(null);
  }, []);

  // Browser refresh/close warning while dirty.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Debounced cross-tab broadcast of live edits (Worker-Wivar overlays these).
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
      syncTimer.current = null;
    }
    if (!dirty || !dailySummary) return;
    syncTimer.current = setTimeout(() => {
      const rows = dailySummary.rows.map((r) => ({
        loom_id: r.loom_id,
        shift_a: Number(editValues[r.loom_id]?.shift_a) || 0,
        shift_b: Number(editValues[r.loom_id]?.shift_b) || 0,
      }));
      postSync({ type: 'edits', date: currentDate, rows });
    }, 400);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [dirty, editValues, currentDate, dailySummary]);

  const handleLeaveSave = async () => {
    const ok = await handleSave(false);
    if (ok) {
      setLeaveModal(false);
      proceedNavigation();
    }
  };

  const handleLeaveDiscard = () => {
    setLeaveModal(false);
    proceedNavigation();
  };

  const handleLeaveStay = () => {
    setLeaveModal(false);
    cancelNavigation();
  };

  // Lock or unlock day
  const handleToggleLock = async () => {
    if (!dailySummary || !dailySummary.day_id) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      let updated: DailySummary;
      if (isLocked) {
        updated = await api.unlockProductionDay(dailySummary.day_id);
      } else {
        updated = await api.lockProductionDay(dailySummary.day_id);
      }
      setDailySummary(updated);
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to toggle lock status');
    } finally {
      setSaving(false);
    }
  };

  // Real-time client preview calculations based on local edits
  const calculatedRows = useMemo(() => {
    if (!dailySummary) return [];
    const divisor = settings?.average_divisor || 76;
    const maxProd = settings?.maximum_production || 152;
    const factor = settings?.meter_conversion_factor || 25.4;

    return dailySummary.rows.map((row) => {
      const edit = editValues[row.loom_id];
      const shift_a = edit !== undefined ? Number(edit.shift_a) || 0 : row.shift_a;
      const shift_b = edit !== undefined ? Number(edit.shift_b) || 0 : row.shift_b;
      const total = Math.round((shift_a + shift_b) * 100) / 100;
      const average = divisor > 0 ? Math.round((total / divisor) * 1000) / 1000 : 0;
      const percentage = maxProd > 0 ? Math.round(((average * 100) / maxProd) * 100) / 100 : 0;
      const meter =
        row.specification > 0
          ? Math.round(((total * factor) / row.specification) * 100) / 100
          : 0;
      const rs = Math.round(meter * row.rate * 100) / 100;
      const opening = row.opening_meter ?? 0;
      const remaining_meter =
        row.beam_meter !== null && row.beam_meter !== undefined
          ? Math.round((row.beam_meter - opening - meter) * 100) / 100
          : null;

      // Find matching first entry for this loom by machine number
      // (machineNumber is "MC-04" style — compare numeric parts, never Number())
      const matchingEntry = firstEntries.find(
        (e) => machineNum(e.machineNumber) === row.loom_number
      );

      return {
        ...row,
        shift_a,
        shift_b,
        total,
        average,
        percentage,
        meter,
        rs,
        opening_meter: row.beam_meter !== null && row.beam_meter !== undefined ? opening : null,
        cumulative_meter:
          row.beam_meter !== null && row.beam_meter !== undefined
            ? Math.round((opening + meter) * 100) / 100
            : null,
        remaining_meter,
        batch_number: matchingEntry?.batchNumber ?? row.batch_number ?? null,
        beam_meter: matchingEntry?.beamMeter ?? row.beam_meter ?? null,
      };
    });
  }, [dailySummary, editValues, settings, firstEntries]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return calculatedRows.filter((r) => {
      const matchLine =
        selectedLineFilter === 'all' || r.number_line_id === selectedLineFilter;
      const matchSearch =
        searchTerm === '' ||
        r.loom_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.loom_number.toString().includes(searchTerm) ||
        r.number_line_name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchLine && matchSearch;
    });
  }, [calculatedRows, selectedLineFilter, searchTerm]);

  // Active looms still waiting for a worker on either shift — drives the
  // "assign workers" nudge popup (inactive looms never need assignment).
  const unassignedActive = useMemo(() => {
    if (!dailySummary) return [];
    return dailySummary.rows.filter(
      (r) =>
        r.is_active !== false &&
        !r.shift_a_worker_name &&
        !r.shift_b_worker_name &&
        !r.worker_name
    );
  }, [dailySummary]);

  const showAssignNudge =
    !loading &&
    !isLocked &&
    unassignedActive.length > 0 &&
    assignNudgeDismissedFor !== currentDate;

  // Grand Totals based on current calculated rows
  const liveTotals = useMemo(() => {
    const s_a = calculatedRows.reduce((acc, r) => acc + r.shift_a, 0);
    const s_b = calculatedRows.reduce((acc, r) => acc + r.shift_b, 0);
    const tot = s_a + s_b;
    const divisor = settings?.average_divisor || 76;
    const maxProd = settings?.maximum_production || 152;
    const avg = divisor > 0 ? tot / divisor : 0;
    const pct = maxProd > 0 ? (avg * 100) / maxProd : 0;
    const mtr = calculatedRows.reduce((acc, r) => acc + r.meter, 0);
    const rev = calculatedRows.reduce((acc, r) => acc + r.rs, 0);
    const remainders = calculatedRows.filter((r) => r.remaining_meter !== null);
    const rem = remainders.reduce((acc, r) => acc + (r.remaining_meter ?? 0), 0);
    const openings = calculatedRows.filter((r) => r.opening_meter !== null);
    const opn = openings.reduce((acc, r) => acc + (r.opening_meter ?? 0), 0);

    return {
      shift_a: Math.round(s_a * 100) / 100,
      shift_b: Math.round(s_b * 100) / 100,
      total: Math.round(tot * 100) / 100,
      average: Math.round(avg * 1000) / 1000,
      percentage: Math.round(pct * 100) / 100,
      meter: Math.round(mtr * 100) / 100,
      rs: Math.round(rev * 100) / 100,
      opening: openings.length > 0 ? Math.round(opn * 100) / 100 : null,
      remaining: remainders.length > 0 ? Math.round(rem * 100) / 100 : null,
    };
  }, [calculatedRows, settings]);

  // 3-stage beam alerts: worst level first (0 -> 50 -> 100), one popup at a time.
  // Inactive looms are fully skipped — a deactivated loom must never pop up.
  useEffect(() => {
    if (activeAlert) return;
    const levels: (0 | 50 | 100)[] = [0, 50, 100];
    for (const level of levels) {
      const candidate = calculatedRows
        .filter(
          (r) =>
            r.is_active !== false &&
            r.remaining_meter !== null &&
            (level === 0 ? r.remaining_meter <= 0 : r.remaining_meter < level) &&
            !alertDismissed[`${currentDate}:${r.loom_id}:${level}`]
        )
        .sort((a, b) => a.loom_number - b.loom_number)[0];
      if (candidate) {
        setActiveAlert({
          loomId: candidate.loom_id,
          loomNumber: candidate.loom_number,
          batchNumber: candidate.batch_number,
          level,
          remaining: candidate.remaining_meter ?? 0,
        });
        return;
      }
    }
  }, [calculatedRows, activeAlert, alertDismissed, currentDate]);

  const dismissAlert = () => {
    if (!activeAlert) return;
    const { loomId, level } = activeAlert;
    setAlertDismissed((prev) => {
      const next = { ...prev };
      // Dismissing this level also silences all milder levels (100 > 50 > 0 severity)
      (['0', '50', '100'] as const).forEach((l) => {
        if (Number(l) >= level) next[`${currentDate}:${loomId}:${l}`] = true;
      });
      return next;
    });
    setActiveAlert(null);
  };

  // Group by Number Line for subtotal display
  const lineGroups = useMemo(() => {
    const groups: { [key: string]: { name: string; rows: CalculatedLoomRow[] } } = {};
    filteredRows.forEach((r) => {
      if (!groups[r.number_line_name]) {
        groups[r.number_line_name] = { name: r.number_line_name, rows: [] };
      }
      groups[r.number_line_name].rows.push(r);
    });
    return groups;
  }, [filteredRows]);

  return (
    <div className="space-y-5">
      {/* Top Controls Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Date & Status */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
              Production Date
            </label>
            <ModernCalendar
              value={currentDate}
              onChange={onDateChange}
              triggerClassName="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-600"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
              Day Status
            </label>
            <div className="flex items-center space-x-1.5">
              <span
                className={`text-xs px-2.5 py-1 rounded-md border font-medium uppercase tracking-wider flex items-center ${
                  isLocked
                    ? 'bg-amber-950/80 border-amber-800 text-amber-300'
                    : dailySummary?.status === 'completed'
                    ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                    : 'bg-blue-950/80 border-blue-800 text-blue-300'
                }`}
              >
                {isLocked && <Lock className="w-3 h-3 mr-1" />}
                {dailySummary?.status || 'Draft'}
              </span>
              {dirty && !isLocked && (
                <span className="text-xs px-2.5 py-1 rounded-md border font-medium uppercase tracking-wider flex items-center bg-amber-950/80 border-amber-800 text-amber-300">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Unsaved Changes
                </span>
              )}
            </div>
          </div>

          {/* Number Line Filter */}
          <div>
            <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
              Number Line
            </label>
            <div className="flex items-center space-x-1">
              <Filter className="w-3.5 h-3.5 text-slate-400 ml-1" />
              <select
                value={selectedLineFilter}
                onChange={(e) => setSelectedLineFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">
                  All Lines{dailySummary ? ` (${dailySummary.total_looms} Looms)` : ''}
                </option>
                {numberLines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Autofill sample button */}
          <button
            onClick={handleAutoFillSample}
            disabled={isLocked}
            className="flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
            title="Auto-fill sample production shifts for testing"
          >
            <Wand2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Sample Values</span>
          </button>

          {/* Reload */}
          <button
            onClick={() => requestNavigation(() => loadData(currentDate))}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 border border-slate-700 rounded-lg transition-colors"
            title="Reload from database"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Export Excel */}
          <button
            onClick={onExportClick}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export Book1</span>
          </button>

          {/* Lock / Unlock */}
          {dailySummary?.day_id && (
            <button
              onClick={handleToggleLock}
              disabled={saving}
              className={`flex items-center space-x-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                isLocked
                  ? 'bg-amber-950/70 border-amber-800 text-amber-300 hover:bg-amber-900/60'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isLocked ? (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Unlock Day</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Lock Day</span>
                </>
              )}
            </button>
          )}

          {/* Save Draft */}
          <button
            onClick={() => handleSave(false)}
            disabled={saving || isLocked}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 text-xs font-medium px-3.5 py-1.5 rounded-lg border border-slate-700 transition-colors shadow-sm"
          >
            <Save className="w-3.5 h-3.5 text-sky-400" />
            <span>Save Draft</span>
          </button>

          {/* Complete Production Day */}
          <button
            onClick={() => handleSave(true)}
            disabled={saving || isLocked}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Complete Day</span>
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {errorMessage && (
        <div className="bg-red-950/50 border border-red-800/80 rounded-lg p-3 text-xs text-red-300 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}
      {saveSuccess && (
        <div className="fixed top-20 right-4 z-50 max-w-xs pointer-events-none">
          <div className="bg-emerald-950/95 border border-emerald-800/80 rounded-lg p-3 text-xs text-emerald-300 flex items-center space-x-2 shadow-lg backdrop-blur">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>Daily production verified and saved to database successfully! Derived calculations recalculated server-side.</span>
          </div>
        </div>
      )}
      {isLocked && (
        <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-3 text-xs text-amber-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Lock className="w-4 h-4 text-amber-400" />
            <span>
              This production day is <strong>LOCKED</strong>. Inputs are read-only to preserve historical financial integrity.
              You can unlock this day using the Unlock button.
            </span>
          </div>
        </div>
      )}

      {/* Visual Input vs Auto Legend */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg px-4 py-2 flex flex-wrap items-center justify-between text-xs text-slate-400">
        <div className="flex items-center space-x-4">
          <span className="font-semibold text-slate-300 flex items-center">
            <Calculator className="w-3.5 h-3.5 mr-1 text-emerald-400" />
            Rule Legend:
          </span>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 bg-slate-800 border border-emerald-500 rounded" />
            <span className="text-slate-300 font-medium">INPUT: Shift A & Shift B</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 bg-slate-800/60 border border-slate-700 rounded" />
            <span className="text-slate-400">AUTO: Total, Average, %, Meter, Rs</span>
          </div>
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          Average Divisor: <span className="text-amber-400 font-bold">{settings?.average_divisor || 76}</span> • Max Prod: <span className="text-purple-400 font-bold">{settings?.maximum_production || 152}</span>
        </div>
      </div>

      {/* Main Production Entry Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-[11px] uppercase bg-slate-800/90 text-slate-400 font-semibold border-b border-slate-700">
              <tr>
                <th className="py-3 px-3">Loom</th>
                <th className="py-3 px-2">Line</th>
                <th className="py-3 px-2 text-right">Spec (Picks)</th>
                <th className="py-3 px-2 text-right">Rate (Rs)</th>
                <th className="py-3 px-2 text-center">Batch Number</th>
                <th className="py-3 px-2 text-right">Beam Meter</th>
                <th className="py-3 px-2 text-center bg-emerald-950/30 text-emerald-400 border-x border-emerald-900/40">
                  Shift A (INPUT)
                </th>
                <th className="py-3 px-2 text-center bg-emerald-950/30 text-emerald-400 border-r border-emerald-900/40">
                  Shift B (INPUT)
                </th>
                <th className="py-3 px-2 text-right bg-slate-800 text-slate-300 font-bold">
                  Total (AUTO)
                </th>
                <th className="py-3 px-2 text-right">Average</th>
                <th className="py-3 px-2 text-right">Efficiency %</th>
                <th className="py-3 px-2 text-right text-teal-400">Meter (AUTO)</th>
                <th className="py-3 px-2 text-right">Opening (m)</th>
                <th className="py-3 px-2 text-right">Remaining</th>
                <th className="py-3 px-3 text-right text-emerald-400 font-bold">Rs/Day (AUTO)</th>
                <th className="py-3 px-3">Worker Assignment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {Object.entries(lineGroups).map(([lineName, group]) => {
                const lineShiftA = group.rows.reduce((sum, r) => sum + r.shift_a, 0);
                const lineShiftB = group.rows.reduce((sum, r) => sum + r.shift_b, 0);
                const lineTotal = lineShiftA + lineShiftB;
                const lineMeter = group.rows.reduce((sum, r) => sum + r.meter, 0);
                const lineRs = group.rows.reduce((sum, r) => sum + r.rs, 0);
                const lineRemainders = group.rows.filter((r) => r.remaining_meter !== null);
                const lineRemaining = lineRemainders.reduce(
                  (sum, r) => sum + (r.remaining_meter ?? 0),
                  0
                );
                const lineOpenings = group.rows.filter((r) => r.opening_meter !== null);
                const lineOpening = lineOpenings.reduce(
                  (sum, r) => sum + (r.opening_meter ?? 0),
                  0
                );

                return (
                  <React.Fragment key={lineName}>
                    {/* Number Line Header Banner */}
                    <tr className="bg-slate-850 bg-slate-800/40 font-semibold text-slate-300 text-[11px]">
                      <td colSpan={16} className="py-2 px-3 border-y border-slate-700/60">
                        <div className="flex items-center space-x-2">
                          <Layers className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-white">{lineName}</span>
                          <span className="text-slate-400 font-normal">
                            ({group.rows.length} looms)
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Loom Rows */}
                    {group.rows.map((row) => {
                      const edit = editValues[row.loom_id] || { shift_a: 0, shift_b: 0 };
                      const exhausted =
                        row.remaining_meter !== null && row.remaining_meter <= 0;
                      // Inactive looms stay visible but greyed — readings locked.
                      const inactive = row.is_active === false;
                      const inputDisabled = isLocked || exhausted || inactive;
                      const inputTitle = inactive
                        ? 'This loom is inactive — enable it in Master Setup to enter readings'
                        : exhausted
                        ? 'Beam finished — new folding required before entering readings'
                        : undefined;
                      const shiftInputCls = inputDisabled
                        ? 'bg-slate-800 text-slate-400 border-slate-700 cursor-not-allowed'
                        : exhausted
                        ? 'bg-slate-850 text-red-300 border-red-800 hover:border-red-500 focus:border-red-400 focus:ring-1 focus:ring-red-400 focus:outline-none'
                        : 'bg-slate-850 text-white border-slate-700 hover:border-emerald-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 focus:outline-none';

                      return (
                        <tr
                          key={row.loom_id}
                          title={inactive ? 'Inactive loom — readings locked (enable in Master Setup)' : undefined}
                          className={`hover:bg-slate-800/40 transition-colors group ${
                            inactive ? 'opacity-55 bg-slate-900/50' : ''
                          }`}
                        >
                          <td className="py-2 px-3 font-semibold text-white">
                            <span className="font-mono text-emerald-400">
                              #{row.loom_number.toString().padStart(2, '0')}
                            </span>{' '}
                            <span className="text-slate-300 ml-1">{row.loom_name}</span>
                            {inactive && (
                              <span
                                title="This loom is inactive — enable it in Master Setup to enter readings"
                                className="ml-2 text-[9px] uppercase font-bold text-slate-400 border border-slate-600 rounded px-1 py-0.5"
                              >
                                Inactive
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-slate-400">{row.number_line_name.split(' ')[0]}</td>
                          <td className="py-2 px-2 text-right font-mono text-slate-300">
                            {row.specification}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-slate-300">
                            ₹{row.rate.toFixed(2)}
                          </td>
                          <td className="py-2 px-2 text-center font-mono text-slate-300">
                            {row.batch_number ?? '—'}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-slate-300">
                            {row.beam_meter !== null ? `${row.beam_meter.toFixed(1)}m` : '—'}
                          </td>

                          {/* Shift A Input */}
                          <td className="py-1.5 px-2 bg-slate-850/50 border-x border-slate-800/80" title={inputTitle}>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              disabled={inputDisabled}
                              title={inputTitle}
                              value={edit.shift_a === 0 ? '' : edit.shift_a}
                              placeholder="0"
                              onChange={(e) =>
                                handleInputChange(row.loom_id, 'shift_a', e.target.value)
                              }
                              className={`w-20 text-center font-mono font-semibold py-1 rounded border transition-all text-xs ${shiftInputCls}`}
                            />
                          </td>

                          {/* Shift B Input */}
                          <td className="py-1.5 px-2 bg-slate-850/50 border-r border-slate-800/80" title={inputTitle}>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              disabled={inputDisabled}
                              title={inputTitle}
                              value={edit.shift_b === 0 ? '' : edit.shift_b}
                              placeholder="0"
                              onChange={(e) =>
                                handleInputChange(row.loom_id, 'shift_b', e.target.value)
                              }
                              className={`w-20 text-center font-mono font-semibold py-1 rounded border transition-all text-xs ${shiftInputCls}`}
                            />
                          </td>

                          {/* Total (AUTO) */}
                          <td className="py-2 px-2 text-right font-mono font-bold text-white bg-slate-800/40">
                            {row.total}
                          </td>

                          {/* Average (AUTO) */}
                          <td className="py-2 px-2 text-right font-mono text-amber-300">
                            {row.average.toFixed(2)}
                          </td>

                          {/* Efficiency % (AUTO) */}
                          <td className="py-2 px-2 text-right font-mono text-purple-300">
                            {row.percentage.toFixed(1)}%
                          </td>

                          {/* Meter (AUTO) */}
                          <td className="py-2 px-2 text-right font-mono text-teal-300 font-semibold">
                            {row.meter.toFixed(1)}m
                          </td>

                          {/* Opening (carried from previous days) */}
                          <td className="py-2 px-2 text-right font-mono text-slate-400">
                            {row.opening_meter !== null ? `${row.opening_meter.toFixed(1)}m` : '—'}
                          </td>

                          <td
                            className={`py-2 px-2 text-right font-mono ${
                              row.remaining_meter === null
                                ? 'text-slate-500'
                                : row.remaining_meter <= 0
                                ? 'text-red-400 font-bold'
                                : row.remaining_meter < 50
                                ? 'text-orange-400'
                                : row.remaining_meter < 100
                                ? 'text-amber-300'
                                : 'text-slate-200'
                            }`}
                            title={
                              inactive
                                ? 'Inactive loom — enable it in Master Setup to resume readings'
                                : exhausted
                                ? 'Beam finished — new folding required'
                                : undefined
                            }
                          >
                            {row.remaining_meter !== null ? (
                              <>
                                {row.remaining_meter.toFixed(1)}m
                                {exhausted && !inactive && (
                                  <span className="ml-1.5 text-[9px] uppercase font-bold text-red-400 border border-red-800 rounded px-1 py-0.5">
                                    New Folding
                                  </span>
                                )}
                              </>
                            ) : (
                              '—'
                            )}
                          </td>

                          {/* Rs/Day (AUTO) */}
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                            ₹{row.rs.toFixed(0)}
                          </td>

                          {/* Worker Assignment display */}
                          <td className="py-2 px-3 text-slate-400 text-[11px] truncate max-w-[160px]">
                            {row.shift_a_worker_name || row.shift_b_worker_name || row.worker_name ? (
                              <span className="text-slate-200 space-y-0.5">
                                {row.shift_a_worker_name && (
                                  <span className="flex items-center gap-1">
                                    <span className="text-emerald-400 font-bold">A:</span>
                                    {row.shift_a_worker_name} ({row.shift_a_worker_code})
                                  </span>
                                )}
                                {row.shift_b_worker_name && (
                                  <span className="flex items-center gap-1">
                                    <span className="text-blue-400 font-bold">B:</span>
                                    {row.shift_b_worker_name} ({row.shift_b_worker_code})
                                  </span>
                                )}
                                {!row.shift_a_worker_name && !row.shift_b_worker_name && row.worker_name && (
                                  <span>{row.worker_name} ({row.worker_code})</span>
                                )}
                              </span>
                            ) : (
                              <span className="italic text-slate-400">Unassigned</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Subtotal Row for Line */}
                    <tr className="bg-slate-800/60 font-semibold text-slate-300 text-xs border-y border-slate-700">
                      <td colSpan={6} className="py-2.5 px-3 text-slate-400 uppercase tracking-wider text-[10px]">
                        Subtotal {lineName}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono text-emerald-300">
                        {lineShiftA}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono text-emerald-300">
                        {lineShiftB}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-white font-bold">
                        {lineTotal}
                      </td>
                      <td colSpan={2} className="py-2.5 px-2 text-right text-slate-400 font-mono text-[10px]">
                        Line Subtotal
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-teal-300">
                        {lineMeter.toFixed(1)}m
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-slate-400">
                        {lineOpenings.length > 0 ? `${lineOpening.toFixed(1)}m` : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-slate-300">
                        {lineRemainders.length > 0 ? `${lineRemaining.toFixed(1)}m` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-400 font-bold">
                        ₹{lineRs.toFixed(0)}
                      </td>
                      <td></td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>

            {/* Grand Total Banner */}
            <tfoot className="bg-slate-950 font-bold text-white border-t-2 border-slate-700 text-xs">
              <tr>
                <td colSpan={6} className="py-3 px-3 uppercase tracking-wider text-emerald-400 text-xs">
                  Grand Total (All Looms)
                </td>
                <td className="py-3 px-2 text-center font-mono text-emerald-300 text-sm">
                  {liveTotals.shift_a}
                </td>
                <td className="py-3 px-2 text-center font-mono text-emerald-300 text-sm">
                  {liveTotals.shift_b}
                </td>
                <td className="py-3 px-2 text-right font-mono text-white text-base">
                  {liveTotals.total}
                </td>
                <td className="py-3 px-2 text-right font-mono text-amber-300">
                  {liveTotals.average.toFixed(2)}
                </td>
                <td className="py-3 px-2 text-right font-mono text-purple-300 text-sm">
                  {liveTotals.percentage.toFixed(1)}%
                </td>
                <td className="py-3 px-2 text-right font-mono text-teal-300 text-sm">
                  {liveTotals.meter.toFixed(1)}m
                </td>
                <td className="py-3 px-2 text-right font-mono text-slate-400 text-sm">
                  {liveTotals.opening !== null ? `${liveTotals.opening.toFixed(1)}m` : '—'}
                </td>
                <td className="py-3 px-2 text-right font-mono text-slate-200 text-sm">
                  {liveTotals.remaining !== null ? `${liveTotals.remaining.toFixed(1)}m` : '—'}
                </td>
                <td className="py-3 px-3 text-right font-mono text-emerald-400 text-base">
                  ₹{liveTotals.rs.toLocaleString()}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Beam threshold alerts — 100m / 50m / finished */}
      {activeAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className={`bg-slate-900 border rounded-xl shadow-2xl max-w-md w-full overflow-hidden ${
              activeAlert.level === 0
                ? 'border-red-700'
                : activeAlert.level === 50
                ? 'border-orange-700'
                : 'border-amber-600'
            }`}
          >
            <div
              className={`px-5 py-4 border-b flex items-center gap-2.5 ${
                activeAlert.level === 0
                  ? 'border-red-900/60 bg-red-950/40 text-red-300'
                  : activeAlert.level === 50
                  ? 'border-orange-900/60 bg-orange-950/40 text-orange-300'
                  : 'border-amber-900/60 bg-amber-950/40 text-amber-300'
              }`}
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm">
                {activeAlert.level === 0
                  ? 'Beam Finished — New Folding Required'
                  : activeAlert.level === 50
                  ? 'Beam Almost Finished'
                  : 'Beam Reaching Towards Zero'}
              </h3>
            </div>

            <div className="px-5 py-4 space-y-3 text-sm text-slate-300">
              <p>
                {activeAlert.level === 0 ? (
                  <>
                    Loom{' '}
                    <strong className="text-white">
                      #{activeAlert.loomNumber.toString().padStart(2, '0')}
                    </strong>{' '}
                    beam is completely finished. <strong className="text-red-400">Do not enter
                    any more readings</strong> — a new folding entry is required to continue.
                  </>
                ) : activeAlert.level === 50 ? (
                  <>
                    Loom{' '}
                    <strong className="text-white">
                      #{activeAlert.loomNumber.toString().padStart(2, '0')}
                    </strong>{' '}
                    remaining beam is below{' '}
                    <strong className="text-orange-400">50m</strong>. Please arrange new folding
                    now.
                  </>
                ) : (
                  <>
                    Loom{' '}
                    <strong className="text-white">
                      #{activeAlert.loomNumber.toString().padStart(2, '0')}
                    </strong>{' '}
                    remaining beam is below{' '}
                    <strong className="text-amber-400">100m</strong>. Please arrange new folding
                    soon.
                  </>
                )}
              </p>
              <div className="flex items-center justify-between bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2">
                <span className="text-xs text-slate-400">
                  Batch {activeAlert.batchNumber ?? '—'} · Remaining
                </span>
                <span
                  className={`font-mono font-bold ${
                    activeAlert.level === 0
                      ? 'text-red-400'
                      : activeAlert.level === 50
                      ? 'text-orange-400'
                      : 'text-amber-300'
                  }`}
                >
                  {activeAlert.remaining.toFixed(1)}m
                </span>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-950/60 border-t border-slate-800 flex justify-end gap-2">
              {activeAlert.level === 0 && (
                <button
                  onClick={() => {
                    dismissAlert();
                    onGoToEntry?.();
                  }}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors"
                >
                  Go to Entry
                </button>
              )}
              <button
                onClick={dismissAlert}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  activeAlert.level === 0
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    : activeAlert.level === 50
                    ? 'bg-orange-600 hover:bg-orange-500 text-white'
                    : 'bg-amber-600 hover:bg-amber-500 text-white'
                }`}
              >
                {activeAlert.level === 0 ? 'Close' : 'Close & Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unassigned-workers nudge — a new loom (or cleared roster) with no
          worker on either shift pops this immediately, with a one-tap
          redirect to Worker / Wivar. Dismissed per date; once assigned and
          saved it never returns (state-driven, refresh-proof). */}
      {showAssignNudge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-slate-900 border border-amber-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-amber-900/60 bg-amber-950/40 text-amber-200 flex items-center gap-2.5">
              <UserPlus className="w-5 h-5 shrink-0 text-amber-400" />
              <h3 className="font-bold text-sm">
                {unassignedActive.length} loom{unassignedActive.length !== 1 ? 's' : ''} ha
                {unassignedActive.length !== 1 ? 've' : 's'} no worker assigned
              </h3>
              <button
                onClick={() => setAssignNudgeDismissedFor(currentDate)}
                className="ml-auto p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm text-slate-300">
              <p>
                These active looms have <strong className="text-amber-300">no worker on either shift</strong> for{' '}
                <strong className="text-white font-mono">{currentDate}</strong>. Assign workers first so meters
                and wages calculate against the right people:
              </p>
              <div className="bg-slate-950/60 border border-slate-800 rounded-lg divide-y divide-slate-800 max-h-48 overflow-y-auto">
                {unassignedActive.map((r) => (
                  <div key={r.loom_id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="font-mono text-emerald-400 font-bold">
                      #{r.loom_number.toString().padStart(2, '0')}
                    </span>
                    <span className="text-slate-300 flex-1 ml-2 truncate">{r.loom_name}</span>
                    <span className="text-amber-300 ml-2 font-semibold">Unassigned</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-950/60 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setAssignNudgeDismissedFor(currentDate)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Later
              </button>
              <button
                onClick={() => {
                  setAssignNudgeDismissedFor(currentDate);
                  onGoToWorker?.();
                }}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Assign in Worker / Wivar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved-changes guard (tab switch, date change, or discarding reload) */}
      {leaveModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-slate-900 border border-amber-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-amber-900/60 bg-amber-950/40 text-amber-300 flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm">Unsaved Production Changes</h3>
            </div>

            <div className="px-5 py-4 space-y-3 text-sm text-slate-300">
              <p>
                You have unsaved Shift A / Shift B readings for{' '}
                <strong className="text-white">{currentDate}</strong>. Save them before
                continuing?
              </p>
              {saveSuccess && (
                <p className="text-xs text-emerald-300">
                  Saved — continuing to your destination…
                </p>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-950/60 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={handleLeaveStay}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold transition-colors"
              >
                Stay
              </button>
              <button
                onClick={handleLeaveDiscard}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-red-950 disabled:opacity-50 text-red-300 text-xs font-semibold border border-slate-700 hover:border-red-800 transition-colors"
              >
                Discard Changes
              </button>
              <button
                onClick={handleLeaveSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
              >
                {saving ? 'Saving…' : 'Save & Continue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
