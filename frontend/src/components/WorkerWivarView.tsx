import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Check,
  Copy,
  Info,
  RotateCcw,
  Save,
  Sparkles,
  Star,
  UserCheck,
  X,
} from 'lucide-react';
import { api, getCurrentUser } from '../api/client';
import { ModernCalendar } from './ModernCalendar';
import { DailySummary, DefaultAssignment, Loom, ProductionSettings, Worker } from '../types';
import { onSync } from '../utils/sync';

interface WorkerWivarViewProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  onRefreshData?: () => void;
}

interface WorkerRowEntry {
  loom_id: string;
  shift_a_worker_id: string;
  shift_b_worker_id: string;
  shift_a_remark?: string;
  shift_b_remark?: string;
}

interface MissingSlot {
  loom_number: number;
  loom_name: string;
  shift: 'Shift A' | 'Shift B';
}

export const WorkerWivarView: React.FC<WorkerWivarViewProps> = ({
  currentDate,
  onDateChange,
  onRefreshData,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashSaved = (msg?: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveSuccess(true);
    setSuccessMessage(msg || 'Worker assignments saved successfully!');
    saveTimer.current = setTimeout(() => setSaveSuccess(false), 3000);
  };

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const [successMessage, setSuccessMessage] = useState('Worker assignments saved successfully!');

  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [looms, setLooms] = useState<Loom[]>([]);

  // Settings for live meter factor (same everywhere)
  const [settings, setSettings] = useState<ProductionSettings | null>(null);
  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => undefined);
  }, []);
  const METER_FACTOR = settings?.meter_conversion_factor ?? 25.4;

  // State of worker assignments
  const [entries, setEntries] = useState<Record<string, WorkerRowEntry>>({});

  // Default roster (persisted, date-independent)
  const [defaults, setDefaults] = useState<DefaultAssignment[]>([]);
  const [defaultMode, setDefaultMode] = useState(false);
  const [missingSlots, setMissingSlots] = useState<MissingSlot[] | null>(null);
  const [saveDefaultPrompt, setSaveDefaultPrompt] = useState(false);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);
  const [defaultSaving, setDefaultSaving] = useState(false);

  // Individual totals view toggle
  const [showIndividual, setShowIndividual] = useState(false);

  // Live (unsaved) shift readings streamed from Daily Production — other tab
  const [liveEdits, setLiveEdits] = useState<
    { loom_id: string; shift_a: number; shift_b: number }[] | null
  >(null);

  // Quick range assign - Shift A
  const [batchWorkerIdA, setBatchWorkerIdA] = useState<string>('');
  // Quick range assign - Shift B
  const [batchWorkerIdB, setBatchWorkerIdB] = useState<string>('');
  const [batchFromLoom, setBatchFromLoom] = useState<number>(1);
  const [batchToLoom, setBatchToLoom] = useState<number>(1);

  const currentUser = getCurrentUser();
  const isAdmin = currentUser.role === 'admin';
  const isLocked = dailySummary?.status === 'locked';
  const isCompleted = dailySummary?.status === 'completed';

  // Signature of the current default roster (for change detection)
  const defaultSig = useMemo(
    () =>
      JSON.stringify(
        [...defaults]
          .map((d) => `${d.loom_id}:${d.shift_a_worker_id}:${d.shift_b_worker_id}`)
          .sort()
      ),
    [defaults],
  );
  const promptedSigRef = useRef<string | null>(null);
  // "Not Now" snoozes the auto-prompt until the next date load or day-save —
  // this stops the popup from re-appearing on every single assignment click.
  const promptSnoozedRef = useRef(false);

  const loadData = async (date: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setErrorMessage(null);
    try {
      const [summary0, workersList, loomsList, defaultList] = await Promise.all([
        api.getDailySummary(date),
        api.getWorkers(),
        api.getLooms(),
        api.getDefaultAssignments(),
      ]);
      setWorkers(workersList);
      setLooms(loomsList);
      setDefaults(defaultList);
      setLiveEdits(null);

      let summary = summary0;
      // Brand-new date: create the day (auto-applies the default roster).
      if (!summary0.day_id) {
        summary = await api.ensureProductionDay(date);
        if (defaultList.length > 0) {
          setAppliedNotice(
            `Default worker roster was auto-applied for ${date}. Same workers are fixed to the same machines & shifts.`
          );
        }
      }
      setDailySummary(summary);

      const mapping: Record<string, WorkerRowEntry> = {};
      summary.rows.forEach((r) => {
        mapping[r.loom_id] = {
          loom_id: r.loom_id,
          shift_a_worker_id: r.shift_a_worker_id || r.worker_id || '',
          shift_b_worker_id: r.shift_b_worker_id || '',
          shift_a_remark: r.shift_a_remark || r.remark || '',
          shift_b_remark: r.shift_b_remark || '',
        };
      });
      setEntries(mapping);
      setSavedSnapshot(JSON.stringify(mapping));
      promptedSigRef.current = null;
      promptSnoozedRef.current = false;
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to load worker entries');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(currentDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  // Cross-tab live sync: unsaved Daily Production edits stream in as a preview;
  // a save/complete bumps us back to the persisted values. Master/entry
  // changes reload only when there are no unsaved local edits to protect.
  const dirtyRef = useRef(false);
  useEffect(() => {
    return onSync((msg) => {
      if (msg.type === 'masters' || msg.type === 'entries') {
        if (!loadingRef.current && !dirtyRef.current) {
          loadData(currentDate);
        }
        return;
      }
      if (msg.date !== currentDate) return;
      if (msg.type === 'edits') {
        setLiveEdits(msg.rows);
      } else if (msg.type === 'saved') {
        setLiveEdits(null);
        if (!loadingRef.current) {
          api
            .getDailySummary(currentDate)
            .then((s) => setDailySummary(s))
            .catch(() => undefined);
        }
      }
    });
  }, [currentDate]);

  const handleWorkerChange = (loomId: string, shift: 'shift_a' | 'shift_b', workerId: string) => {
    setEntries((prev) => ({
      ...prev,
      [loomId]: {
        ...prev[loomId],
        [`${shift}_worker_id`]: workerId,
      },
    }));
  };

  const handleRemarkChange = (loomId: string, shift: 'shift_a' | 'shift_b', val: string) => {
    setEntries((prev) => ({
      ...prev,
      [loomId]: {
        ...prev[loomId],
        [`${shift}_remark`]: val,
      },
    }));
  };

  // Prompt (once per distinct change) to save edited assignments as default.
  const currentAssignmentSig = useMemo(() => {
    const parts: string[] = [];
    Object.values(entries).forEach((e) => {
      parts.push(`${e.loom_id}:${e.shift_a_worker_id}:${e.shift_b_worker_id}`);
    });
    return JSON.stringify(parts.sort());
  }, [entries]);

  // Live count of active shift slots still waiting for a worker.
  const missingCount = useMemo(() => {
    let n = 0;
    (dailySummary?.rows || []).forEach((r) => {
      if (r.is_active === false) return;
      const e = entries[r.loom_id];
      if (!e?.shift_a_worker_id) n++;
      if (!e?.shift_b_worker_id) n++;
    });
    return n;
  }, [dailySummary, entries]);

  useEffect(() => {
    if (defaultMode) return;
    if (savedSnapshot === null) return;
    if (promptSnoozedRef.current) return;
    if (currentAssignmentSig === defaultSig) return;
    if (promptedSigRef.current === currentAssignmentSig) return;
    // Ask only when it matters: someone still remains unassigned, or this is
    // a brand-new setup with no defaults saved yet. A fully-assigned roster
    // change is saved deliberately via "Set as Default" — no popup on every click.
    if (missingCount === 0 && defaults.length > 0) return;
    const t = setTimeout(() => {
      promptedSigRef.current = currentAssignmentSig;
      setSaveDefaultPrompt(true);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAssignmentSig, defaultMode, defaults, savedSnapshot, missingCount]);

  // Batch assign workers to a range of looms - Shift A & Shift B
  // (inactive looms are skipped — they take no readings or workers).
  const handleBatchAssign = () => {
    if (isLocked) return;
    setEntries((prev) => {
      const updated = { ...prev };
      looms.forEach((loom) => {
        if (!loom.is_active) return;
        if (loom.loom_number >= batchFromLoom && loom.loom_number <= batchToLoom) {
          const existing = updated[loom.id] || {
            loom_id: loom.id,
            shift_a_worker_id: '',
            shift_b_worker_id: '',
            shift_a_remark: '',
            shift_b_remark: '',
          };
          if (batchWorkerIdA) {
            existing.shift_a_worker_id = batchWorkerIdA;
          }
          if (batchWorkerIdB) {
            existing.shift_b_worker_id = batchWorkerIdB;
          }
          updated[loom.id] = existing;
        }
      });
      return updated;
    });
  };

  // Quick assign: Same worker to both shifts for all active looms
  const handleQuickAssignBoth = (workerId: string) => {
    if (isLocked) return;
    const worker = workers.find((w) => w.id === workerId);
    if (!worker) return;

    setEntries((prev) => {
      const updated = { ...prev };
      looms.forEach((loom) => {
        if (loom.is_active) {
          const existing = updated[loom.id] || {
            loom_id: loom.id,
            shift_a_worker_id: '',
            shift_b_worker_id: '',
            shift_a_remark: '',
            shift_b_remark: '',
          };
          existing.shift_a_worker_id = workerId;
          existing.shift_b_worker_id = workerId;
          updated[loom.id] = existing;
        }
      });
      return updated;
    });
  };

  const buildPayload = () =>
    Object.values(entries)
      .filter((e) => e.shift_a_worker_id || e.shift_b_worker_id)
      .map((e) => ({
        loom_id: e.loom_id,
        shift_a_worker_id: e.shift_a_worker_id,
        shift_b_worker_id: e.shift_b_worker_id,
        remark: e.shift_a_remark,
        shift_b_remark: e.shift_b_remark,
      }));

  const handleSave = async (): Promise<boolean> => {
    if (!dailySummary || saving) return false;
    setSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      let summary = dailySummary;
      if (!summary.day_id) {
        summary = await api.ensureProductionDay(currentDate);
      }
      const updated = await api.saveWorkerEntries(summary.day_id!, buildPayload());
      setDailySummary(updated);
      setSavedSnapshot(JSON.stringify(entries));
      // Re-arm the default prompt: if slots still remain unassigned after this
      // save, remind once — otherwise the roster is complete and stays silent.
      promptSnoozedRef.current = false;
      flashSaved();
      if (onRefreshData) onRefreshData();
      return true;
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save worker entries');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // ---- Default roster (toggle button) ----
  const collectMissingSlots = (): MissingSlot[] => {
    const missing: MissingSlot[] = [];
    (dailySummary?.rows || []).forEach((r) => {
      if (r.is_active === false) return;
      const e = entries[r.loom_id];
      if (!e?.shift_a_worker_id) {
        missing.push({ loom_number: r.loom_number, loom_name: r.loom_name, shift: 'Shift A' });
      }
      if (!e?.shift_b_worker_id) {
        missing.push({ loom_number: r.loom_number, loom_name: r.loom_name, shift: 'Shift B' });
      }
    });
    return missing;
  };

  const persistDefaults = async (): Promise<boolean> => {
    const payload = (dailySummary?.rows || [])
      .filter((r) => r.is_active !== false)
      .map((r) => ({
        loom_id: r.loom_id,
        shift_a_worker_id: entries[r.loom_id]?.shift_a_worker_id || '',
        shift_b_worker_id: entries[r.loom_id]?.shift_b_worker_id || '',
      }));
    setDefaultSaving(true);
    setErrorMessage(null);
    try {
      const saved = await api.saveDefaultAssignments(payload);
      setDefaults(saved);
      promptedSigRef.current = null;
      return true;
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save default roster');
      return false;
    } finally {
      setDefaultSaving(false);
    }
  };

  const handleDefaultToggle = async () => {
    if (isLocked) return;
    if (!defaultMode) {
      setDefaultMode(true);
      setShowIndividual(false);
      return;
    }
    // Second press → validate every machine/shift is assigned, then save.
    const missing = collectMissingSlots();
    if (missing.length > 0) {
      setMissingSlots(missing);
      return;
    }
    // Persist today's day entries alongside the roster so both stay in sync.
    const dirtyNow = savedSnapshot !== null && JSON.stringify(entries) !== savedSnapshot;
    if (dirtyNow && !isLocked) {
      await handleSave();
    }
    const ok = await persistDefaults();
    if (ok) {
      setDefaultMode(false);
      flashSaved('Default roster saved! These workers will be auto-assigned every new date.');
    }
  };

  const handleSaveDefaultFromPrompt = async () => {
    setSaveDefaultPrompt(false);
    const missing = collectMissingSlots();
    if (missing.length > 0) {
      // Let the user finish assigning first — day-saves re-arm the reminder.
      promptSnoozedRef.current = true;
      setMissingSlots(missing);
      return;
    }
    // Persist today's day entries ALONGSIDE the roster. Without this the
    // backend keeps the old assignments and the popup returns after refresh.
    const dirtyNow = savedSnapshot !== null && JSON.stringify(entries) !== savedSnapshot;
    if (dirtyNow && !isLocked) {
      const savedOk = await handleSave();
      if (!savedOk) return;
    }
    const ok = await persistDefaults();
    if (ok) {
      promptSnoozedRef.current = true;
      flashSaved('Default roster updated!');
    }
  };

  // ---- Rows with live (unsaved) Daily Production preview applied ----
  const effectiveRows = useMemo(() => {
    const rows = dailySummary?.rows || [];
    if (!liveEdits) return rows;
    return rows.map((r) => {
      const le = liveEdits.find((x) => x.loom_id === r.loom_id);
      if (!le) return r;
      const shift_a = le.shift_a;
      const shift_b = le.shift_b;
      const total = Math.round((shift_a + shift_b) * 100) / 100;
      const meter =
        r.specification > 0
          ? Math.round(((total * METER_FACTOR) / r.specification) * 100) / 100
          : 0;
      return { ...r, shift_a, shift_b, total, meter };
    });
  }, [dailySummary, liveEdits]);

  // Loom Groups: each loom = header row + 2 shift rows (Shift A, Shift B)
  const loomGroups = useMemo(() => {
    return effectiveRows.map((row) => {
      const entry = entries[row.loom_id];

      const shiftAWorkerId =
        entry?.shift_a_worker_id || row.shift_a_worker_id || row.worker_id || '';

      const shiftBWorkerId = entry?.shift_b_worker_id || row.shift_b_worker_id || '';

      const totalUnits = row.shift_a + row.shift_b;
      const share = totalUnits > 0 ? row.shift_a / totalUnits : 0.5;
      const shiftAMeter = Math.round(share * row.meter * 100) / 100;
      const shiftBMeter = Math.round((row.meter - shiftAMeter) * 100) / 100;

      const shifts = [
        {
          key: `${row.loom_id}-a`,
          shift: 'shift_a' as const,
          worker_id: shiftAWorkerId,
          units: row.shift_a,
          meter: shiftAMeter,
          remark: entry?.shift_a_remark || '',
        },
        {
          key: `${row.loom_id}-b`,
          shift: 'shift_b' as const,
          worker_id: shiftBWorkerId,
          units: row.shift_b,
          meter: shiftBMeter,
          remark: entry?.shift_b_remark || '',
        },
      ];

      return {
        loom_id: row.loom_id,
        loom_number: row.loom_number,
        loom_name: row.loom_name,
        number_line_name: row.number_line_name,
        is_active: row.is_active !== false,
        total_units: totalUnits,
        meter: row.meter,
        shifts,
      };
    });
  }, [effectiveRows, entries]);

  const uniqueLooms = loomGroups.length;

  // Aggregate stats
  const totalMeters = useMemo(
    () => loomGroups.reduce((sum, g) => sum + g.meter, 0),
    [loomGroups],
  );

  const assignedCount = useMemo(
    () => loomGroups.reduce((n, g) => n + g.shifts.filter((s) => s.worker_id).length, 0),
    [loomGroups],
  );

  const totalSlots = uniqueLooms * 2;

  const dirty = savedSnapshot !== null && JSON.stringify(entries) !== savedSnapshot;
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // ---- Individual totals (per worker, machine-wise, sorted by sort #) ----
  const shiftCards = useMemo(() => {
    let aUnits = 0;
    let bUnits = 0;
    let aMeter = 0;
    let bMeter = 0;
    const machines: { sort: number; a: number; b: number }[] = [];
    [...effectiveRows]
      .sort((x, y) => x.loom_number - y.loom_number)
      .forEach((r) => {
        const total = r.shift_a + r.shift_b;
        const share = total > 0 ? r.shift_a / total : 0.5;
        const ma = Math.round(share * r.meter * 100) / 100;
        const mb = Math.round((r.meter - ma) * 100) / 100;
        aUnits += r.shift_a;
        bUnits += r.shift_b;
        aMeter += ma;
        bMeter += mb;
        machines.push({ sort: r.loom_number, a: r.shift_a, b: r.shift_b });
      });
    return {
      aUnits: Math.round(aUnits * 100) / 100,
      bUnits: Math.round(bUnits * 100) / 100,
      aMeter: Math.round(aMeter * 100) / 100,
      bMeter: Math.round(bMeter * 100) / 100,
      machines,
    };
  }, [effectiveRows]);

  const individualGroups = useMemo(() => {
    interface MachRow {
      sort: number;
      loom_id: string;
      loom_name: string;
      line: string;
      aUnits: number | null;
      bUnits: number | null;
      aMeter: number;
      bMeter: number;
    }
    interface WG {
      worker: Worker;
      machines: MachRow[];
      aTotal: number;
      bTotal: number;
      meterTotal: number;
    }
    const groups = new Map<string, WG>();
    const workerMap = new Map(workers.map((w) => [w.id, w]));

    const rows = [...effectiveRows].sort((x, y) => x.loom_number - y.loom_number);
    rows.forEach((r) => {
      const entry = entries[r.loom_id];
      const aId = entry?.shift_a_worker_id || r.shift_a_worker_id || r.worker_id || '';
      const bId = entry?.shift_b_worker_id || r.shift_b_worker_id || '';
      const total = r.shift_a + r.shift_b;
      const share = total > 0 ? r.shift_a / total : 0.5;
      const ma = Math.round(share * r.meter * 100) / 100;
      const mb = Math.round((r.meter - ma) * 100) / 100;

      const push = (id: string, shift: 'a' | 'b') => {
        if (!id) return;
        const worker = workerMap.get(id);
        if (!worker) return;
        let g = groups.get(id);
        if (!g) {
          g = { worker, machines: [], aTotal: 0, bTotal: 0, meterTotal: 0 };
          groups.set(id, g);
        }
        let m = g.machines.find((x) => x.loom_id === r.loom_id);
        if (!m) {
          m = {
            sort: r.loom_number,
            loom_id: r.loom_id,
            loom_name: r.loom_name,
            line: r.number_line_name,
            aUnits: null,
            bUnits: null,
            aMeter: 0,
            bMeter: 0,
          };
          g.machines.push(m);
        }
        if (shift === 'a') {
          m.aUnits = r.shift_a;
          m.aMeter = ma;
          g.aTotal += r.shift_a;
          g.meterTotal += ma;
        } else {
          m.bUnits = r.shift_b;
          m.bMeter = mb;
          g.bTotal += r.shift_b;
          g.meterTotal += mb;
        }
      };

      push(aId, 'a');
      push(bId, 'b');
    });

    return [...groups.values()]
      .map((g) => ({
        ...g,
        machines: g.machines.sort((x, y) => x.sort - y.sort),
        aTotal: Math.round(g.aTotal * 100) / 100,
        bTotal: Math.round(g.bTotal * 100) / 100,
        meterTotal: Math.round(g.meterTotal * 100) / 100,
        total: Math.round((g.aTotal + g.bTotal) * 100) / 100,
      }))
      .sort((x, y) => (x.machines[0]?.sort ?? 0) - (y.machines[0]?.sort ?? 0));
  }, [effectiveRows, entries, workers]);

  const workerCount = individualGroups.length;
  const assignedMachineCount = useMemo(() => {
    const set = new Set<string>();
    individualGroups.forEach((g) => g.machines.forEach((m) => set.add(m.loom_id)));
    return set.size;
  }, [individualGroups]);

  return (
    <div className="space-y-5">
      {/* Top Controls Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
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

          <div className="flex items-center space-x-2 flex-wrap">
            <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center space-x-1.5 font-medium">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Assigned: {assignedCount} / {totalSlots} Shift Slots
                {dailySummary ? ` (${uniqueLooms} Looms)` : ''}
              </span>
            </span>
            {defaults.length > 0 && !defaultMode && (
              <span className="text-[11px] bg-emerald-950/70 text-emerald-300 px-2.5 py-1.5 rounded-lg border border-emerald-700/60 font-semibold whitespace-nowrap flex items-center space-x-1">
                <Star className="w-3 h-3 fill-current" />
                <span>Default roster: {defaults.length} looms</span>
              </span>
            )}
            {isCompleted && (
              <span className="text-[11px] bg-blue-950/70 text-blue-300 px-2.5 py-1.5 rounded-lg border border-blue-700/60 font-semibold whitespace-nowrap">
                Day completed — readings locked
              </span>
            )}
            {liveEdits && liveEdits.length > 0 && (
              <span className="text-[11px] bg-amber-950/70 text-amber-300 px-2.5 py-1.5 rounded-lg border border-amber-700/60 font-semibold whitespace-nowrap animate-pulse">
                ● Live from Daily Production (unsaved)
              </span>
            )}
            {dirty && (
              <span className="text-[11px] bg-amber-950/80 text-amber-300 px-2.5 py-1.5 rounded-lg border border-amber-700/70 font-semibold whitespace-nowrap">
                ● Unsaved changes
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 flex-wrap">
          <button
            onClick={() => setShowIndividual((v) => !v)}
            className={`flex items-center space-x-1.5 text-xs font-medium px-3.5 py-2 rounded-lg transition-colors border shadow-sm ${
              showIndividual
                ? 'bg-purple-600 border-purple-500 text-white hover:bg-purple-500'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title="Show individual worker totals (shift-wise, machine-wise)"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Individual Total</span>
          </button>

          <button
            onClick={handleDefaultToggle}
            disabled={isLocked || defaultSaving || saving}
            className={`flex items-center space-x-1.5 text-xs font-medium px-3.5 py-2 rounded-lg transition-colors border shadow-sm disabled:opacity-50 ${
              defaultMode
                ? 'bg-amber-500 border-amber-400 text-slate-900 hover:bg-amber-400 font-bold animate-pulse'
                : defaults.length > 0
                ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300 hover:bg-emerald-900/60'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title={
              defaultMode
                ? 'Press again to save this setup as the default roster'
                : 'Enter default setup mode — assign workers per machine & shift'
            }
          >
            <Star className={`w-3.5 h-3.5 ${defaultMode ? 'fill-current' : ''}`} />
            <span>
              {defaultSaving
                ? 'Saving…'
                : defaultMode
                ? 'Press again → Save as Default'
                : 'Set as Default'}
            </span>
          </button>

          <button
            onClick={() => loadData(currentDate)}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 border border-slate-700 rounded-lg transition-colors"
            title="Reload from database"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleSave()}
            disabled={saving || isLocked}
            className={`flex items-center space-x-1.5 disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors shadow-sm ${
              dirty
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{dirty ? 'Save Changes' : 'Save Worker Assignments'}</span>
          </button>
        </div>
      </div>

      {/* Notifications — fixed toast so nothing below shifts/flickers */}
      {(errorMessage || saveSuccess) && (
        <div className="fixed top-20 right-4 z-50 space-y-2 max-w-xs pointer-events-none">
          {errorMessage && (
            <div className="bg-red-950/95 border border-red-800/80 rounded-lg p-3 text-xs text-red-300 flex items-start space-x-2 shadow-lg backdrop-blur">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
          {saveSuccess && (
            <div className="bg-emerald-950/95 border border-emerald-800/80 rounded-lg p-3 text-xs text-emerald-300 flex items-center space-x-2 shadow-lg backdrop-blur">
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>
      )}

      {/* Default setup mode banner */}
      {defaultMode && (
        <div className="bg-amber-950/40 border border-amber-700/70 rounded-lg p-3 text-xs text-amber-200 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Star className="w-4 h-4 text-amber-400 fill-current shrink-0" />
            <span>
              <strong>Default setup mode:</strong> assign a worker to{' '}
              <strong>every machine for both Shift A & Shift B</strong> (all fields required),
              then press <strong>“Press again → Save as Default”</strong>. This roster will be
              auto-assigned on every new production date.
            </span>
          </div>
          <button
            onClick={() => setDefaultMode(false)}
            className="shrink-0 p-1.5 rounded-md bg-amber-900/60 hover:bg-amber-800/60 text-amber-300"
            title="Exit default setup"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showIndividual ? (
        /* ============ Individual Totals View ============ */
        <div className="space-y-5">
          {/* Two overall shift cards — sorted/connected by machine sort number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-emerald-800/60 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase font-bold text-emerald-400 tracking-wider">
                  Shift A — Overall Total
                </span>
                <span className="text-[10px] text-slate-500 font-mono">sorted by sort #</span>
              </div>
              <div className="flex items-end gap-4">
                <div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {shiftCards.aUnits}
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase">Units</div>
                </div>
                <div>
                  <div className="text-2xl font-bold font-mono text-teal-300">
                    {shiftCards.aMeter.toFixed(1)}m
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase">Meters</div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-800 flex flex-wrap gap-x-2 gap-y-1 font-mono text-[10px] text-slate-400">
                {shiftCards.machines.map((m) => (
                  <span key={m.sort} className="bg-slate-800/80 rounded px-1.5 py-0.5">
                    #{m.sort.toString().padStart(2, '0')}:{' '}
                    <span className="text-emerald-300">{m.a}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 border border-blue-800/60 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase font-bold text-blue-400 tracking-wider">
                  Shift B — Overall Total
                </span>
                <span className="text-[10px] text-slate-500 font-mono">sorted by sort #</span>
              </div>
              <div className="flex items-end gap-4">
                <div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {shiftCards.bUnits}
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase">Units</div>
                </div>
                <div>
                  <div className="text-2xl font-bold font-mono text-teal-300">
                    {shiftCards.bMeter.toFixed(1)}m
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase">Meters</div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-800 flex flex-wrap gap-x-2 gap-y-1 font-mono text-[10px] text-slate-400">
                {shiftCards.machines.map((m) => (
                  <span key={m.sort} className="bg-slate-800/80 rounded px-1.5 py-0.5">
                    #{m.sort.toString().padStart(2, '0')}:{' '}
                    <span className="text-blue-300">{m.b}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Per-worker breakdown — machines sorted by sort number */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                <span>
                  Individual Totals — {workerCount} Workers · {assignedMachineCount}/
                  {uniqueLooms} Machines
                </span>
              </span>
              <span className="text-[10px] text-slate-500">
                Readings sourced live from Daily Production (Shift A / Shift B inputs)
              </span>
            </div>

            {individualGroups.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No workers assigned yet. Assign workers in the Assignment view (toggle off
                Individual Total) or press <strong>Set as Default</strong>.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs text-left border-collapse">
                  <thead className="text-[11px] uppercase bg-slate-800/90 text-slate-400 font-semibold border-b border-slate-700">
                    <tr>
                      <th className="py-3 px-3 min-w-[190px] text-emerald-400">Worker</th>
                      <th className="py-3 px-2 w-[70px] text-right">Sort #</th>
                      <th className="py-3 px-2 min-w-[150px]">Machine</th>
                      <th className="py-3 px-2 w-[90px] text-right text-emerald-400">
                        Shift A Units
                      </th>
                      <th className="py-3 px-2 w-[90px] text-right text-blue-400">
                        Shift B Units
                      </th>
                      <th className="py-3 px-2 w-[80px] text-right">Total</th>
                      <th className="py-3 px-3 w-[92px] text-right text-teal-400">Meters</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {individualGroups.map((g, gi) => (
                      <React.Fragment key={g.worker.id}>
                        {g.machines.map((m, mi) => (
                          <tr
                            key={`${g.worker.id}-${m.loom_id}`}
                            className={`border-t border-slate-800/80 hover:bg-slate-800/40 transition-colors ${
                              gi % 2 === 0 ? 'bg-slate-900' : 'bg-slate-950/40'
                            }`}
                          >
                            <td className="py-2.5 px-3">
                              {mi === 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                  <span className="font-semibold text-white">
                                    {g.worker.name}
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {g.worker.code}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono text-emerald-400 font-bold">
                              #{m.sort.toString().padStart(2, '0')}
                            </td>
                            <td className="py-2.5 px-2 text-slate-400">
                              {m.loom_name}
                              <span className="text-[10px] text-slate-600 ml-1.5">
                                {m.line}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono text-emerald-300">
                              {m.aUnits !== null ? m.aUnits : '—'}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono text-blue-300">
                              {m.bUnits !== null ? m.bUnits : '—'}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono text-white font-semibold">
                              {(m.aUnits || 0) + (m.bUnits || 0)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-teal-300">
                              {(m.aMeter + m.bMeter).toFixed(1)}m
                            </td>
                          </tr>
                        ))}
                        {/* Worker subtotal */}
                        <tr className="bg-slate-800/70 border-t border-slate-700 font-bold text-white">
                          <td className="py-2 px-3 text-[11px] uppercase text-emerald-400 tracking-wide">
                            {g.worker.name} — Total
                          </td>
                          <td colSpan={2} className="py-2 px-2 text-[10px] text-slate-500 font-normal">
                            {g.machines.length} machine{g.machines.length !== 1 ? 's' : ''} ·
                            sorted by sort #
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-emerald-300">
                            {g.aTotal}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-blue-300">
                            {g.bTotal}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-white text-sm">
                            {g.total}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-teal-300">
                            {g.meterTotal.toFixed(1)}m
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-950 font-bold text-white border-t-2 border-slate-700 text-xs">
                    <tr>
                      <td colSpan={3} className="py-3 px-3 uppercase text-emerald-400">
                        Overall — All Workers ({workerCount})
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-emerald-300 text-sm">
                        {shiftCards.aUnits}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-blue-300 text-sm">
                        {shiftCards.bUnits}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-white text-sm">
                        {Math.round((shiftCards.aUnits + shiftCards.bUnits) * 100) / 100}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-teal-300 text-sm">
                        {(shiftCards.aMeter + shiftCards.bMeter).toFixed(1)}m
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Quick Batch Assignment Toolbar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="flex items-center space-x-1.5 text-slate-300 font-semibold">
                <Copy className="w-3.5 h-3.5 text-emerald-400" />
                <span>Batch Assign Shift A:</span>
              </div>
              <select
                value={batchWorkerIdA}
                onChange={(e) => setBatchWorkerIdA(e.target.value)}
                disabled={isLocked}
                className="bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
              >
                <option value="">Select Worker / Wivar...</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
              <span className="text-slate-400">to Looms</span>
              <input
                type="number"
                min="1"
                max={Math.max(0, ...looms.map((l) => l.loom_number))}
                value={batchFromLoom}
                onChange={(e) => setBatchFromLoom(Number(e.target.value))}
                className="w-14 bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-white text-xs text-center font-mono"
              />
              <span className="text-slate-400">thru</span>
              <input
                type="number"
                min="1"
                max={Math.max(0, ...looms.map((l) => l.loom_number))}
                value={batchToLoom}
                onChange={(e) => setBatchToLoom(Number(e.target.value))}
                className="w-14 bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-white text-xs text-center font-mono"
              />
              <button
                onClick={handleBatchAssign}
                disabled={(!batchWorkerIdA && !batchWorkerIdB) || isLocked}
                className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-emerald-400 hover:text-emerald-300 border border-slate-700 rounded-md px-3 py-1 font-medium transition-colors"
              >
                Apply Range
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="flex items-center space-x-1.5 text-slate-300 font-semibold">
                <Copy className="w-3.5 h-3.5 text-blue-400" />
                <span>Batch Assign Shift B:</span>
              </div>
              <select
                value={batchWorkerIdB}
                onChange={(e) => setBatchWorkerIdB(e.target.value)}
                disabled={isLocked}
                className="bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="">Select Worker / Wivar...</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
              <span className="text-slate-400">to Looms</span>
              <input
                type="number"
                min="1"
                max={Math.max(0, ...looms.map((l) => l.loom_number))}
                value={batchFromLoom}
                onChange={(e) => setBatchFromLoom(Number(e.target.value))}
                className="w-14 bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-white text-xs text-center font-mono"
              />
              <span className="text-slate-400">thru</span>
              <input
                type="number"
                min="1"
                max={Math.max(0, ...looms.map((l) => l.loom_number))}
                value={batchToLoom}
                onChange={(e) => setBatchToLoom(Number(e.target.value))}
                className="w-14 bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-white text-xs text-center font-mono"
              />
              <button
                onClick={handleBatchAssign}
                disabled={(!batchWorkerIdA && !batchWorkerIdB) || isLocked}
                className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-blue-400 hover:text-blue-300 border border-slate-700 rounded-md px-3 py-1 font-medium transition-colors"
              >
                Apply Range
              </button>
            </div>

            {/* Quick Assign Both Shifts */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="flex items-center space-x-1.5 text-slate-300 font-semibold">
                <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Same Worker Both Shifts:</span>
              </div>
              <select
                value={batchWorkerIdA}
                onChange={(e) => setBatchWorkerIdA(e.target.value)}
                disabled={isLocked}
                className="bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
              >
                <option value="">Select Worker...</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleQuickAssignBoth(batchWorkerIdA)}
                disabled={!batchWorkerIdA || isLocked}
                className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white border border-amber-700 rounded-md px-3 py-1 font-medium transition-colors"
              >
                Apply to All Active Looms
              </button>
            </div>

            {/* Meters Summary Pill */}
            <div className="flex items-center space-x-3 text-slate-300 font-mono text-xs">
              <span>Total Meters: <strong className="text-teal-400">{totalMeters.toFixed(1)}m</strong></span>
            </div>
          </div>

          {/* Info Callout */}
          <div className="bg-slate-850/50 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-400 flex items-center space-x-2">
            <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>
              <strong>Shift-based Assignment:</strong> Each loom has two rows — Shift A and Shift B — with their own worker and remark. Both shifts are saved to the backend. Live Daily Production readings appear here in real-time; after <strong className="text-emerald-300">Save Draft / Complete Day</strong> they are locked for the date. Use{' '}
              <strong className="text-amber-300">Set as Default</strong> to auto-assign the same workers every new date.
            </span>
          </div>

          {/* Worker Entry Table — each loom gets a header row + 2 shift rows */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[860px] text-xs text-left border-collapse">
                <thead className="text-[11px] uppercase bg-slate-800/90 text-slate-400 font-semibold border-b border-slate-700">
                  <tr>
                    <th className="py-3 px-3 w-[88px]">Shift</th>
                    <th className="py-3 px-3 min-w-[200px] text-emerald-400">Worker (INPUT)</th>
                    <th className="py-3 px-2 w-[76px] text-right">Units</th>
                    <th className="py-3 px-2 w-[92px] text-right text-teal-400">Meters</th>
                    <th className="py-3 px-3 min-w-[168px]">Remark</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {loomGroups.map((group) => (
                    <React.Fragment key={group.loom_id}>
                      {/* Loom group header row */}
                      <tr className={`bg-slate-800/70 border-t-2 border-slate-700 ${!group.is_active ? 'opacity-55' : ''}`}>
                        <td colSpan={5} className="py-2 px-3">
                          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="font-mono font-bold text-emerald-400 text-sm">
                                #{group.loom_number.toString().padStart(2, '0')}
                              </span>
                              <span className="font-semibold text-white truncate">
                                {group.loom_name}
                              </span>
                              <span className="text-[11px] text-slate-500 font-mono shrink-0">
                                {group.number_line_name}
                              </span>
                              {!group.is_active && (
                                <span
                                  title="This loom is inactive — enable it in Master Setup to assign workers"
                                  className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase bg-slate-800 text-slate-400 border border-slate-600"
                                >
                                  Inactive
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400 shrink-0">
                              <span>
                                Units{' '}
                                <span className="text-slate-200 font-semibold">
                                  {group.total_units}
                                </span>
                              </span>
                              <span>
                                Meters{' '}
                                <span className="text-teal-300 font-semibold">
                                  {group.meter.toFixed(1)}m
                                </span>
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Shift rows */}
                      {group.shifts.map((shiftRow) => {
                        const isA = shiftRow.shift === 'shift_a';
                        const entry = entries[group.loom_id];
                        const rowDisabled = isLocked || !group.is_active;
                        return (
                          <tr
                            key={shiftRow.key}
                            title={
                              !group.is_active
                                ? 'This loom is inactive — enable it in Master Setup to assign workers'
                                : undefined
                            }
                            className={`border-t border-slate-800/80 transition-colors ${
                              !group.is_active
                                ? 'opacity-55 bg-slate-900/60'
                                : isA
                                ? 'bg-emerald-950/15 hover:bg-emerald-900/20'
                                : 'bg-blue-950/15 hover:bg-blue-900/20'
                            }`}
                          >
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-flex items-center justify-center w-[62px] px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide ${
                                  isA
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                                    : 'bg-blue-950 text-blue-300 border border-blue-700'
                                }`}
                              >
                                {isA ? 'Shift A' : 'Shift B'}
                              </span>
                            </td>

                            <td className="py-2 px-3">
                              <select
                                value={shiftRow.worker_id || ''}
                                disabled={rowDisabled}
                                title={
                                  !group.is_active
                                    ? 'This loom is inactive — enable it in Master Setup to assign workers'
                                    : undefined
                                }
                                onChange={(e) =>
                                  handleWorkerChange(group.loom_id, shiftRow.shift, e.target.value)
                                }
                                className={`w-full bg-slate-800 border rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 ${
                                  isA
                                    ? 'border-emerald-700/80 hover:border-emerald-500'
                                    : 'border-blue-700/80 hover:border-blue-500'
                                }`}
                              >
                                <option value="">Select Worker...</option>
                                {workers.map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.name} ({w.code})
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="py-2.5 px-2 text-right font-mono text-slate-400 bg-slate-950/40">
                              {shiftRow.units}
                            </td>

                            <td className="py-2.5 px-2 text-right font-mono text-teal-300 font-semibold">
                              {shiftRow.meter.toFixed(1)}m
                            </td>

                            <td className="py-2 px-3">
                              <input
                                type="text"
                                disabled={isLocked}
                                value={entry?.[`${shiftRow.shift}_remark`] || ''}
                                placeholder={isA ? 'Shift A remark...' : 'Shift B remark...'}
                                onChange={(e) =>
                                  handleRemarkChange(group.loom_id, shiftRow.shift, e.target.value)
                                }
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot className="bg-slate-950 font-bold text-white border-t-2 border-slate-700 text-xs">
                  <tr>
                    <td colSpan={2} className="py-3 px-3 uppercase text-emerald-400">
                      Total Worker Summary ({uniqueLooms} Looms × 2 Shifts)
                    </td>
                    <td className="py-3 px-2 text-right font-mono text-white text-sm">
                      {loomGroups.reduce((s, g) => s + g.total_units, 0)}
                    </td>
                    <td className="py-3 px-2 text-right font-mono text-teal-300 text-sm">
                      {totalMeters.toFixed(1)}m
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ===== Modal: missing assignments (required before saving default) ===== */}
      {missingSlots && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div role="dialog" aria-modal="true" className="bg-slate-900 border border-red-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-red-900/60 bg-red-950/40 text-red-300 flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm">
                Cannot save default — {missingSlots.length} assignment
                {missingSlots.length !== 1 ? 's' : ''} remaining
              </h3>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm text-slate-300">
              <p>
                All fields are <strong className="text-red-300">required</strong>. Assign a worker
                to every machine for both shifts before saving as default:
              </p>
              <div className="bg-slate-950/60 border border-slate-800 rounded-lg divide-y divide-slate-800 max-h-56 overflow-y-auto">
                {missingSlots.map((m, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="font-mono text-emerald-400 font-bold">
                      #{m.loom_number.toString().padStart(2, '0')}
                    </span>
                    <span className="text-slate-300 flex-1 ml-2">{m.loom_name}</span>
                    <span
                      className={`font-semibold ${
                        m.shift === 'Shift A' ? 'text-emerald-300' : 'text-blue-300'
                      }`}
                    >
                      {m.shift}
                    </span>
                    <span className="text-red-400 ml-2">Unassigned</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-950/60 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setMissingSlots(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
              >
                Go Assign Them
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: assignment changed → save as default? ===== */}
      {saveDefaultPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div role="dialog" aria-modal="true" className="bg-slate-900 border border-amber-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-amber-900/60 bg-amber-950/40 text-amber-200 flex items-center gap-2.5">
              <Star className="w-5 h-5 shrink-0 fill-current text-amber-400" />
              <h3 className="font-bold text-sm">Save these changes as default?</h3>
            </div>
            <div className="px-5 py-4 space-y-2 text-sm text-slate-300">
              <p>
                You changed a worker assignment. Save this setup as the{' '}
                <strong className="text-amber-300">default roster</strong> so the same workers
                are auto-assigned on every new production date?
              </p>
            </div>
            <div className="px-5 py-3 bg-slate-950/60 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => {
                  setSaveDefaultPrompt(false);
                  // Snooze for this date-load / until the next save — stops the
                  // popup from firing again on every subsequent click.
                  promptSnoozedRef.current = true;
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Not Now
              </button>
              <button
                onClick={handleSaveDefaultFromPrompt}
                disabled={defaultSaving}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <Star className="w-3.5 h-3.5 fill-current" />
                Save as Default
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: default roster auto-applied on new date ===== */}
      {appliedNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div role="dialog" aria-modal="true" className="bg-slate-900 border border-emerald-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-emerald-900/60 bg-emerald-950/40 text-emerald-200 flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 shrink-0 text-emerald-400" />
              <h3 className="font-bold text-sm">Default roster applied</h3>
            </div>
            <div className="px-5 py-4 text-sm text-slate-300">
              <p>{appliedNotice}</p>
              <p className="mt-2 text-xs text-slate-500">
                You can still change any assignment for this date — we'll ask if you want to
                update the default roster.
              </p>
            </div>
            <div className="px-5 py-3 bg-slate-950/60 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setAppliedNotice(null)}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
