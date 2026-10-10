import React from 'react';
import {
  BarChart3,
  CalendarCheck2,
  ChevronsLeft,
  ChevronsRight,
  ClipboardEdit,
  Database,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Users2,
} from 'lucide-react';
import { Logo } from './Logo';

export type TabKey =
  | 'dashboard'
  | 'daily_production'
  | 'entry'
  | 'worker_entry'
  | 'masters'
  | 'reports'
  | 'audit'
  | 'submitted_entries';

interface SidebarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onExportClick: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onExportClick,
  mobileOpen = false,
  onCloseMobile,
  collapsed = false,
  onToggleCollapse,
}) => {
  // Required order: Dashboard, Master Setup, Worker/Wivar, Entry,
  // Submitted Entry, Daily Production, Reports & Analysis, Audit Trail
  const items = [
    {
      key: 'dashboard' as TabKey,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: 'Overview',
    },
    {
      key: 'masters' as TabKey,
      label: 'Master Setup',
      icon: Database,
      badge: 'Looms & Rules',
    },
    {
      key: 'worker_entry' as TabKey,
      label: 'Worker / Wivar',
      icon: Users2,
      badge: 'Assignment',
    },
    {
      key: 'entry' as TabKey,
      label: 'Entry',
      icon: ClipboardEdit,
      badge: 'Beam Loading',
    },
    {
      key: 'submitted_entries' as TabKey,
      label: 'Submitted Entries',
      icon: FileSpreadsheet,
      badge: 'All Records',
    },
    {
      key: 'daily_production' as TabKey,
      label: 'Daily Production',
      icon: CalendarCheck2,
      badge: 'Input Shift A/B',
    },
    {
      key: 'reports' as TabKey,
      label: 'Reports & Analysis',
      icon: BarChart3,
      badge: 'Daily & Monthly',
    },
    {
      key: 'audit' as TabKey,
      label: 'Audit Trail',
      icon: History,
      badge: 'Security',
    },
  ];

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 min-h-[calc(100vh-4rem)]
          fixed inset-y-0 left-0 z-50 transition-all duration-300 ease-in-out
          lg:static lg:shrink-0 lg:translate-x-0
          ${collapsed ? 'lg:w-[76px]' : 'lg:w-64'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
      <div className={`p-4 space-y-6 ${collapsed ? 'lg:p-3 lg:space-y-4' : ''}`}>
        <div>
          <div className="flex items-center justify-between px-3 mb-2">
            <p
              className={`text-[11px] font-semibold text-slate-400 uppercase tracking-wider ${
                collapsed ? 'lg:hidden' : ''
              }`}
            >
              Operations & Data
            </p>
            {/* Expand / Collapse — desktop only */}
            <button
              type="button"
              onClick={onToggleCollapse}
              title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              className="hidden lg:flex p-1.5 rounded-lg bg-slate-800 border border-slate-700/80 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
            >
              {collapsed ? (
                <ChevronsRight className="w-4 h-4" />
              ) : (
                <ChevronsLeft className="w-4 h-4" />
              )}
            </button>
          </div>
          <nav className="space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  title={item.label}
                  onClick={() => {
                    onTabChange(item.key);
                    onCloseMobile?.();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    collapsed ? 'lg:justify-center lg:px-2' : ''
                  } ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        collapsed ? 'lg:hidden' : ''
                      } ${
                        isActive
                          ? 'bg-emerald-700/80 text-emerald-100'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Quick Excel Export Card in Sidebar */}
        <div className={`bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 space-y-2.5 ${collapsed ? 'lg:p-2 lg:space-y-0' : ''}`}>
          <div className={`flex items-center space-x-2 text-emerald-400 ${collapsed ? 'lg:justify-center lg:space-x-0' : ''}`}>
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <h4 className={`text-xs font-semibold text-slate-200 ${collapsed ? 'lg:hidden' : ''}`}>Book1 Excel Format</h4>
          </div>
          <p className={`text-xs text-slate-400 leading-relaxed ${collapsed ? 'lg:hidden' : ''}`}>
            Exports multi-sheet workbook matching the reference Book1 structure with live formulas.
          </p>
          <button
            onClick={onExportClick}
            title="Generate Excel XLSX"
            className={`w-full flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium py-2 rounded-lg transition-colors shadow-sm ${collapsed ? 'lg:py-2 lg:px-0' : ''}`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
            <span className={collapsed ? 'lg:hidden' : ''}>Generate Excel XLSX</span>
          </button>
        </div>
      </div>

      {/* Footer Info */}
      <div className={`p-4 border-t border-slate-800 text-xs text-slate-400 flex items-center gap-2.5 ${collapsed ? 'lg:justify-center lg:p-3' : 'justify-between'}`}>
        <Logo size={26} className="shrink-0" />
        <div className={`flex-1 min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
          <p className="font-medium text-slate-300">Textile Loom OS</p>
          <p className="text-[11px]">Backend Calculation Engine</p>
        </div>
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="System Online" />
      </div>
      </aside>
    </>
  );
};
