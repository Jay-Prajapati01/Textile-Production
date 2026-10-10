import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  AuditLog,
  DefaultAssignment,
  Loom,
  LoomProduction,
  NumberLine,
  ProductionDay,
  ProductionSettings,
  RolledOffEntry,
  SubmittedEntry,
  User,
  Worker,
  WorkerEntry,
} from '../types';

export interface DatabaseSchema {
  users: User[];
  number_lines: NumberLine[];
  looms: Loom[];
  workers: Worker[];
  settings: ProductionSettings;
  production_days: ProductionDay[];
  loom_productions: LoomProduction[];
  worker_entries: WorkerEntry[];
  default_assignments: DefaultAssignment[];
  submitted_entries: SubmittedEntry[];
  rolled_off_entries: RolledOffEntry[];
  audit_logs: AuditLog[];
}

function getInitialData(): DatabaseSchema {
  const number_lines: NumberLine[] = [
    { id: 'line-1', name: 'Number Line 1', is_active: true },
  ];

  const looms: Loom[] = [];
  const specs = [72, 76, 80, 84, 88, 76, 80, 72];
  const rates = [13.8, 14.2, 14.5, 15.2, 15.8, 14.2, 14.5, 13.8];

  for (let i = 1; i <= 2; i++) {
    const spec = specs[(i - 1) % specs.length];
    const rate = rates[(i - 1) % rates.length];

    looms.push({
      id: `loom-${i}`,
      loom_number: i,
      name: `Loom #${i.toString().padStart(2, '0')}`,
      specification: spec,
      rate: rate,
      pick_rate: Math.round((rate * 10000) / spec) / 100,
      number_line_id: 'line-1',
      is_active: true,
      created_at: new Date('2026-09-01T00:00:00Z').toISOString(),
      updated_at: new Date('2026-09-01T00:00:00Z').toISOString(),
    });
  }

  const workers: Worker[] = [
    { id: 'w-1', name: 'Ramesh Patel', code: 'W-01', default_price: 1.85, is_active: true },
    { id: 'w-2', name: 'Suresh Sharma', code: 'W-02', default_price: 1.80, is_active: true },
    { id: 'w-3', name: 'Mahesh Kumar', code: 'W-03', default_price: 1.85, is_active: true },
    { id: 'w-4', name: 'Dinesh Varma', code: 'W-04', default_price: 1.80, is_active: true },
    { id: 'w-5', name: 'Ganesh Yadav', code: 'W-05', default_price: 1.90, is_active: true },
    { id: 'w-6', name: 'Mukesh Prajapati', code: 'W-06', default_price: 1.80, is_active: true },
    { id: 'w-7', name: 'Rajesh Thakur', code: 'W-07', default_price: 1.85, is_active: true },
    { id: 'w-8', name: 'Vijay Chauhan', code: 'W-08', default_price: 1.80, is_active: true },
  ];

  const users: User[] = [];

  const settings: ProductionSettings = {
    id: 'setting-default',
    average_divisor: 4,
    maximum_production: 152,
    meter_conversion_factor: 25.4,
    adjustment_amount: -35000,
    effective_from: '2026-09-01',
    effective_to: null,
    is_active: true,
  };

  const production_days: ProductionDay[] = [];
  const loom_productions: LoomProduction[] = [];
  const worker_entries: WorkerEntry[] = [];

  const audit_logs: AuditLog[] = [
    {
      id: 'audit-init',
      user_name: 'System Admin',
      user_email: 'admin@textile.com',
      action: 'SYSTEM_INITIALIZED',
      entity_type: 'SYSTEM',
      entity_id: '0',
      timestamp: new Date().toISOString(),
      details: 'System initialized with 2 looms, 1 line, and 8 workers',
    },
  ];

  return {
    users,
    number_lines,
    looms,
    workers,
    settings,
    production_days,
    loom_productions,
    worker_entries,
    default_assignments: [],
    submitted_entries: [],
    rolled_off_entries: [],
    audit_logs,
  };
}

export function createEmptyDatabase(): DatabaseSchema {
  const initial = getInitialData();
  return {
    ...initial,
    users: [], number_lines: [], looms: [], workers: [], production_days: [],
    loom_productions: [], worker_entries: [], default_assignments: [],
    submitted_entries: [], rolled_off_entries: [], audit_logs: [],
  };
}

class Database {
  private context = new AsyncLocalStorage<{ data: DatabaseSchema; revision: number; tenantId: string; token: string; dirty: boolean }>();

  private get data(): DatabaseSchema {
    const ctx = this.context.getStore();
    if (!ctx) throw new Error('Tenant context is required');
    return ctx.data;
  }
  private set data(value: DatabaseSchema) {
    const ctx = this.context.getStore();
    if (!ctx) throw new Error('Tenant context is required');
    ctx.data = value;
  }

  public async run<T>(tenantId: string, token: string, callback: () => T): Promise<T> {
    const record = await prisma.tenantState.findUnique({ where: { tenantId } });
    if (!record) throw new Error('Tenant data unavailable');
    const state = record.state as unknown as DatabaseSchema;
    state.worker_entries = (state.worker_entries || []).map((entry) => ({
      ...entry,
      shift_a_worker_id: entry.shift_a_worker_id ?? entry.worker_id ?? '',
      shift_b_worker_id: entry.shift_b_worker_id ?? '',
    }));
    return this.context.run({ data: state, revision: Number(record.revision), tenantId, token, dirty: false }, callback);
  }

  public async persist(): Promise<boolean> {
    const ctx = this.context.getStore();
    if (!ctx || !ctx.dirty) return false;
    const result = await prisma.tenantState.updateMany({
      where: { tenantId: ctx.tenantId, revision: BigInt(ctx.revision) },
      data: { state: ctx.data as unknown as Prisma.InputJsonValue, revision: { increment: 1 }, updatedAt: new Date() },
    });
    if (result.count !== 1) throw new Error('Tenant state revision conflict');
    ctx.revision += 1;
    ctx.dirty = false;
    return true;
  }

  public save() {
    const ctx = this.context.getStore();
    if (!ctx) throw new Error('Tenant context is required');
    ctx.dirty = true;
  }

  // Getters
  public getUsers(): User[] {
    return this.data.users;
  }

  public getNumberLines(): NumberLine[] {
    return this.data.number_lines;
  }

  public getLooms(): Loom[] {
    return this.data.looms;
  }

  public getWorkers(): Worker[] {
    return this.data.workers;
  }

  public getSettings(): ProductionSettings {
    return this.data.settings;
  }

  public getProductionDays(): ProductionDay[] {
    return this.data.production_days;
  }

  public getLoomProductions(dayId?: string): LoomProduction[] {
    if (dayId) {
      return this.data.loom_productions.filter((p) => p.production_day_id === dayId);
    }
    return this.data.loom_productions;
  }

  public getWorkerEntries(dayId?: string): WorkerEntry[] {
    if (dayId) {
      return this.data.worker_entries.filter((w) => w.production_day_id === dayId);
    }
    return this.data.worker_entries;
  }

  public getSubmittedEntries(): SubmittedEntry[] {
    return this.data.submitted_entries;
  }

  public getRolledOffEntries(): RolledOffEntry[] {
    return this.data.rolled_off_entries;
  }

  public getAuditLogs(): AuditLog[] {
    return this.data.audit_logs;
  }

  // Mutations
  public updateSettings(settings: Partial<ProductionSettings>): ProductionSettings {
    this.data.settings = { ...this.data.settings, ...settings };
    this.save();
    return this.data.settings;
  }

  public addLoom(loom: Omit<Loom, 'id'>): Loom {
    const id = `loom-${Date.now()}`;
    const newLoom: Loom = {
      ...loom,
      id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.data.looms.push(newLoom);
    this.save();
    return newLoom;
  }

  public updateLoom(id: string, updates: Partial<Loom>): Loom | null {
    const idx = this.data.looms.findIndex((l) => l.id === id);
    if (idx === -1) return null;
    this.data.looms[idx] = {
      ...this.data.looms[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.save();
    return this.data.looms[idx];
  }

  public addWorker(worker: Omit<Worker, 'id'>): Worker {
    const id = `w-${Date.now()}`;
    const newWorker: Worker = {
      ...worker,
      id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.data.workers.push(newWorker);
    this.save();
    return newWorker;
  }

  public updateWorker(id: string, updates: Partial<Worker>): Worker | null {
    const idx = this.data.workers.findIndex((w) => w.id === id);
    if (idx === -1) return null;
    this.data.workers[idx] = {
      ...this.data.workers[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.save();
    return this.data.workers[idx];
  }

  public addNumberLine(line: Omit<NumberLine, 'id'>): NumberLine {
    const id = `line-${Date.now()}`;
    const newLine: NumberLine = { ...line, id };
    this.data.number_lines.push(newLine);
    this.save();
    return newLine;
  }

  public updateNumberLine(id: string, updates: Partial<NumberLine>): NumberLine | null {
    const idx = this.data.number_lines.findIndex((l) => l.id === id);
    if (idx === -1) return null;
    this.data.number_lines[idx] = { ...this.data.number_lines[idx], ...updates };
    this.save();
    return this.data.number_lines[idx];
  }

  public getOrCreateProductionDay(date: string, userName: string = 'System'): ProductionDay {
    let day = this.data.production_days.find((d) => d.production_date === date);
    if (!day) {
      day = {
        id: `day-${date}`,
        production_date: date,
        status: 'draft',
        created_by: userName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.data.production_days.push(day);
      // Auto-apply the default roster to the freshly created day so the same
      // workers are fixed to the same machines/shifts every new date.
      this.applyDefaultAssignments(day.id);
      this.save();
    }
    return day;
  }

  // Copy the persisted default roster into a day's worker entries
  // (only used when the day is first created — never overwrites existing entries).
  private applyDefaultAssignments(dayId: string) {
    const defaults = this.data.default_assignments;
    if (defaults.length === 0) return;
    defaults.forEach((d) => {
      const hasAny = d.shift_a_worker_id || d.shift_b_worker_id;
      if (!hasAny) return;
      this.data.worker_entries.push({
        id: `we-${dayId}-${d.loom_id}`,
        production_day_id: dayId,
        loom_id: d.loom_id,
        worker_id: d.shift_a_worker_id || '',
        shift_a_worker_id: d.shift_a_worker_id || '',
        shift_b_worker_id: d.shift_b_worker_id || '',
        price_override: null,
        remark: '',
        shift_b_remark: '',
      });
    });
  }

  // Apply the default roster to a day that has no worker entries yet.
  // Returns true when entries were applied.
  public applyDefaultsIfEmpty(dayId: string): boolean {
    if (this.data.default_assignments.length === 0) return false;
    const hasEntries = this.data.worker_entries.some((w) => w.production_day_id === dayId);
    if (hasEntries) return false;
    this.applyDefaultAssignments(dayId);
    this.save();
    return true;
  }

  // Default roster (persisted, date-independent)
  public getDefaultAssignments(): DefaultAssignment[] {
    return this.data.default_assignments;
  }

  public saveDefaultAssignments(assignments: DefaultAssignment[]): DefaultAssignment[] {
    this.data.default_assignments = assignments.filter(
      (a) => a.shift_a_worker_id || a.shift_b_worker_id
    );
    this.save();
    return this.data.default_assignments;
  }

  public updateProductionDayStatus(
    id: string,
    status: 'draft' | 'completed' | 'locked',
    user: string
  ): ProductionDay | null {
    const idx = this.data.production_days.findIndex((d) => d.id === id);
    if (idx === -1) return null;

    const day = this.data.production_days[idx];
    day.status = status;
    day.updated_at = new Date().toISOString();
    if (status === 'locked') {
      day.locked_by = user;
      day.locked_at = new Date().toISOString();
    } else if (status === 'draft') {
      day.locked_by = undefined;
      day.locked_at = undefined;
    }
    this.save();
    return day;
  }

  public saveLoomProductions(
    dayId: string,
    productions: { loom_id: string; shift_a: number; shift_b: number }[]
  ) {
    // Remove existing for this day
    this.data.loom_productions = this.data.loom_productions.filter(
      (p) => p.production_day_id !== dayId
    );

    const now = new Date().toISOString();
    productions.forEach((p) => {
      this.data.loom_productions.push({
        id: `lp-${dayId}-${p.loom_id}`,
        production_day_id: dayId,
        loom_id: p.loom_id,
        shift_a: Math.max(0, Number(p.shift_a) || 0),
        shift_b: Math.max(0, Number(p.shift_b) || 0),
        created_at: now,
        updated_at: now,
      });
    });

    const day = this.data.production_days.find((d) => d.id === dayId);
    if (day) {
      day.updated_at = now;
    }
    this.save();
  }

  public saveWorkerEntries(
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
  ) {
    this.data.worker_entries = this.data.worker_entries.filter(
      (w) => w.production_day_id !== dayId
    );

    entries.forEach((e) => {
      const shiftA = e.shift_a_worker_id ?? e.worker_id ?? '';
      const shiftB = e.shift_b_worker_id ?? '';
      if (shiftA || shiftB) {
        this.data.worker_entries.push({
          id: `we-${dayId}-${e.loom_id}`,
          production_day_id: dayId,
          loom_id: e.loom_id,
          worker_id: shiftA || shiftB,
          shift_a_worker_id: shiftA,
          shift_b_worker_id: shiftB,
          price_override: e.price_override,
          remark: e.remark || '',
          shift_b_remark: e.shift_b_remark || '',
        });
      }
    });

    const day = this.data.production_days.find((d) => d.id === dayId);
    if (day) {
      day.updated_at = new Date().toISOString();
    }
    this.save();
  }

  public addSubmittedEntry(entry: Omit<SubmittedEntry, 'id' | 'submittedAt' | 'entryType'>): SubmittedEntry {
    const newEntry: SubmittedEntry = {
      ...entry,
      id: `SE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      submittedAt: new Date().toISOString(),
      entryType: 'first-entry',
    };
    this.data.submitted_entries.unshift(newEntry);
    this.save();
    return newEntry;
  }

  public addRolledOffEntry(entry: Omit<RolledOffEntry, 'id' | 'submittedAt' | 'entryType'>): RolledOffEntry {
    const newEntry: RolledOffEntry = {
      ...entry,
      id: `RO-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      submittedAt: new Date().toISOString(),
      entryType: 'rolled-off',
    };
    this.data.rolled_off_entries.unshift(newEntry);
    this.save();
    return newEntry;
  }

  public addAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>) {
    const newLog: AuditLog = {
      ...log,
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    this.data.audit_logs.unshift(newLog);
    // Keep max 500 logs
    if (this.data.audit_logs.length > 500) {
      this.data.audit_logs = this.data.audit_logs.slice(0, 500);
    }
    this.save();
  }
}

export const db = new Database();
