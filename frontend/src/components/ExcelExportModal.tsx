import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CalendarRange,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { Logo } from './Logo';
import { ModernCalendar } from './ModernCalendar';

type ExportKind = 'daily' | 'monthly' | 'range';

interface ExcelExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDate: string;
  initialOptions?: {
    type?: ExportKind;
    date?: string;
    year?: number;
    month?: number;
    fromDate?: string;
    toDate?: string;
  };
}

export const ExcelExportModal: React.FC<ExcelExportModalProps> = ({
  isOpen,
  onClose,
  currentDate,
  initialOptions,
}) => {
  const [exportType, setExportType] = useState<ExportKind>(
    initialOptions?.type || 'daily'
  );
  const [date, setDate] = useState(initialOptions?.date || currentDate);
  const [year, setYear] = useState(initialOptions?.year || 2026);
  const [month, setMonth] = useState(initialOptions?.month || 9);
  const [fromDate, setFromDate] = useState(initialOptions?.fromDate || currentDate);
  const [toDate, setToDate] = useState(initialOptions?.toDate || currentDate);
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The modal stays mounted while closed, so re-seed its form every time it
  // opens — otherwise a Range export opened after a Daily one would still
  // show (and download) the stale Daily selection.
  useEffect(() => {
    if (!isOpen) return;
    setExportType(initialOptions?.type || 'daily');
    setDate(initialOptions?.date || currentDate);
    setYear(initialOptions?.year || Number(currentDate.slice(0, 4)) || 2026);
    setMonth(initialOptions?.month || Number(currentDate.slice(5, 7)) || 10);
    setFromDate(initialOptions?.fromDate || currentDate);
    setToDate(initialOptions?.toDate || currentDate);
    setError(null);
    setDownloadSuccess(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    setDownloadSuccess(false);

    try {
      const blob = await api.exportExcel({
        type: exportType,
        date: exportType === 'daily' ? date : undefined,
        year: exportType === 'monthly' ? year : undefined,
        month: exportType === 'monthly' ? month : undefined,
        fromDate: exportType === 'range' ? fromDate : undefined,
        toDate: exportType === 'range' ? toDate : undefined,
      });

      // Trigger browser download
      const filename =
        exportType === 'monthly'
          ? `Loom_Monthly_Production_${year}_${month}.xlsx`
          : exportType === 'range'
          ? `Loom_Range_Production_${fromDate}_to_${toDate}.xlsx`
          : `Loom_Daily_Production_${date}.xlsx`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setDownloadSuccess(true);
      setTimeout(() => {
        setDownloadSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to download Excel file');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-4 sm:p-6 my-4 sm:my-8 space-y-4 sm:space-y-5 shadow-2xl relative max-h-[calc(100vh-2rem)] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3">
          <Logo size={40} className="shrink-0" />
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Export Excel Workbook (Book1 Structure)
            </h3>
            <p className="text-xs text-slate-400">
              Generate native .XLSX spreadsheets conforming to reference layout.
            </p>
          </div>
        </div>

        {/* Export Type Selector */}
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={() => setExportType('daily')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              exportType === 'daily'
                ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-sm'
                : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Daily Production Sheet</span>
              <Calendar className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Includes all looms, Shift A & B, Total, Average, %, Meter, Rs & Number Lines.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setExportType('monthly')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              exportType === 'monthly'
                ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-sm'
                : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Monthly Consolidated</span>
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Multi-sheet: Monthly Overview, Loom breakdown, Number Lines, Worker Wages & Adjustments.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setExportType('range')}
            className={`p-3.5 rounded-xl border text-left transition-all min-[420px]:col-span-2 ${
              exportType === 'range'
                ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-sm'
                : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Custom Date Range</span>
              <CalendarRange className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Same multi-sheet workbook aggregated over any From → To period.
            </p>
          </button>
        </div>

        {/* Parameters */}
        <div className="bg-slate-850 bg-slate-800/50 border border-slate-700/60 rounded-xl p-4 space-y-3">
          {exportType === 'daily' ? (
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Select Production Date
              </label>
              <ModernCalendar
                value={date}
                onChange={setDate}
                triggerClassName="w-full justify-between bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 hover:border-emerald-500 focus:outline-none transition-colors"
              />
            </div>
          ) : exportType === 'range' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">From Date</label>
                <ModernCalendar
                  value={fromDate}
                  onChange={setFromDate}
                  maxDate={toDate}
                  triggerClassName="w-full justify-between bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 hover:border-emerald-500 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">To Date</label>
                <ModernCalendar
                  value={toDate}
                  onChange={setToDate}
                  minDate={fromDate}
                  triggerClassName="w-full justify-between bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 hover:border-emerald-500 focus:outline-none transition-colors"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Month</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  {[
                    'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'
                  ].map((m, i) => (
                    <option key={i + 1} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Year</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                  <option value={2027}>2027</option>
                </select>
              </div>
            </div>
          )}

          <div className="flex items-start space-x-2 pt-1 text-[11px] text-slate-400">
            <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Generated using controlled Excel format adhering to Book1 cell mappings, subtotal rows, and calculation parameters.
            </span>
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="text-xs text-red-400 bg-red-950/50 border border-red-800/80 p-3 rounded-lg">
            {error}
          </div>
        )}
        {downloadSuccess && (
          <div className="text-xs text-emerald-300 bg-emerald-950/50 border border-emerald-800/80 p-3 rounded-lg flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Workbook generated and downloaded successfully!</span>
          </div>
        )}

        {/* Buttons */}
        <div className="flex justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center space-x-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-sm"
          >
            {downloading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Generating XLSX...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Download .XLSX</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
