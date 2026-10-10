import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  CalendarRange,
  Coins,
  Download,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';
import { api } from '../api/client';
import { ModernCalendar } from './ModernCalendar';
import { DailySummary, MonthlySummary, ProductionSettings } from '../types';
import { onSync } from '../utils/sync';

interface ReportsViewProps {
  currentDate: string;
  onExportClick: (options?: { type: 'daily' | 'monthly' | 'range'; date?: string; year?: number; month?: number; fromDate?: string; toDate?: string }) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  currentDate,
  onExportClick,
}) => {
  const [activeReportTab, setActiveReportTab] = useState<'daily' | 'monthly' | 'range'>('monthly');
  const [loading, setLoading] = useState(false);

  // Daily Report state
  const [dailyDate, setDailyDate] = useState(currentDate);
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);

  // Monthly Report state — default to the app's current date (not a hardcoded
  // month), otherwise the tab opens on an empty month and looks broken.
  const [year, setYear] = useState(() => Number(currentDate.slice(0, 4)) || 2026);
  const [month, setMonth] = useState(() => Number(currentDate.slice(5, 7)) || 10);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);

  // Date Range Report state
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(currentDate);
  const [rangeSummary, setRangeSummary] = useState<MonthlySummary | null>(null);

  // Live calculation parameters — same settings every other feature uses.
  const [settings, setSettings] = useState<ProductionSettings | null>(null);
  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => undefined);
  }, []);
  const divisor = settings && settings.average_divisor > 0 ? settings.average_divisor : 76;
  const maxProd = settings?.maximum_production ?? 152;
  const factor = settings?.meter_conversion_factor ?? 25.4;

  const loadDailyReport = async (date: string) => {
    setLoading(true);
    try {
      const summary = await api.getDailySummary(date);
      setDailySummary(summary);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadMonthlyReport = async (y: number, m: number) => {
    setLoading(true);
    try {
      const summary = await api.getMonthlySummary(y, m);
      setMonthlySummary(summary);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadRangeReport = async (from: string, to: string) => {
    setLoading(true);
    try {
      // Server-aggregated with the same settings-driven logic as monthly —
      // single request, divisor/max-production always consistent.
      const summary = await api.getRangeSummary(from, to);
      setRangeSummary(summary);
    } catch (err) {
      console.error(err);
      setRangeSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeReportTab === 'daily') {
      loadDailyReport(dailyDate);
    } else if (activeReportTab === 'monthly') {
      loadMonthlyReport(year, month);
    } else if (activeReportTab === 'range') {
      loadRangeReport(fromDate, toDate);
    }
  }, [activeReportTab, dailyDate, year, month, fromDate, toDate]);
  useEffect(() => onSync(() => {
    void api.getSettings().then(setSettings);
    if (activeReportTab === 'daily') void loadDailyReport(dailyDate);
    else if (activeReportTab === 'monthly') void loadMonthlyReport(year, month);
    else void loadRangeReport(fromDate, toDate);
  }), [activeReportTab, dailyDate, year, month, fromDate, toDate]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Reports & Analytics</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Consolidated daily and monthly production logs, loom aggregations, and financial adjustments.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-800 border border-slate-700/80 p-1 rounded-lg">
          <button
            onClick={() => setActiveReportTab('monthly')}
            className={`flex items-center space-x-1.5 text-xs px-3 py-1.5 rounded transition-colors ${
              activeReportTab === 'monthly'
                ? 'bg-emerald-600 text-white font-medium shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Monthly Consolidated</span>
          </button>
          <button
            onClick={() => setActiveReportTab('daily')}
            className={`flex items-center space-x-1.5 text-xs px-3 py-1.5 rounded transition-colors ${
              activeReportTab === 'daily'
                ? 'bg-emerald-600 text-white font-medium shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Daily Detailed</span>
          </button>
          <button
            onClick={() => setActiveReportTab('range')}
            className={`flex items-center space-x-1.5 text-xs px-3 py-1.5 rounded transition-colors ${
              activeReportTab === 'range'
                ? 'bg-emerald-600 text-white font-medium shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CalendarRange className="w-3.5 h-3.5" />
            <span>Date Range</span>
          </button>
        </div>
      </div>

      {/* TAB 1: MONTHLY REPORT */}
      {activeReportTab === 'monthly' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-end space-x-3">
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
                  Select Month & Year
                </label>
                <div className="flex items-center space-x-2">
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    {[
                      'January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'
                    ].map((name, i) => (
                      <option key={i + 1} value={i + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value={2025}>2025</option>
                    <option value={2026}>2026</option>
                    <option value={2027}>2027</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => onExportClick({ type: 'monthly', year, month })}
                className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Monthly XLSX</span>
              </button>
            </div>
          </div>

          {loading && !monthlySummary && (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
          )}

          {monthlySummary && (
            <>
              {/* Financial & Production KPI Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <span className="text-xs text-slate-400 block">Total Shift A</span>
                  <div className="text-lg font-bold font-mono text-white mt-1">
                    {monthlySummary.total_shift_a.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-slate-400">Shift A output</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <span className="text-xs text-slate-400 block">Total Shift B</span>
                  <div className="text-lg font-bold font-mono text-white mt-1">
                    {monthlySummary.total_shift_b.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-slate-400">Shift B output</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <span className="text-xs text-slate-400 block">Total Unit Production</span>
                  <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                    {monthlySummary.grand_total.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Avg/Day: {monthlySummary.avg_daily_production}
                  </span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <span className="text-xs text-slate-400 block">Total Meters Woven</span>
                  <div className="text-lg font-bold font-mono text-teal-300 mt-1">
                    {monthlySummary.total_meter.toLocaleString()} m
                  </div>
                  <span className="text-[10px] text-slate-400">Converted @ {factor}/spec</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <span className="text-xs text-slate-400 block">Base Revenue</span>
                  <div className="text-lg font-bold font-mono text-slate-200 mt-1">
                    ₹{monthlySummary.base_rs.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-slate-400">Sum of (Meter × Rate)</span>
                </div>
                <div className="bg-slate-900 border border-emerald-900/60 p-4 rounded-xl bg-emerald-950/20">
                  <span className="text-xs text-emerald-300 block font-semibold">Net Adjusted Rs</span>
                  <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                    ₹{monthlySummary.final_adjusted_rs.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-emerald-500 font-mono">
                    Adj: {monthlySummary.adjustment_amount}
                  </span>
                </div>
              </div>

              {/* Adjustment Rule Explanation Banner */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between text-xs text-slate-300 gap-2">
                <div className="flex items-center space-x-2">
                  <Coins className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>Historical Calculation Rule:</strong> Base Revenue ₹{monthlySummary.base_rs.toLocaleString()} + Adjustment ({monthlySummary.adjustment_amount}) = <strong>Final Net ₹{monthlySummary.final_adjusted_rs.toLocaleString()}</strong>.
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  {monthlySummary.days_recorded} Recorded Days in {monthlySummary.month_name}
                </span>
              </div>

              {/* Daily Breakdown Log */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold text-white">Daily Production Summary Log</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[11px] uppercase bg-slate-800 text-slate-400 font-semibold border-b border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-2">Status</th>
                        <th className="py-2.5 px-2 text-right">Shift A</th>
                        <th className="py-2.5 px-2 text-right">Shift B</th>
                        <th className="py-2.5 px-2 text-right">Day Total</th>
                        <th className="py-2.5 px-2 text-right">Average (÷{divisor})</th>
                        <th className="py-2.5 px-2 text-right">Efficiency %</th>
                        <th className="py-2.5 px-2 text-right">Meters</th>
                        <th className="py-2.5 px-3 text-right">Revenue (Rs)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {monthlySummary.daily_breakdown.map((d) => (
                        <tr key={d.date} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono font-medium text-white whitespace-nowrap">{d.date}</td>
                          <td className="py-2 px-2 uppercase font-mono text-[10px] text-slate-400">{d.status}</td>
                          <td className="py-2 px-2 text-right font-mono">{d.shift_a}</td>
                          <td className="py-2 px-2 text-right font-mono">{d.shift_b}</td>
                          <td className="py-2 px-2 text-right font-mono font-bold text-white">{d.total}</td>
                          <td className="py-2 px-2 text-right font-mono text-amber-300">{d.average.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right font-mono text-purple-300">{d.percentage.toFixed(1)}%</td>
                          <td className="py-2 px-2 text-right font-mono text-teal-300">{d.meter.toFixed(0)}m</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">₹{d.rs.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-950 font-bold text-white border-t border-slate-700">
                      <tr>
                        <td colSpan={2} className="py-2.5 px-3 uppercase text-emerald-400">Total Month Output</td>
                        <td className="py-2.5 px-2 text-right font-mono">{monthlySummary.total_shift_a}</td>
                        <td className="py-2.5 px-2 text-right font-mono">{monthlySummary.total_shift_b}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-white">{monthlySummary.grand_total}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-amber-300">{monthlySummary.avg_daily_production} (Avg/Day)</td>
                        <td className="py-2.5 px-2 text-right font-mono text-purple-300">{monthlySummary.overall_percentage}%</td>
                        <td className="py-2.5 px-2 text-right font-mono text-teal-300">{monthlySummary.total_meter}m</td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-400 text-sm">₹{monthlySummary.base_rs.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Number Line Monthly Summary */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold text-white">Number Line Monthly Aggregation</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {monthlySummary.number_line_breakdown.filter((nl) => nl.loom_count > 0).map((nl) => (
                    <div key={nl.line_id} className="bg-slate-800/70 border border-slate-700/80 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">{nl.line_name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{nl.loom_count} Looms</span>
                      </div>
                      <div className="pt-1 space-y-1 text-xs font-mono">
                        <div className="flex justify-between text-slate-300">
                          <span className="text-slate-400">Total Production:</span>
                          <span className="font-bold text-white">{nl.total}</span>
                        </div>
                        <div className="flex justify-between text-teal-300">
                          <span className="text-slate-400">Total Meters:</span>
                          <span>{nl.meter.toFixed(0)}m</span>
                        </div>
                        <div className="flex justify-between text-emerald-400 font-bold pt-1 border-t border-slate-700">
                          <span className="text-slate-400 font-normal">Revenue:</span>
                          <span>₹{nl.rs.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Worker Wages Monthly Summary */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold text-white">Worker / Wivar Monthly Wages Summary</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[11px] uppercase bg-slate-800 text-slate-400 font-semibold border-b border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3">Worker Code</th>
                        <th className="py-2.5 px-3">Worker Name</th>
                        <th className="py-2.5 px-3 text-right">Active Assignment Days</th>
                        <th className="py-2.5 px-3 text-right">Total Meters Woven</th>
                        <th className="py-2.5 px-3 text-right font-bold text-emerald-400">Total Wages Payable (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {monthlySummary.worker_breakdown.map((w) => (
                        <tr key={w.worker_id} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono font-semibold text-slate-300">{w.worker_code}</td>
                          <td className="py-2 px-3 font-medium text-white">{w.worker_name}</td>
                          <td className="py-2 px-3 text-right font-mono">{w.assigned_days_count} days</td>
                          <td className="py-2 px-3 text-right font-mono text-teal-300">{w.total_meters.toFixed(1)}m</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                            ₹{w.total_wages.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: DAILY DETAILED REPORT */}
      {activeReportTab === 'daily' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-end space-x-3">
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
                  Report Date
                </label>
                <ModernCalendar
                  value={dailyDate}
                  onChange={setDailyDate}
                  triggerClassName="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-600"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => onExportClick({ type: 'daily', date: dailyDate })}
                className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Daily XLSX</span>
              </button>
            </div>
          </div>

          {loading && !dailySummary && (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
          )}

          {dailySummary && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white">Daily Production Detailed Audit Report</h3>
                  <p className="text-xs text-slate-400">
                    Date: <strong className="text-white font-mono">{dailySummary.date}</strong> • Status:{' '}
                    <span className="uppercase text-emerald-400 font-semibold">{dailySummary.status}</span>
                  </p>
                </div>
                <div className="text-right text-xs font-mono">
                  <span className="text-slate-400 block">Grand Total Output:</span>
                  <span className="text-lg font-bold text-emerald-400">{dailySummary.grand_total} units</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-[11px] uppercase bg-slate-800 text-slate-400 font-semibold border-b border-slate-700">
                    <tr>
                      <th className="py-2 px-2">Loom</th>
                      <th className="py-2 px-2">Line</th>
                      <th className="py-2 px-2 text-right">Spec</th>
                      <th className="py-2 px-2 text-right">Rate</th>
                      <th className="py-2 px-2 text-right">Shift A</th>
                      <th className="py-2 px-2 text-right">Shift B</th>
                      <th className="py-2 px-2 text-right">Total</th>
                      <th className="py-2 px-2 text-right">Average</th>
                      <th className="py-2 px-2 text-right">Eff. %</th>
                      <th className="py-2 px-2 text-right">Meters</th>
                      <th className="py-2 px-2 text-right">Rs/Day</th>
                      <th className="py-2 px-3">Worker</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300 font-mono">
                    {dailySummary.rows.map((r) => (
                      <tr key={r.loom_id} className="hover:bg-slate-800/40">
                        <td className="py-1.5 px-2 font-bold text-white">#{r.loom_number.toString().padStart(2, '0')}</td>
                        <td className="py-1.5 px-2 text-slate-400">{r.number_line_name.split(' ')[0]}</td>
                        <td className="py-1.5 px-2 text-right">{r.specification}</td>
                        <td className="py-1.5 px-2 text-right">₹{r.rate.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-right">{r.shift_a}</td>
                        <td className="py-1.5 px-2 text-right">{r.shift_b}</td>
                        <td className="py-1.5 px-2 text-right font-bold text-white">{r.total}</td>
                        <td className="py-1.5 px-2 text-right text-amber-300">{r.average.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-right text-purple-300">{r.percentage.toFixed(1)}%</td>
                        <td className="py-1.5 px-2 text-right text-teal-300">{r.meter.toFixed(1)}m</td>
                        <td className="py-1.5 px-2 text-right font-bold text-emerald-400">₹{r.rs.toFixed(0)}</td>
                        <td className="py-1.5 px-3 text-slate-300 font-sans">{r.worker_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-950 font-bold text-white border-t border-slate-700">
                    <tr>
                      <td colSpan={4} className="py-3 px-2 uppercase text-emerald-400">Daily Grand Totals</td>
                      <td className="py-3 px-2 text-right font-mono">{dailySummary.total_shift_a}</td>
                      <td className="py-3 px-2 text-right font-mono">{dailySummary.total_shift_b}</td>
                      <td className="py-3 px-2 text-right font-mono text-white text-sm">{dailySummary.grand_total}</td>
                      <td className="py-3 px-2 text-right font-mono text-amber-300">{dailySummary.average.toFixed(2)}</td>
                      <td className="py-3 px-2 text-right font-mono text-purple-300">{dailySummary.percentage.toFixed(1)}%</td>
                      <td className="py-3 px-2 text-right font-mono text-teal-300">{dailySummary.total_meter.toFixed(1)}m</td>
                      <td className="py-3 px-2 text-right font-mono text-emerald-400 text-sm">₹{dailySummary.total_rs.toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DATE RANGE REPORT */}
      {activeReportTab === 'range' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-end space-x-3">
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
                  From Date
                </label>
                <ModernCalendar
                  value={fromDate}
                  onChange={setFromDate}
                  maxDate={toDate}
                  triggerClassName="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-600"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
                  To Date
                </label>
                <ModernCalendar
                  value={toDate}
                  onChange={setToDate}
                  minDate={fromDate}
                  maxDate={currentDate}
                  triggerClassName="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-600"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => onExportClick({ type: 'range', fromDate, toDate })}
                disabled={loading || !rangeSummary}
                className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Range XLSX</span>
              </button>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
          )}

          {!loading && !rangeSummary && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
              <CalendarRange className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-300 font-medium">No production data in this range</p>
              <p className="text-xs text-slate-500 mt-1">
                Pick a different From / To date, or enter shifts in Daily Production first.
              </p>
            </div>
          )}

          {rangeSummary && (
            <>
              {/* Financial & Production KPI Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <span className="text-xs text-slate-400 block">Total Shift A</span>
                  <div className="text-lg font-bold font-mono text-white mt-1">
                    {rangeSummary.total_shift_a.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-slate-400">Shift A output</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <span className="text-xs text-slate-400 block">Total Shift B</span>
                  <div className="text-lg font-bold font-mono text-white mt-1">
                    {rangeSummary.total_shift_b.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-slate-400">Shift B output</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <span className="text-xs text-slate-400 block">Total Unit Production</span>
                  <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                    {rangeSummary.grand_total.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Avg/Day: {rangeSummary.avg_daily_production}
                  </span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <span className="text-xs text-slate-400 block">Total Meters Woven</span>
                  <div className="text-lg font-bold font-mono text-teal-300 mt-1">
                    {rangeSummary.total_meter.toLocaleString()} m
                  </div>
                  <span className="text-[10px] text-slate-400">Converted @ {factor}/spec</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <span className="text-xs text-slate-400 block">Base Revenue</span>
                  <div className="text-lg font-bold font-mono text-slate-200 mt-1">
                    ₹{rangeSummary.base_rs.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-slate-400">Sum of (Meter × Rate)</span>
                </div>
                <div className="bg-slate-900 border border-emerald-900/60 p-4 rounded-xl bg-emerald-950/20">
                  <span className="text-xs text-emerald-300 block font-semibold">Net Adjusted Rs</span>
                  <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                    ₹{rangeSummary.final_adjusted_rs.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-emerald-500 font-mono">
                    Adj: {rangeSummary.adjustment_amount}
                  </span>
                </div>
              </div>

              {/* Period Info Banner */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between text-xs text-slate-300 gap-2">
                <div className="flex items-center space-x-2">
                  <CalendarRange className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>Period:</strong> {rangeSummary.month_name} • {rangeSummary.days_recorded} Recorded Days
                  </span>
                </div>
              </div>

              {/* Daily Breakdown Log */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold text-white">Daily Production Summary Log</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[11px] uppercase bg-slate-800 text-slate-400 font-semibold border-b border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-2">Status</th>
                        <th className="py-2.5 px-2 text-right">Shift A</th>
                        <th className="py-2.5 px-2 text-right">Shift B</th>
                        <th className="py-2.5 px-2 text-right">Day Total</th>
                        <th className="py-2.5 px-2 text-right">Average (÷{divisor})</th>
                        <th className="py-2.5 px-2 text-right">Efficiency %</th>
                        <th className="py-2.5 px-2 text-right">Meters</th>
                        <th className="py-2.5 px-3 text-right">Revenue (Rs)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {rangeSummary.daily_breakdown.map((d) => (
                        <tr key={d.date} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono font-medium text-white whitespace-nowrap">{d.date}</td>
                          <td className="py-2 px-2 uppercase font-mono text-[10px] text-slate-400">{d.status}</td>
                          <td className="py-2 px-2 text-right font-mono">{d.shift_a}</td>
                          <td className="py-2 px-2 text-right font-mono">{d.shift_b}</td>
                          <td className="py-2 px-2 text-right font-mono font-bold text-white">{d.total}</td>
                          <td className="py-2 px-2 text-right font-mono text-amber-300">{d.average.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right font-mono text-purple-300">{d.percentage.toFixed(1)}%</td>
                          <td className="py-2 px-2 text-right font-mono text-teal-300">{d.meter.toFixed(0)}m</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">₹{d.rs.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-950 font-bold text-white border-t border-slate-700">
                      <tr>
                        <td colSpan={2} className="py-2.5 px-3 uppercase text-emerald-400">Total Range Output</td>
                        <td className="py-2.5 px-2 text-right font-mono">{rangeSummary.total_shift_a}</td>
                        <td className="py-2.5 px-2 text-right font-mono">{rangeSummary.total_shift_b}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-white">{rangeSummary.grand_total}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-amber-300">{rangeSummary.avg_daily_production} (Avg/Day)</td>
                        <td className="py-2.5 px-2 text-right font-mono text-purple-300">{rangeSummary.overall_percentage}%</td>
                        <td className="py-2.5 px-2 text-right font-mono text-teal-300">{rangeSummary.total_meter}m</td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-400 text-sm">₹{rangeSummary.base_rs.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Number Line Range Summary */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold text-white">Number Line Aggregation</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {rangeSummary.number_line_breakdown.filter((nl) => nl.loom_count > 0).map((nl) => (
                    <div key={nl.line_id} className="bg-slate-800/70 border border-slate-700/80 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">{nl.line_name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{nl.loom_count} Looms</span>
                      </div>
                      <div className="pt-1 space-y-1 text-xs font-mono">
                        <div className="flex justify-between text-slate-300">
                          <span className="text-slate-400">Total Production:</span>
                          <span className="font-bold text-white">{nl.total}</span>
                        </div>
                        <div className="flex justify-between text-teal-300">
                          <span className="text-slate-400">Total Meters:</span>
                          <span>{nl.meter.toFixed(0)}m</span>
                        </div>
                        <div className="flex justify-between text-emerald-400 font-bold pt-1 border-t border-slate-700">
                          <span className="text-slate-400 font-normal">Revenue:</span>
                          <span>₹{nl.rs.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Worker Wages Range Summary */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold text-white">Worker / Wivar Wages Summary</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[11px] uppercase bg-slate-800 text-slate-400 font-semibold border-b border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3">Worker Code</th>
                        <th className="py-2.5 px-3">Worker Name</th>
                        <th className="py-2.5 px-3 text-right">Active Assignment Days</th>
                        <th className="py-2.5 px-3 text-right">Total Meters Woven</th>
                        <th className="py-2.5 px-3 text-right font-bold text-emerald-400">Total Wages Payable (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {rangeSummary.worker_breakdown.map((w) => (
                        <tr key={w.worker_id} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono font-semibold text-slate-300">{w.worker_code}</td>
                          <td className="py-2 px-3 font-medium text-white">{w.worker_name}</td>
                          <td className="py-2 px-3 text-right font-mono">{w.assigned_days_count} days</td>
                          <td className="py-2 px-3 text-right font-mono text-teal-300">{w.total_meters.toFixed(1)}m</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                            ₹{w.total_wages.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Loom Breakdown Range Summary */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold text-white">Loom-wise Aggregation</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[11px] uppercase bg-slate-800 text-slate-400 font-semibold border-b border-slate-700">
                      <tr>
                        <th className="py-2 px-2">Loom</th>
                        <th className="py-2 px-2">Line</th>
                        <th className="py-2 px-2 text-right">Spec</th>
                        <th className="py-2 px-2 text-right">Rate</th>
                        <th className="py-2 px-2 text-right">Shift A</th>
                        <th className="py-2 px-2 text-right">Shift B</th>
                        <th className="py-2 px-2 text-right">Total</th>
                        <th className="py-2 px-2 text-right">Average</th>
                        <th className="py-2 px-2 text-right">Eff. %</th>
                        <th className="py-2 px-2 text-right">Meters</th>
                        <th className="py-2 px-2 text-right">Rs</th>
                        <th className="py-2 px-3">Worker</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300 font-mono">
                      {rangeSummary.loom_breakdown.map((r) => (
                        <tr key={r.loom_id} className="hover:bg-slate-800/40">
                          <td className="py-1.5 px-2 font-bold text-white">#{r.loom_number.toString().padStart(2, '0')}</td>
                          <td className="py-1.5 px-2 text-slate-400">{r.number_line_name.split(' ')[0]}</td>
                          <td className="py-1.5 px-2 text-right">{r.specification}</td>
                          <td className="py-1.5 px-2 text-right">₹{r.rate.toFixed(2)}</td>
                          <td className="py-1.5 px-2 text-right">{r.shift_a}</td>
                          <td className="py-1.5 px-2 text-right">{r.shift_b}</td>
                          <td className="py-1.5 px-2 text-right font-bold text-white">{r.total}</td>
                          <td className="py-1.5 px-2 text-right text-amber-300">{(r.total / divisor).toFixed(2)}</td>
                          <td className="py-1.5 px-2 text-right text-purple-300">{(r.total / divisor / maxProd * 100).toFixed(1)}%</td>
                          <td className="py-1.5 px-2 text-right text-teal-300">{r.meter.toFixed(1)}m</td>
                          <td className="py-1.5 px-2 text-right font-bold text-emerald-400">₹{r.rs.toFixed(0)}</td>
                          <td className="py-1.5 px-3 text-slate-300 font-sans">—</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
};
