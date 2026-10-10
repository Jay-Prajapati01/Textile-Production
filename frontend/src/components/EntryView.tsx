import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, RotateCcw, Save } from 'lucide-react';
import { MachineOption, RolledOffEntry, SubmittedEntry } from '../types';
import { ModernCalendar } from './ModernCalendar';
import { useToast } from './Toast';

interface EntryViewProps {
  machines: MachineOption[];
  onSubmitFirstEntry: (
    entry: Omit<SubmittedEntry, 'id' | 'submittedAt' | 'entryType'>
  ) => Promise<void> | void;
  onSubmitRolledOffEntry: (
    entry: Omit<RolledOffEntry, 'id' | 'submittedAt' | 'entryType'>
  ) => Promise<void> | void;
  onRefreshData?: () => void;
}

const labelCls = 'block text-xs font-bold text-slate-400 uppercase tracking-wider';
const hintCls = 'normal-case font-normal opacity-60';
const inputCls =
  'w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500 transition-colors';
const numericCls = `${inputCls} font-mono`;
const readonlyCls =
  'w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 font-mono cursor-not-allowed focus:outline-none';
const dateCls =
  'w-full flex items-center justify-between px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 hover:border-blue-500 transition-colors';

export default function EntryView({
  machines,
  onSubmitFirstEntry,
  onSubmitRolledOffEntry,
  onRefreshData,
}: EntryViewProps) {
  const { toast } = useToast();
  const [activeEntryType, setActiveEntryType] = useState<'entry' | 'rolled-off'>(
    'entry'
  );

  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const [firstEntryData, setFirstEntryData] = useState({
    machineNumber: '',
    sortNumber: '',
    productionNumber: '',
    flangeNumber: '',
    batchNumber: '',
    beamMeter: '',
    beamNetWeight: '',
    startedDate: '',
    finishedDate: '',
  });

  const [rolledOffData, setRolledOffData] = useState({
    machineNumber: '',
    rollDoffDate: '',
    meters: '',
    weight: '',
  });

  const glm = useMemo(() => {
    const meter = parseFloat(firstEntryData.beamMeter);
    const weight = parseFloat(firstEntryData.beamNetWeight);
    if (!isNaN(meter) && !isNaN(weight) && meter > 0) {
      return (weight / meter).toFixed(4);
    }
    return '';
  }, [firstEntryData.beamMeter, firstEntryData.beamNetWeight]);

  const calculatedGlm = useMemo(() => {
    const meters = parseFloat(rolledOffData.meters);
    const weight = parseFloat(rolledOffData.weight);
    if (!isNaN(meters) && !isNaN(weight) && meters > 0) {
      return (weight / meters).toFixed(4);
    }
    return '';
  }, [rolledOffData.meters, rolledOffData.weight]);

  const handleFirstEntryChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFirstEntryData({ ...firstEntryData, [e.target.name]: e.target.value });
  };

  const handleRolledOffChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setRolledOffData({ ...rolledOffData, [e.target.name]: e.target.value });
  };

  const handleResetFirstEntry = () => {
    setFirstEntryData({
      machineNumber: '',
      sortNumber: '',
      productionNumber: '',
      flangeNumber: '',
      batchNumber: '',
      beamMeter: '',
      beamNetWeight: '',
      startedDate: '',
      finishedDate: '',
    });
  };

  const handleResetRolledOff = () => {
    setRolledOffData({
      machineNumber: '',
      rollDoffDate: '',
      meters: '',
      weight: '',
    });
  };

  const handleSubmitFirstEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstEntryData.startedDate) {
      toast('Started Date is required', 'error');
      return;
    }
    const meter = parseFloat(firstEntryData.beamMeter);
    const weight = parseFloat(firstEntryData.beamNetWeight);
    const calculated = !isNaN(meter) && !isNaN(weight) && meter > 0 ? weight / meter : 0;

    try {
      await onSubmitFirstEntry({
        machineNumber: firstEntryData.machineNumber,
        sortNumber: firstEntryData.sortNumber,
        productionNumber: firstEntryData.productionNumber,
        flangeNumber: firstEntryData.flangeNumber,
        batchNumber: firstEntryData.batchNumber,
        beamMeter: meter,
        beamNetWeight: weight,
        glm: calculated,
        startedDate: firstEntryData.startedDate,
        finishedDate: firstEntryData.finishedDate,
      });

      toast('First entry submitted successfully!', 'success');
      handleResetFirstEntry();
      onRefreshData?.();
    } catch (err: any) {
      toast(err?.message || 'Failed to submit entry', 'error');
    }
  };

  const handleSubmitRolledOff = async (e: React.FormEvent) => {
    e.preventDefault();
    const meters = parseFloat(rolledOffData.meters);
    const weight = parseFloat(rolledOffData.weight);
    const calculated = !isNaN(meters) && !isNaN(weight) && meters > 0 ? weight / meters : 0;

    try {
      await onSubmitRolledOffEntry({
        machineNumber: rolledOffData.machineNumber,
        rollDoffDate: rolledOffData.rollDoffDate || today,
        meters: meters,
        glmFabric: calculated,
        weight: weight,
      });

      toast('Rolled Off entry submitted successfully!', 'success');
      handleResetRolledOff();
    } catch (err: any) {
      toast(err?.message || 'Failed to submit entry', 'error');
    }
  };

  return (
    <div className="space-y-6" id="entry-view">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-50 font-display tracking-tight">
            {activeEntryType === 'entry' ? 'Entry' : 'Rolled Off Entry'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            {activeEntryType === 'entry'
              ? 'Log new fabric roll production data'
              : 'Log roll doff data with auto-calculated GLM'}
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveEntryType('entry')}
            className={`px-3 sm:px-5 py-2 rounded-md text-xs sm:text-sm font-semibold transition-all duration-200 ${
              activeEntryType === 'entry'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/60'
            }`}
          >
            Entry
          </button>
          <button
            type="button"
            onClick={() => setActiveEntryType('rolled-off')}
            className={`flex items-center gap-1.5 px-3 sm:px-5 py-2 rounded-md text-xs sm:text-sm font-semibold transition-all duration-200 ${
              activeEntryType === 'rolled-off'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/60'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Rolled Off Entry</span>
            <span className="sm:hidden">Rolled Off</span>
          </button>
        </div>
      </div>

      {activeEntryType === 'entry' && (
        <form
          onSubmit={handleSubmitFirstEntry}
          className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm p-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label htmlFor="first-machineNumber" className={labelCls}>
                Machine Number
              </label>
              <select
                id="first-machineNumber"
                name="machineNumber"
                value={firstEntryData.machineNumber}
                onChange={handleFirstEntryChange}
                required
                className={inputCls}
              >
                <option value="">Select Machine</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id} className="bg-slate-800 text-slate-100">
                    {m.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="first-startedDate" className={labelCls}>
                Started Date
              </label>
              <ModernCalendar
                value={firstEntryData.startedDate}
                onChange={(d) => setFirstEntryData({ ...firstEntryData, startedDate: d })}
                maxDate={today}
                triggerClassName={dateCls}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="first-finishedDate" className={labelCls}>
                Finished Date <span className={hintCls}>(optional)</span>
              </label>
              <ModernCalendar
                value={firstEntryData.finishedDate}
                onChange={(d) => setFirstEntryData({ ...firstEntryData, finishedDate: d })}
                maxDate={today}
                allowClear
                triggerClassName={dateCls}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="first-sortNumber" className={labelCls}>
                Sort Number
              </label>
              <input
                id="first-sortNumber"
                type="text"
                name="sortNumber"
                value={firstEntryData.sortNumber}
                onChange={handleFirstEntryChange}
                required
                placeholder="e.g. S-12"
                className={inputCls}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="first-productionNumber" className={labelCls}>
                Production Number
              </label>
              <input
                id="first-productionNumber"
                type="text"
                name="productionNumber"
                value={firstEntryData.productionNumber}
                onChange={handleFirstEntryChange}
                required
                placeholder="e.g. PRD-2024-001"
                className={inputCls}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="first-flangeNumber" className={labelCls}>
                Flange Number
              </label>
              <input
                id="first-flangeNumber"
                type="text"
                name="flangeNumber"
                value={firstEntryData.flangeNumber}
                onChange={handleFirstEntryChange}
                required
                placeholder="e.g. FL-05"
                className={inputCls}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="first-batchNumber" className={labelCls}>
                Batch Number
              </label>
              <input
                id="first-batchNumber"
                type="text"
                name="batchNumber"
                value={firstEntryData.batchNumber}
                onChange={handleFirstEntryChange}
                required
                placeholder="e.g. B-03"
                className={inputCls}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="first-beamMeter" className={labelCls}>
                Beam Meter
              </label>
              <input
                id="first-beamMeter"
                type="number"
                name="beamMeter"
                value={firstEntryData.beamMeter}
                onChange={handleFirstEntryChange}
                required
                min="0"
                step="any"
                placeholder="0.0"
                className={numericCls}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="first-beamNetWeight" className={labelCls}>
                Beam Net Weight
              </label>
              <input
                id="first-beamNetWeight"
                type="number"
                name="beamNetWeight"
                value={firstEntryData.beamNetWeight}
                onChange={handleFirstEntryChange}
                required
                min="0"
                step="any"
                placeholder="0.0"
                className={numericCls}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="first-glm" className={labelCls}>
                Grams per Linear Meter (GLM) <span className={hintCls}>(auto)</span>
              </label>
              <input
                id="first-glm"
                type="text"
                value={glm}
                readOnly
                placeholder="—"
                aria-readonly="true"
                className={readonlyCls}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={handleResetFirstEntry}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              <Save className="w-4 h-4" />
              Submit Entry
            </button>
          </div>
        </form>
      )}

      {activeEntryType === 'rolled-off' && (
        <form
          onSubmit={handleSubmitRolledOff}
          className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm p-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label htmlFor="rolledDoffDate" className={labelCls}>
                Roll Doff Date <span className={hintCls}>(optional)</span>
              </label>
              <ModernCalendar
                value={rolledOffData.rollDoffDate}
                onChange={(d) => setRolledOffData({ ...rolledOffData, rollDoffDate: d })}
                maxDate={today}
                allowClear
                triggerClassName={dateCls}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="rolled-machineNumber" className={labelCls}>
                Machine Number
              </label>
              <select
                id="rolled-machineNumber"
                name="machineNumber"
                value={rolledOffData.machineNumber}
                onChange={handleRolledOffChange}
                required
                className={inputCls}
              >
                <option value="">Select Machine</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id} className="bg-slate-800 text-slate-100">
                    {m.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="rolled-meters" className={labelCls}>
                Meters
              </label>
              <input
                id="rolled-meters"
                type="number"
                name="meters"
                value={rolledOffData.meters}
                onChange={handleRolledOffChange}
                required
                min="0"
                step="any"
                placeholder="0.0"
                className={numericCls}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="rolled-weight" className={labelCls}>
                Weight (kg)
              </label>
              <input
                id="rolled-weight"
                type="number"
                name="weight"
                value={rolledOffData.weight}
                onChange={handleRolledOffChange}
                required
                min="0"
                step="any"
                placeholder="0.0"
                className={numericCls}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label htmlFor="rolled-glmFabric" className={labelCls}>
                GLM Fabric <span className={hintCls}>(auto: Weight ÷ Meters)</span>
              </label>
              <input
                id="rolled-glmFabric"
                type="text"
                value={calculatedGlm}
                readOnly
                placeholder="—"
                aria-readonly="true"
                className={readonlyCls}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={handleResetRolledOff}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              <Save className="w-4 h-4" />
              Submit Entry
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
