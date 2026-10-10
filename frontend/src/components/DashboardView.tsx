import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Coins,
  Gauge,
  Layers,
  Ruler,
  TrendingUp,
} from 'lucide-react';
import { DailySummary, MonthlySummary, ProductionSettings } from '../types';
import { api } from '../api/client';
import { onSync } from '../utils/sync';

interface DashboardViewProps {
  dailySummary: DailySummary | null;
  monthlySummary: MonthlySummary | null;
  currentDate: string;
  onNavigateTab: (tab: any) => void;
  onSelectDate: (date: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  dailySummary,
  monthlySummary,
  currentDate,
  onNavigateTab,
  onSelectDate,
}) => {
  const [settings, setSettings] = useState<ProductionSettings | null>(null);

  useEffect(() => {
    const reload = () => api.getSettings()
      .then(setSettings)
      .catch((err) => console.error('Failed to load settings:', err));
    void reload();
    return onSync((msg) => { if (msg.type === 'masters') void reload(); });
  }, []);

  if (!dailySummary) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400">
        <Activity className="w-6 h-6 animate-spin mr-2" />
        Loading production dashboard...
      </div>
    );
  }
  // Live calculation parameters — identical fallback logic to the backend
  // (settings.average_divisor, else active looms × 2 sides).
  const divisor =
    settings && settings.average_divisor > 0
      ? settings.average_divisor
      : dailySummary.active_looms * 2;
  const maxProd = settings?.maximum_production ?? 152;
  const factor = settings?.meter_conversion_factor ?? 25.4;

  const kpis = [
    {
      title: 'Shift A Production',
      value: dailySummary.total_shift_a.toLocaleString(),
      subtext: 'Morning Shift',
      icon: Clock,
      color: 'text-sky-400',
      bg: 'bg-sky-950/40 border-sky-800/40',
    },
    {
      title: 'Shift B Production',
      value: dailySummary.total_shift_b.toLocaleString(),
      subtext: 'Night Shift',
      icon: Clock,
      color: 'text-indigo-400',
      bg: 'bg-indigo-950/40 border-indigo-800/40',
    },
    {
      title: 'Daily Total Units',
      value: dailySummary.grand_total.toLocaleString(),
      subtext: 'Shift A + Shift B',
      icon: Activity,
      color: 'text-emerald-400',
      bg: 'bg-emerald-950/40 border-emerald-800/40',
    },
    {
      title: 'Daily Average',
      value: dailySummary.average.toFixed(2),
      // Live divisor from settings — never a stale hardcoded number.
      subtext: `Formula: Total / ${divisor}`,
      icon: Gauge,
      color: 'text-amber-400',
      bg: 'bg-amber-950/40 border-amber-800/40',
    },
    {
      title: 'Efficiency %',
      value: `${dailySummary.percentage.toFixed(1)}%`,
      subtext: `Formula: Avg × 100 / ${maxProd}`,
      icon: TrendingUp,
      color: 'text-purple-400',
      bg: 'bg-purple-950/40 border-purple-800/40',
    },
    {
      title: 'Total Meters Produced',
      value: `${dailySummary.total_meter.toLocaleString()} m`,
      subtext: `Formula: Tot × ${factor} / Spec`,
      icon: Ruler,
      color: 'text-teal-400',
      bg: 'bg-teal-950/40 border-teal-800/40',
    },
    {
      title: 'Revenue (Rs/Day)',
      value: `₹${dailySummary.total_rs.toLocaleString()}`,
      subtext: 'Formula: Meter × Rate',
      icon: Coins,
      color: 'text-emerald-300',
      bg: 'bg-emerald-950/50 border-emerald-800/60',
    },
  ];

  // Lines with zero looms (e.g. an accidental "554" line) carry no production
  // and only confuse the breakdown — hide them, never delete user data.
  const visibleLines = dailySummary.line_summaries.filter((ls) => ls.loom_count > 0);

  // Pristine draft day: genuine zeros, not a sync failure — say so explicitly.
  const isEmptyDay =
    dailySummary.status === 'draft' &&
    dailySummary.grand_total === 0 &&
    dailySummary.total_shift_a === 0 &&
    dailySummary.total_shift_b === 0;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Production Dashboard
            </h2>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${
                dailySummary.status === 'locked'
                  ? 'bg-amber-950 text-amber-300 border-amber-800'
                  : dailySummary.status === 'completed'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                  : 'bg-blue-950 text-blue-300 border-blue-800'
              }`}
            >
              Status: {dailySummary.status.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Displaying live metrics for <strong className="text-slate-200">{dailySummary.date}</strong> across {dailySummary.active_looms} active looms ({dailySummary.total_looms} total).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => onNavigateTab('daily_production')}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            <span>Enter Today's Shifts</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onNavigateTab('worker_entry')}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-4 py-2 rounded-lg border border-slate-700 transition-colors"
          >
            <span>Worker / Wivar</span>
          </button>
        </div>
      </div>

      {/* Empty-day guidance — zeros here mean "no readings yet", not missing data */}
      {isEmptyDay && (
        <div className="bg-amber-950/30 border border-amber-800/60 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-xs text-amber-200">
          <span>
            <strong>No shift readings recorded for {dailySummary.date} yet</strong> — other features
            show data because it belongs to different dates (see the log below). Enter Shift A / B
            values to populate this dashboard.
          </span>
          <button
            onClick={() => onNavigateTab('daily_production')}
            className="shrink-0 sm:ml-auto px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-colors"
          >
            Enter Shifts
          </button>
        </div>
      )}

      {/* 7 Core KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3.5">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className={`p-3.5 rounded-xl border ${kpi.bg} flex flex-col justify-between transition-all hover:scale-[1.02]`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-400">{kpi.title}</span>
                <Icon className={`w-3.5 h-3.5 ${kpi.color}`} />
              </div>
              <div className="mt-2.5">
                <div className="text-lg font-bold text-white tracking-tight">{kpi.value}</div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                  {kpi.subtext}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Two-Column Analytics Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Number Line Breakdown */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">Number Line Breakdown</h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {visibleLines.length} Line{visibleLines.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-3">
            {visibleLines.map((ls) => {
              const pctOfTotal =
                dailySummary.grand_total > 0
                  ? Math.round((ls.total / dailySummary.grand_total) * 100)
                  : 0;

              return (
                <div
                  key={ls.line_id}
                  className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">{ls.line_name}</span>
                    <span className="text-slate-400 font-mono">{ls.loom_count} looms</span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${pctOfTotal}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-1 pt-1 text-[11px] text-slate-300">
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase">Shift A / B</span>
                      <span className="font-mono">{ls.shift_a} / {ls.shift_b}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase">Total Mtr</span>
                      <span className="font-mono text-teal-400">{ls.meter.toFixed(0)}m</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[9px] uppercase">Amount</span>
                      <span className="font-mono font-medium text-emerald-400">₹{ls.rs.toFixed(0)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Daily Production Trend Chart / Recent Days Log */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-white">Monthly Daily Production Log</h3>
            </div>
            {monthlySummary && (
              <span className="text-xs text-slate-400">
                {monthlySummary.month_name} {monthlySummary.year} • {monthlySummary.days_recorded} Days
              </span>
            )}
          </div>

          {monthlySummary && monthlySummary.daily_breakdown.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[11px] uppercase bg-slate-800/80 text-slate-400 font-semibold border-b border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-2">Status</th>
                    <th className="py-2.5 px-2 text-right">Shift A</th>
                    <th className="py-2.5 px-2 text-right">Shift B</th>
                    <th className="py-2.5 px-2 text-right">Day Total</th>
                    <th className="py-2.5 px-2 text-right">Average</th>
                    <th className="py-2.5 px-2 text-right">Eff. %</th>
                    <th className="py-2.5 px-2 text-right">Meters</th>
                    <th className="py-2.5 px-3 text-right">Revenue (Rs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {monthlySummary.daily_breakdown.map((row) => {
                    const isSelected = row.date === currentDate;
                    return (
                      <tr
                        key={row.date}
                        onClick={() => onSelectDate(row.date)}
                        className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
                          isSelected ? 'bg-emerald-950/30 text-white font-medium' : ''
                        }`}
                      >
                        <td className="py-2 px-3 flex items-center space-x-1.5 font-mono whitespace-nowrap">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{row.date}</span>
                        </td>
                        <td className="py-2 px-2">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase ${
                              row.status === 'locked'
                                ? 'bg-amber-950 text-amber-300'
                                : row.status === 'completed'
                                ? 'bg-emerald-950 text-emerald-300'
                                : 'bg-blue-950 text-blue-300'
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-mono">{row.shift_a}</td>
                        <td className="py-2 px-2 text-right font-mono">{row.shift_b}</td>
                        <td className="py-2 px-2 text-right font-mono font-semibold text-white">
                          {row.total}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">{row.average.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right font-mono text-purple-400">
                          {row.percentage.toFixed(1)}%
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-teal-400">
                          {row.meter.toFixed(0)}m
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-400 font-semibold">
                          ₹{row.rs.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-6 text-center">
              No historical production records found for this month.
            </p>
          )}

          {/* Quick formula reference cards at bottom of dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs text-slate-400">
            <div className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/50">
              <span className="text-slate-200 font-semibold block mb-0.5">Average Rule</span>
              <p className="font-mono text-[11px] text-amber-300">
                Average = Total ÷ {divisor}
              </p>
              <span className="text-[10px] text-slate-400">
                (Divisor {divisor} · {dailySummary.active_looms} active × 2 sides)
              </span>
            </div>
            <div className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/50">
              <span className="text-slate-200 font-semibold block mb-0.5">Efficiency % Rule</span>
              <p className="font-mono text-[11px] text-purple-300">
                Percentage = (Avg × 100) ÷ {maxProd}
              </p>
              <span className="text-[10px] text-slate-400">
                ({maxProd} standard max production)
              </span>
            </div>
            <div className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/50">
              <span className="text-slate-200 font-semibold block mb-0.5">Meter & Revenue</span>
              <p className="font-mono text-[11px] text-teal-300">Meter = (Total × {factor}) ÷ Spec</p>
              <span className="text-[10px] text-slate-400">Revenue (Rs) = Meter × Loom Rate</span>
            </div>
          </div>
        </div>
      </div>

      {/* Loom Performance Summary Preview */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">
              All {dailySummary.total_looms} Looms Operational Status ({dailySummary.date})
            </h3>
          </div>
          <button
            onClick={() => onNavigateTab('daily_production')}
            className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
          >
            <span>View Full Table</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Loom Mini Badges Matrix */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
          {dailySummary.rows.map((r) => {
            const hasProduction = r.total > 0;
            const inactive = r.is_active === false;
            return (
              <div
                key={r.loom_id}
                title={
                  inactive
                    ? 'Inactive loom — enable it in Master Setup to resume readings'
                    : undefined
                }
                className={`p-2 rounded-lg border text-center transition-all ${
                  inactive
                    ? 'bg-slate-900/60 border-slate-700/60 opacity-60'
                    : hasProduction
                    ? 'bg-slate-800/80 border-slate-700 hover:border-emerald-500'
                    : 'bg-red-950/20 border-red-900/40 text-red-300'
                }`}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-200">L#{r.loom_number}</span>
                  <span className="text-[9px] text-slate-400 font-mono">
                    {inactive ? 'OFF' : `${r.specification}p`}
                  </span>
                </div>
                <div className="text-sm font-bold font-mono text-emerald-400 mt-1">
                  {r.total > 0 ? r.total : '—'}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                  {r.meter > 0 ? `${r.meter.toFixed(0)}m` : '0m'} • ₹{r.rs.toFixed(0)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
