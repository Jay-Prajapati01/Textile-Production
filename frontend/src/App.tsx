import React, { useEffect, useState } from 'react';
import { api } from './api/client';
import { DailyProductionView } from './components/DailyProductionView';
import { DashboardView } from './components/DashboardView';
import EntryView from './components/EntryView';
import { ExcelExportModal } from './components/ExcelExportModal';
import { MasterSetupView } from './components/MasterSetupView';
import { Navbar } from './components/Navbar';
import { ReportsView } from './components/ReportsView';
import { Sidebar, TabKey } from './components/Sidebar';
import { SubmittedEntriesView } from './components/SubmittedEntriesView';
import { AuditTrailView } from './components/AuditTrailView';
import { ToastProvider } from './components/Toast';
import { WorkerWivarView } from './components/WorkerWivarView';
import {
  DailySummary,
  MachineOption,
  MonthlySummary,
  RolledOffEntry,
  SubmittedEntry,
} from './types';
import { getTodayString, isValidDateString } from './utils/date';
import { requestNavigation } from './utils/navGuard';
import { onSync } from './utils/sync';

const DATE_STORAGE_KEY = 'textileApp.currentDate';
const SIDEBAR_STORAGE_KEY = 'textileApp.sidebarCollapsed';

const PATH_BY_TAB: Record<TabKey, string> = {
  dashboard: '/dashboard',
  daily_production: '/daily-production',
  entry: '/entry',
  worker_entry: '/worker-wivar',
  masters: '/master-setup',
  reports: '/reports',
  audit: '/audit-trail',
  submitted_entries: '/submitted-entries',
};

const TAB_BY_PATH: Record<string, TabKey> = {
  ...(Object.fromEntries(
    Object.entries(PATH_BY_TAB).map(([tab, path]) => [path, tab as TabKey])
  ) as Record<string, TabKey>),
  '/': 'dashboard',
  '/vendor/entry': 'entry',
  '/worker-entry': 'worker_entry',
  '/masters': 'masters',
  '/daily_production': 'daily_production',
  '/audit': 'audit',
  '/submitted-entries': 'submitted_entries',
};

const tabFromPath = (pathname: string): TabKey => {
  const clean =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return TAB_BY_PATH[clean] ?? 'dashboard';
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    typeof window !== 'undefined' ? tabFromPath(window.location.pathname) : 'dashboard'
  );
  const [currentDate, setCurrentDate] = useState<string>(() => {
    // Restore the user's selected date across reloads; default to today.
    try {
      const saved = sessionStorage.getItem(DATE_STORAGE_KEY);
      if (isValidDateString(saved)) return saved as string;
    } catch {
      /* ignore */
    }
    return getTodayString();
  });

  const handleDateChange = (date: string) => {
    if (!isValidDateString(date)) return; // ignore empty/partial picker values
    requestNavigation(() => {
      try {
        sessionStorage.setItem(DATE_STORAGE_KEY, date);
      } catch {
        /* ignore */
      }
      setCurrentDate(date);
    });
  };
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, prev ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !prev;
    });
  };

  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);
  const [dailyProdRefreshTrigger, setDailyProdRefreshTrigger] = useState(0);
  const [submittedEntriesRefreshTrigger, setSubmittedEntriesRefreshTrigger] = useState(0);

  // Excel Modal State
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelModalOptions, setExcelModalOptions] = useState<{
    type?: 'daily' | 'monthly' | 'range';
    date?: string;
    year?: number;
    month?: number;
    fromDate?: string;
    toDate?: string;
  }>({});

  const refreshSummaries = async (date: string = currentDate) => {
    try {
      const summary = await api.getDailySummary(date);
      setDailySummary(summary);

      const d = new Date(date);
      const mSummary = await api.getMonthlySummary(d.getFullYear(), d.getMonth() + 1);
      setMonthlySummary(mSummary);
    } catch (err) {
      console.error('Failed to load dashboard summaries:', err);
    }
  };

  useEffect(() => {
    refreshSummaries(currentDate);
  }, [currentDate]);

  const loadMachines = async () => {
    try {
      setMachines(await api.getMachines());
    } catch (err) {
      console.error('Failed to load machines:', err);
    }
  };

  useEffect(() => {
    loadMachines();
  }, []);

  // Real-time: Master/Worker/Entry changes made on another tab (or another
  // browser tab) refresh the shared header data. Same-tab tab switches reload
  // each view on mount; this covers the App-level caches (loom count, status).
  useEffect(() => {
    loadMachines();
    refreshSummaries(currentDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    const onFocus = () => {
      loadMachines();
      refreshSummaries(currentDate);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  useEffect(() => {
    return onSync((msg) => {
      if (msg.type === 'masters') {
        loadMachines();
        refreshSummaries(currentDate);
      } else if (msg.type === 'saved' || msg.type === 'entries') {
        refreshSummaries(currentDate);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  useEffect(() => {
    const onPopState = () => setActiveTab(tabFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const selectTab = (tab: TabKey) => {
    requestNavigation(() => {
      setActiveTab(tab);
      const targetPath = PATH_BY_TAB[tab];
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ tab }, '', targetPath);
      }
    });
  };

  const handleAddSubmittedEntry = async (
    entry: Omit<SubmittedEntry, 'id' | 'submittedAt' | 'entryType'>
  ) => {
    await api.createEntry(entry);
  };

  const handleAddRolledOffEntry = async (
    entry: Omit<RolledOffEntry, 'id' | 'submittedAt' | 'entryType'>
  ) => {
    await api.createRolledOffEntry(entry);
  };

  const handleOpenExport = (options?: {
    type?: 'daily' | 'monthly' | 'range';
    date?: string;
    year?: number;
    month?: number;
    fromDate?: string;
    toDate?: string;
  }) => {
    if (options) {
      setExcelModalOptions(options);
    } else {
      setExcelModalOptions({ type: 'daily', date: currentDate });
    }
    setIsExcelModalOpen(true);
  };

  return (
    <ToastProvider>
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Header / Navbar */}
      <Navbar
        currentDate={currentDate}
        onDateChange={handleDateChange}
        dayStatus={dailySummary?.status}
        onExportClick={() => handleOpenExport({ type: 'daily', date: currentDate })}
        onMenuClick={() => setMobileNavOpen(true)}
        loomCount={machines.length}
      />

      <div className="flex-1 flex min-w-0 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={(tab) => selectTab(tab)}
          onExportClick={() =>
            handleOpenExport({
              type: 'monthly',
              year: Number(currentDate.slice(0, 4)),
              month: Number(currentDate.slice(5, 7)),
            })
          }
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapsed}
        />

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-6 lg:p-8 bg-slate-950/80">
          <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
            {activeTab === 'dashboard' && (
              <DashboardView
                dailySummary={dailySummary}
                monthlySummary={monthlySummary}
                currentDate={currentDate}
                onNavigateTab={(tab) => selectTab(tab)}
                onSelectDate={handleDateChange}
              />
            )}

            {activeTab === 'daily_production' && (
        <DailyProductionView
          currentDate={currentDate}
          onDateChange={handleDateChange}
          onExportClick={() => handleOpenExport({ type: 'daily', date: currentDate })}
          onRefreshData={refreshSummaries}
          refreshTrigger={dailyProdRefreshTrigger}
          onGoToEntry={() => selectTab('entry')}
          onGoToWorker={() => selectTab('worker_entry')}
        />
            )}

            {activeTab === 'entry' && (
              <EntryView
                machines={machines}
                onSubmitFirstEntry={handleAddSubmittedEntry}
                onSubmitRolledOffEntry={handleAddRolledOffEntry}
                onRefreshData={() => {
                  setSubmittedEntriesRefreshTrigger((t) => t + 1);
                }}
              />
            )}

            {activeTab === 'worker_entry' && (
              <WorkerWivarView
                currentDate={currentDate}
                onDateChange={handleDateChange}
                onRefreshData={() => {
                  refreshSummaries(currentDate);
                  setDailyProdRefreshTrigger((t) => t + 1);
                }}
              />
            )}

            {activeTab === 'masters' && <MasterSetupView />}

            {activeTab === 'reports' && (
              <ReportsView
                currentDate={currentDate}
                onExportClick={(opts) => handleOpenExport(opts)}
              />
            )}

            {activeTab === 'audit' && <AuditTrailView />}

            {activeTab === 'submitted_entries' && (
              <SubmittedEntriesView
                currentDate={currentDate}
                onDateChange={handleDateChange}
                onRefreshData={() => setSubmittedEntriesRefreshTrigger((t) => t + 1)}
                refreshTrigger={submittedEntriesRefreshTrigger}
              />
            )}
          </div>
        </main>
      </div>

      {/* Excel Export Modal */}
      <ExcelExportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        currentDate={currentDate}
        initialOptions={excelModalOptions}
      />
    </div>
    </ToastProvider>
  );
}
