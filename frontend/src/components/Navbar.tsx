import React from 'react';
import {
  Activity,
  Download,
  Lock,
  Menu,
  Shield,
} from 'lucide-react';
import { AnimatedThemeToggler } from './AnimatedThemeToggler';
import { Logo } from './Logo';
import { ModernCalendar } from './ModernCalendar';
import { User } from '../types';

interface NavbarProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  dayStatus?: 'draft' | 'completed' | 'locked';
  onExportClick: () => void;
  onUserChange?: (user: User) => void;
  onMenuClick?: () => void;
  loomCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentDate,
  onDateChange,
  dayStatus,
  onExportClick,
  onMenuClick,
  loomCount,
}) => {

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 min-h-16 py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {/* Brand */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
          <button
            type="button"
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg bg-slate-800 border border-slate-700/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors shrink-0"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Logo size={40} className="w-9 h-9 sm:w-10 sm:h-10 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center space-x-2 min-w-0">
              <h1 className="font-semibold text-sm sm:text-lg tracking-tight text-white truncate">
                Loom Production System
              </h1>
              <span className="hidden min-[420px]:inline text-xs bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded font-mono whitespace-nowrap">
                v1.0{loomCount ? ` • ${loomCount} Looms` : ''}
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden md:block">
              Shift tracking, automated formulas & Book1 Excel export
            </p>
          </div>
        </div>

        {/* Date Selector & Day Status */}
        <div className="flex items-center flex-wrap gap-x-2 sm:gap-x-3 gap-y-2 min-w-0">
          <ModernCalendar
            value={currentDate}
            onChange={onDateChange}
            triggerClassName="bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-600 hover:text-white"
          />

          {dayStatus && (
            <div
              className={`flex items-center text-xs px-2.5 py-1 rounded-md border font-medium uppercase tracking-wider ${
                dayStatus === 'locked'
                  ? 'bg-amber-950/70 border-amber-800/80 text-amber-300'
                  : dayStatus === 'completed'
                  ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-300'
                  : 'bg-blue-950/70 border-blue-800/80 text-blue-300'
              }`}
            >
              {dayStatus === 'locked' ? (
                <>
                  <Lock className="w-3 h-3 mr-1 text-amber-400" />
                  Locked
                </>
              ) : (
                <>
                  <Activity className="w-3 h-3 mr-1" />
                  {dayStatus}
                </>
              )}
            </div>
          )}

          {/* Quick Export Button — icon-only on small phones */}
          <button
            onClick={onExportClick}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors shadow-sm"
            title="Export Excel (Book1 format)"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Export XLSX</span>
          </button>

          {/* Theme Toggle */}
          <AnimatedThemeToggler className="p-2 rounded-lg bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white hover:border-emerald-600 transition-colors" />

          {/* Current user badge (single admin user) */}
          <div className="flex items-center bg-slate-800 border border-slate-700/80 p-1 rounded-lg">
            <span className="flex items-center space-x-1 text-xs px-2 py-1 rounded bg-indigo-600 text-white font-medium shadow-sm">
              <Shield className="w-3 h-3" />
              <span>Admin</span>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
