import {
  AuditLog,
  DailySummary,
  DefaultAssignment,
  Loom,
  MachineOption,
  MonthlySummary,
  NumberLine,
  ProductionDay,
  ProductionSettings,
  RolledOffEntry,
  SubmittedEntry,
  User,
  Worker,
} from '../types';
import { postSync } from '../utils/sync';

let currentUser: User | null = null;

export function setCurrentUser(user: User) {
  currentUser = user;
}

export function getCurrentUser(): User {
  if (!currentUser) throw new Error('No signed-in user');
  return currentUser;
}

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('textile.accessToken') || ''}`,
  'x-tenant-id': localStorage.getItem('textile.selectedTenant') || '',
});

export const api = {
  // Auth
  async login(email: string, password: string):Promise<{ token: string; refreshToken: string }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to login');
    }
    const data = await res.json();
    return data;
  },

  async getMe(): Promise<User> {
    const res = await fetch('/api/auth/me', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch user');
    return res.json();
  },

  // Looms
  async getLooms(): Promise<Loom[]> {
    const res = await fetch('/api/looms', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch looms');
    return res.json();
  },

  async createLoom(loom: Partial<Loom>): Promise<Loom> {
    const res = await fetch('/api/looms', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(loom),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create loom');
    }
    const created = await res.json();
    // Real-time: a new loom must appear in Daily Production / Worker-Wivar
    // immediately, without a page refresh (same tab remounts, other tabs sync).
    postSync({ type: 'masters' });
    return created;
  },

  async updateLoom(id: string, updates: Partial<Loom>): Promise<Loom> {
    const res = await fetch(`/api/looms/${id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update loom');
    const updated = await res.json();
    // Real-time: active/inactive toggles, spec & rate edits propagate instantly.
    postSync({ type: 'masters' });
    return updated;
  },

  // Workers
  async getWorkers(): Promise<Worker[]> {
    const res = await fetch('/api/workers', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch workers');
    return res.json();
  },

  async createWorker(worker: Partial<Worker>): Promise<Worker> {
    const res = await fetch('/api/workers', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(worker),
    });
    if (!res.ok) throw new Error('Failed to create worker');
    const created = await res.json();
    postSync({ type: 'masters' });
    return created;
  },

  async updateWorker(id: string, updates: Partial<Worker>): Promise<Worker> {
    const res = await fetch(`/api/workers/${id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update worker');
    const updated = await res.json();
    postSync({ type: 'masters' });
    return updated;
  },

  // Number Lines
  async getNumberLines(): Promise<NumberLine[]> {
    const res = await fetch('/api/number-lines', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch number lines');
    return res.json();
  },

  async createNumberLine(name: string): Promise<NumberLine> {
    const res = await fetch('/api/number-lines', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error('Failed to create number line');
    const created = await res.json();
    postSync({ type: 'masters' });
    return created;
  },

  async updateNumberLine(id: string, updates: Partial<NumberLine>): Promise<NumberLine> {
    const res = await fetch(`/api/number-lines/${id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update number line');
    const updated = await res.json();
    postSync({ type: 'masters' });
    return updated;
  },

  // Settings
  async getSettings(): Promise<ProductionSettings> {
    const res = await fetch('/api/settings', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },

  async updateSettings(settings: Partial<ProductionSettings>): Promise<ProductionSettings> {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    const updated = await res.json();
    // Divisors / rates drive every formula — broadcast so open views recalc.
    postSync({ type: 'masters' });
    return updated;
  },

  // Production Days
  async getProductionDaysList(): Promise<ProductionDay[]> {
    const res = await fetch('/api/production-days', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch production days list');
    return res.json();
  },

  async getDailySummary(date: string): Promise<DailySummary> {
    const res = await fetch(`/api/production-days?date=${date}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch daily summary');
    return res.json();
  },

  // Create the production day if missing (auto-applies default worker roster)
  async ensureProductionDay(date: string): Promise<DailySummary> {
    const res = await fetch('/api/production-days/ensure', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ date }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to ensure production day');
    }
    return res.json();
  },

  async saveDailyProduction(
    date: string,
    productions: { loom_id: string; shift_a: number; shift_b: number }[]
  ): Promise<DailySummary> {
    const res = await fetch('/api/production-days', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ date, productions }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save daily production');
    }
    const summary = await res.json();
    postSync({ type: 'saved', date });
    return summary;
  },

  async completeProductionDay(id: string): Promise<DailySummary> {
    const res = await fetch(`/api/production-days/${id}/complete`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to complete day');
    const summary = await res.json();
    if (summary?.date) postSync({ type: 'saved', date: summary.date });
    return summary;
  },

  async lockProductionDay(id: string): Promise<DailySummary> {
    const res = await fetch(`/api/production-days/${id}/lock`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to lock day');
    }
    const summary = await res.json();
    if (summary?.date) postSync({ type: 'saved', date: summary.date });
    return summary;
  },

  async unlockProductionDay(id: string): Promise<DailySummary> {
    const res = await fetch(`/api/production-days/${id}/unlock`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to unlock day');
    const summary = await res.json();
    if (summary?.date) postSync({ type: 'saved', date: summary.date });
    return summary;
  },

  // Worker entries
  async saveWorkerEntries(
    dayId: string,
    entries: {
      loom_id: string;
      worker_id?: string;
      shift_a_worker_id?: string;
      shift_b_worker_id?: string;
      price_override?: number;
      remark?: string;
      shift_b_remark?: string;
    }[]
  ): Promise<DailySummary> {
    const res = await fetch(`/api/production-days/${dayId}/workers`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ entries }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save worker entries');
    }
    const summary = await res.json();
    // Worker names show inside Daily Production — refresh open views live.
    if (summary?.date) postSync({ type: 'saved', date: summary.date });
    return summary;
  },

  // Default worker roster (date-independent, auto-applied to new days)
  async getDefaultAssignments(): Promise<DefaultAssignment[]> {
    const res = await fetch('/api/default-assignments', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch default assignments');
    return res.json();
  },

  async saveDefaultAssignments(assignments: DefaultAssignment[]): Promise<DefaultAssignment[]> {
    const res = await fetch('/api/default-assignments', {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ assignments }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save default assignments');
    }
    const saved = await res.json();
    postSync({ type: 'masters' });
    return saved;
  },

  // Monthly Report
  async getMonthlySummary(year: number, month: number): Promise<MonthlySummary> {
    const res = await fetch(`/api/reports/monthly?year=${year}&month=${month}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch monthly summary');
    return res.json();
  },

  // Audit Logs
  async getAuditLogs(): Promise<AuditLog[]> {
    const res = await fetch('/api/audit-logs', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch audit logs');
    return res.json();
  },

  // Machines (Entry dropdown source)
  async getMachines(): Promise<MachineOption[]> {
    const res = await fetch('/api/machines', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch machines');
    return res.json();
  },

  // Production entries
  async getEntries(): Promise<SubmittedEntry[]> {
    const res = await fetch('/api/entries', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch entries');
    return res.json();
  },

  async createEntry(entry: Omit<SubmittedEntry, 'id' | 'submittedAt' | 'entryType'>): Promise<SubmittedEntry> {
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to submit entry');
    }
    const created = await res.json();
    // Beam entries feed opening/remaining meters in Daily Production.
    postSync({ type: 'entries' });
    return created;
  },

  async getRolledOffEntries(): Promise<RolledOffEntry[]> {
    const res = await fetch('/api/rolled-off', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch rolled off entries');
    return res.json();
  },

  async createRolledOffEntry(entry: Omit<RolledOffEntry, 'id' | 'submittedAt' | 'entryType'>): Promise<RolledOffEntry> {
    const res = await fetch('/api/rolled-off', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to submit rolled off entry');
    }
    const created = await res.json();
    postSync({ type: 'entries' });
    return created;
  },

  // Range report (server-aggregated, settings-consistent)
  async getRangeSummary(from: string, to: string): Promise<MonthlySummary> {
    const res = await fetch(`/api/reports/range?from=${from}&to=${to}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch range summary');
    return res.json();
  },

  // Export Excel
  async exportExcel(payload: { type: 'daily' | 'monthly' | 'range'; date?: string; year?: number; month?: number; fromDate?: string; toDate?: string }): Promise<Blob> {
    const res = await fetch('/api/reports/export-excel', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to download Excel file');
    return res.blob();
  },
};
