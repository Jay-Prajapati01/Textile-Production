import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Cpu,
  Database,
  Layers,
  Plus,
  Save,
  Settings,
  Sliders,
  Users,
} from 'lucide-react';
import { api } from '../api/client';
import { Loom, NumberLine, ProductionSettings, Worker } from '../types';
import { onSync } from '../utils/sync';

const hintCls = 'normal-case font-normal opacity-60';

export const MasterSetupView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'looms' | 'workers' | 'lines' | 'settings'>('looms');
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [looms, setLooms] = useState<Loom[]>([]);
  // In-progress edits for the loom table — committed on blur / Enter, never on keystroke
  const [loomDrafts, setLoomDrafts] = useState<Record<string, Partial<Loom>>>({});
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [numberLines, setNumberLines] = useState<NumberLine[]>([]);
  const [settings, setSettings] = useState<ProductionSettings | null>(null);
  // Timer + loading refs: a fresh "Saved" must cancel the previous hide-timer
  // (otherwise rapid saves make the banner flash/vanish instantly), and
  // overlapping loadData calls must not interleave state updates.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef = useRef(false);

  const flashSaved = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveSuccess(true);
    saveTimer.current = setTimeout(() => setSaveSuccess(false), 2000);
  };

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Modal / form states for additions
  const [showAddLoomModal, setShowAddLoomModal] = useState(false);
  const [newLoom, setNewLoom] = useState({
    loom_number: '',
    name: '',
    pick: '',
    pickRate: '',
    rate: '',
    number_line_id: '',
  });

  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false);
  const [newWorker, setNewWorker] = useState({
    name: '',
    code: '',
  });

  const [showAddLineModal, setShowAddLineModal] = useState(false);
  const [newLineName, setNewLineName] = useState('');

  const loadData = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setErrorMessage(null);
    try {
      const [l, w, nl, s] = await Promise.all([
        api.getLooms(),
        api.getWorkers(),
        api.getNumberLines(),
        api.getSettings(),
      ]);
      setLooms(l);
      setLoomDrafts({});
      setWorkers(w);
      setNumberLines(nl);
      setSettings(s);
      // Loom number left blank for user input
      setNewWorker((prev) => ({ ...prev, code: `W-${(w.length + 1).toString().padStart(2, '0')}` }));
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load master configuration');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);
  useEffect(() => onSync((msg) => {
    if (msg.type === 'masters' && Object.keys(loomDrafts).length === 0) void loadData();
  }), [loomDrafts]);

  const handleUpdateLoom = async (id: string, updates: Partial<Loom>) => {
    try {
      const updated = await api.updateLoom(id, updates);
      // Patch local state only — no full reload, so the table never flickers
      setLooms((prev) => prev.map((l) => (l.id === id ? { ...l, ...updated } : l)));
      flashSaved();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update loom');
      // Revert the failed draft so the table shows the real value again
      setLoomDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const updateDraft = (id: string, patch: Partial<Loom>) => {
    setLoomDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const commitDraft = async (id: string) => {
    const patch = loomDrafts[id];
    if (!patch || Object.keys(patch).length === 0) return;
    setLoomDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    await handleUpdateLoom(id, patch);
  };

  const handleAddLoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createLoom({
        ...newLoom,
        loom_number: Number(newLoom.loom_number),
        specification: Number(newLoom.pick),
        rate: Number(newLoom.rate),
        pick_rate: newLoom.pickRate ? Number(newLoom.pickRate) : undefined,
        name: newLoom.name || `Loom #${newLoom.loom_number.toString().padStart(2, '0')}`,
        is_active: true,
      });
      setNewLoom({
        loom_number: '',
        name: '',
        pick: '',
        pickRate: '',
        rate: '',
        number_line_id: '',
      });
      setShowAddLoomModal(false);
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add loom');
    }
  };

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createWorker({ name: newWorker.name, code: newWorker.code, is_active: true });
      setShowAddWorkerModal(false);
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add worker');
    }
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createNumberLine(newLineName);
      setNewLineName('');
      setShowAddLineModal(false);
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add number line');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) {
      return;
    }
    try {
      await api.updateSettings(settings);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveSuccess(true);
      saveTimer.current = setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save settings');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Master Configuration</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Maintain centrally configured loom specs, workers, number line groupings, and mathematical formulas.
          </p>
        </div>

        {/* Master Tabs */}
        <div className="flex items-center bg-slate-800 border border-slate-700/80 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('looms')}
            className={`flex items-center space-x-1.5 text-xs px-3 py-1.5 rounded transition-colors ${
              activeTab === 'looms' ? 'bg-emerald-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Looms ({looms.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('workers')}
            className={`flex items-center space-x-1.5 text-xs px-3 py-1.5 rounded transition-colors ${
              activeTab === 'workers' ? 'bg-emerald-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Workers ({workers.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('lines')}
            className={`flex items-center space-x-1.5 text-xs px-3 py-1.5 rounded transition-colors ${
              activeTab === 'lines' ? 'bg-emerald-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Lines ({numberLines.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center space-x-1.5 text-xs px-3 py-1.5 rounded transition-colors ${
              activeTab === 'settings' ? 'bg-emerald-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Formulas & Settings</span>
          </button>
        </div>
      </div>

      {/* Notifications — fixed toast so the page never shifts/flickers */}
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
              <span>Saved successfully</span>
            </div>
          )}
        </div>
      )}

      {/* TAB 1: LOOMS MASTER */}
      {activeTab === 'looms' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Loom Master Directory</h3>
              <p className="text-xs text-slate-400">
                Specifications determine meters woven: <code className="text-emerald-400 font-mono">Meter = (Total × 25.4) / Spec</code>. Loom rate determines revenue: <code className="text-emerald-400 font-mono">Rs = Meter × Rate</code>.
              </p>
            </div>
            {(
              <button
                onClick={() => setShowAddLoomModal(true)}
                className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add New Loom</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[11px] uppercase bg-slate-800 text-slate-400 font-semibold border-b border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">Loom #</th>
                  <th className="py-2.5 px-3">Loom Name</th>
                  <th className="py-2.5 px-3">Number Line</th>
                  <th className="py-2.5 px-3 text-right">Pick</th>
                  <th className="py-2.5 px-3 text-right">Pick Rate</th>
                  <th className="py-2.5 px-3 text-right">Rate (₹/meter)</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {looms.map((loom) => {
                  const line = numberLines.find((nl) => nl.id === loom.number_line_id);
                  return (
                    <tr key={loom.id} className="hover:bg-slate-800/40">
                      <td className="py-2 px-3 font-mono font-bold text-emerald-400">
                        #{loom.loom_number.toString().padStart(2, '0')}
                      </td>
                      <td className="py-2 px-3 font-medium text-white">{loom.name}</td>
                      <td className="py-2 px-3 text-slate-400">
                        {line?.name || 'Line 1'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-200">
                        <input
                          type="number"
                          value={loomDrafts[loom.id]?.specification ?? loom.specification}
                          onChange={(e) =>
                            updateDraft(loom.id, { specification: Number(e.target.value) })
                          }
                          onBlur={() => commitDraft(loom.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-right font-mono text-white focus:outline-none focus:border-emerald-500"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-200">
                        <input
                          type="number"
                          step="any"
                          value={loomDrafts[loom.id]?.pick_rate ?? loom.pick_rate ?? ''}
                          placeholder="—"
                          onChange={(e) => {
                            const pickRate = Number(e.target.value);
                            const patch: Partial<Loom> = { pick_rate: pickRate };
                            const spec =
                              loomDrafts[loom.id]?.specification ?? loom.specification;
                            if (pickRate > 0 && spec > 0) {
                              patch.rate = Number(((pickRate * spec) / 100).toFixed(2));
                            }
                            updateDraft(loom.id, patch);
                          }}
                          onBlur={() => commitDraft(loom.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-right font-mono text-white focus:outline-none focus:border-emerald-500"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-emerald-300 font-semibold">
                        <input
                          type="number"
                          step="0.1"
                          value={loomDrafts[loom.id]?.rate ?? loom.rate}
                          onChange={(e) =>
                            updateDraft(loom.id, { rate: Number(e.target.value) })
                          }
                          onBlur={() => commitDraft(loom.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-right font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase ${
                            loom.is_active
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-red-950 text-red-300 border border-red-800'
                          }`}
                        >
                          {loom.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        {(
                          <button
                            onClick={() => handleUpdateLoom(loom.id, { is_active: !loom.is_active })}
                            className="text-xs text-slate-400 hover:text-slate-200 underline"
                          >
                            Toggle Status
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: WORKER MASTER */}
      {activeTab === 'workers' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Worker / Wivar Master Directory</h3>
              <p className="text-xs text-slate-400">
                Configure workers and employee codes.
              </p>
            </div>
            {(
              <button
                onClick={() => setShowAddWorkerModal(true)}
                className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add New Worker</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[11px] uppercase bg-slate-800 text-slate-400 font-semibold border-b border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">Code</th>
                  <th className="py-2.5 px-3">Worker / Wivar Name</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {workers.map((worker) => (
                  <tr key={worker.id} className="hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-mono font-bold text-slate-300">
                      {worker.code}
                    </td>
                    <td className="py-2 px-3 font-semibold text-white">{worker.name}</td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase ${
                          worker.is_active
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-red-950 text-red-300 border border-red-800'
                        }`}
                      >
                        {worker.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {(
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const updated = await api.updateWorker(worker.id, {
                                is_active: !worker.is_active,
                              });
                              setWorkers((prev) =>
                                prev.map((w) => (w.id === worker.id ? { ...w, ...updated } : w)),
                              );
                            } catch (err: any) {
                              setErrorMessage(err.message || 'Failed to update worker');
                            }
                          }}
                          className="text-xs text-slate-400 hover:text-slate-200 underline"
                        >
                          Toggle Status
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: NUMBER LINE MASTER */}
      {activeTab === 'lines' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Number Line Master Directory</h3>
              <p className="text-xs text-slate-400">
                Number lines aggregate assigned looms for production line subtotal reporting.
              </p>
            </div>
            {(
              <button
                onClick={() => setShowAddLineModal(true)}
                className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Number Line</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {numberLines.map((line) => {
              const assignedLooms = looms.filter((l) => l.number_line_id === line.id);
              return (
                <div
                  key={line.id}
                  className="bg-slate-800/70 border border-slate-700/80 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Layers className="w-4 h-4 text-emerald-400" />
                      <h4 className="text-sm font-semibold text-white">{line.name}</h4>
                    </div>
                    <span className="text-xs bg-slate-700 text-slate-300 font-mono px-2 py-0.5 rounded">
                      {assignedLooms.length} Looms
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {assignedLooms.map((l) => (
                      <span
                        key={l.id}
                        className="bg-slate-900 border border-slate-700 text-slate-300 text-[10px] font-mono px-1.5 py-0.5 rounded"
                      >
                        L#{l.loom_number} ({l.specification}p)
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: PRODUCTION SETTINGS & FORMULAS */}
      {activeTab === 'settings' && settings && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-6">
          <div>
            <div className="flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">
                Formula Rules & Calculation Parameters
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Backend calculation engine references these exact rules for all derived values.
            </p>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Average Divisor */}
              <div className="bg-slate-850 bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 space-y-2">
                <label className="text-xs font-semibold text-slate-200 block">
                  Average Divisor (Standard: {looms.length * 2})
                </label>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Formula: <code className="text-amber-300 font-mono">Average = Total ÷ Divisor</code>.
                  {looms.length * 2} represents {looms.length} looms × 2 sides. Can be set to 62 for exception batches noted in Book1.
                </p>
                <div className="flex items-center space-x-2 pt-2">
                  <input
                    type="number"
                    min="1"

                    value={settings.average_divisor}
                    onChange={(e) =>
                      setSettings({ ...settings, average_divisor: Number(e.target.value) })
                    }
                    className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, average_divisor: 76 })}
                    className="text-xs bg-slate-800 border border-slate-700 px-2 py-1 rounded text-slate-300 hover:text-white"
                  >
                    Set 76
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, average_divisor: 62 })}
                    className="text-xs bg-slate-800 border border-slate-700 px-2 py-1 rounded text-slate-300 hover:text-white"
                  >
                    Set 62
                  </button>
                </div>
              </div>

              {/* Maximum Production */}
              <div className="bg-slate-850 bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 space-y-2">
                <label className="text-xs font-semibold text-slate-200 block">
                  Maximum Production (Standard: 152)
                </label>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Formula: <code className="text-purple-300 font-mono">Efficiency % = (Average × 100) ÷ MaxProd</code>.
                  152 represents the maximum potential output capacity baseline.
                </p>
                <div className="pt-2">
                  <input
                    type="number"
                    min="1"

                    value={settings.maximum_production}
                    onChange={(e) =>
                      setSettings({ ...settings, maximum_production: Number(e.target.value) })
                    }
                    className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Meter Conversion Factor */}
              <div className="bg-slate-850 bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 space-y-2">
                <label className="text-xs font-semibold text-slate-200 block">
                  Meter Conversion Factor (Constant: 25.4)
                </label>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Formula: <code className="text-teal-300 font-mono">Meters = (Total × 25.4) ÷ Loom Specification</code>.
                  25.4 mm conversion factor converting loom picks into standard meters.
                </p>
                <div className="pt-2">
                  <input
                    type="number"
                    step="0.1"

                    value={settings.meter_conversion_factor}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        meter_conversion_factor: Number(e.target.value),
                      })
                    }
                    className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Adjustment Amount */}
              <div className="bg-slate-850 bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 space-y-2">
                <label className="text-xs font-semibold text-slate-200 block">
                  Monthly Financial Adjustment Rule (₹)
                </label>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Formula: <code className="text-emerald-300 font-mono">Final Rs = Base Rs + Adjustment (-35000)</code>.
                  Applied to monthly consolidated report revenue as observed in Book1.xlsx.
                </p>
                <div className="pt-2">
                  <input
                    type="number"

                    value={settings.adjustment_amount}
                    onChange={(e) =>
                      setSettings({ ...settings, adjustment_amount: Number(e.target.value) })
                    }
                    className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            {(
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-5 py-2 rounded-lg transition-colors shadow-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Calculation Rules</span>
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Add Loom Modal */}
      {showAddLoomModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-sm font-semibold text-white">Add New Loom</h3>
            <form onSubmit={handleAddLoom} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Loom Number</label>
                <input
                  type="number"
                  value={newLoom.loom_number}
                  onChange={(e) => setNewLoom({ ...newLoom, loom_number: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-white"
                  placeholder="e.g. 39"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Loom Name</label>
                <input
                  type="text"
                  placeholder={newLoom.loom_number ? `Loom #${newLoom.loom_number.toString().padStart(2, '0')}` : 'Auto-generated from Loom Number'}
                  value={newLoom.name}
                  onChange={(e) => setNewLoom({ ...newLoom, name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Pick</label>
                <input
                  type="number"
                  step="any"
                  value={newLoom.pick}
                  onChange={(e) => {
                    const pick = e.target.value;
                    setNewLoom((prev) => {
                      const pickRate = prev.pickRate;
                      const updates = { ...prev, pick };
                      if (pickRate && pick) {
                        updates.rate = ((Number(pickRate) * Number(pick)) / 100).toFixed(2);
                      }
                      return updates;
                    });
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-white"
                  placeholder="e.g. 76"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Pick Rate</label>
                <input
                  type="number"
                  step="any"
                  value={newLoom.pickRate}
                  onChange={(e) => {
                    const pickRate = e.target.value;
                    setNewLoom((prev) => {
                      const pick = prev.pick;
                      const updates = { ...prev, pickRate };
                      if (pick && pickRate) {
                        updates.rate = ((Number(pickRate) * Number(pick)) / 100).toFixed(2);
                      }
                      return updates;
                    });
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-white"
                  placeholder="e.g. 18.5"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Rate (₹/meter) <span className={hintCls}>(auto)</span></label>
                <input
                  type="number"
                  step="0.01"
                  value={newLoom.rate}
                  onChange={(e) => setNewLoom({ ...newLoom, rate: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-white"
                  placeholder="Auto-calculated"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Number Line</label>
                <select
                  value={newLoom.number_line_id}
                  onChange={(e) => setNewLoom({ ...newLoom, number_line_id: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-white"
                >
                  <option value="">Select Number Line</option>
                  {numberLines.map((nl) => (
                    <option key={nl.id} value={nl.id}>
                      {nl.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setNewLoom({
                      loom_number: '',
                      name: '',
                      pick: '',
                      pickRate: '',
                      rate: '',
                      number_line_id: '',
                    });
                    setShowAddLoomModal(false);
                  }}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-emerald-600 text-white font-medium hover:bg-emerald-500"
                >
                  Add Loom
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Worker Modal */}
      {showAddWorkerModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-sm font-semibold text-white">Add New Worker / Wivar</h3>
            <form onSubmit={handleAddWorker} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Worker Name</label>
                <input
                  type="text"
                  required
                  value={newWorker.name}
                  onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Worker Code</label>
                <input
                  type="text"
                  required
                  value={newWorker.code}
                  onChange={(e) => setNewWorker({ ...newWorker, code: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-white"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddWorkerModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-emerald-600 text-white font-medium hover:bg-emerald-500"
                >
                  Add Worker
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Line Modal */}
      {showAddLineModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-sm font-semibold text-white">Add Number Line</h3>
            <form onSubmit={handleAddLine} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Line Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Number Line 5"
                  value={newLineName}
                  onChange={(e) => setNewLineName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-white"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddLineModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-emerald-600 text-white font-medium hover:bg-emerald-500"
                >
                  Add Line
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
