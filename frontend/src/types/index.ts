export type Role = 'admin' | 'factory_owner';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  tenantId?: string | null;
  companyName?: string;
  tenantActive?: boolean;
}

export interface Loom {
  id: string;
  loom_number: number;
  name: string;
  specification: number;
  rate: number;
  pick_rate?: number;
  number_line_id: string;
  is_active: boolean;
}

export interface Worker {
  id: string;
  name: string;
  code: string;
  default_price: number;
  is_active: boolean;
}

export interface NumberLine {
  id: string;
  name: string;
  is_active: boolean;
}

export type DayStatus = 'draft' | 'completed' | 'locked';

export interface ProductionDay {
  id: string;
  production_date: string;
  status: DayStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  locked_by?: string;
  locked_at?: string;
}

export interface DefaultAssignment {
  loom_id: string;
  shift_a_worker_id: string;
  shift_b_worker_id: string;
}

export interface CalculatedLoomRow {
  loom_id: string;
  loom_number: number;
  loom_name: string;
  number_line_id: string;
  number_line_name: string;
  specification: number;
  rate: number;
  is_active: boolean;
  shift_a: number;
  shift_b: number;
  total: number;
  average: number;
  percentage: number;
  meter: number;
  rs: number;
  batch_number: string | null;
  beam_meter: number | null;
  opening_meter: number | null;
  cumulative_meter: number | null;
  remaining_meter: number | null;
  worker_id?: string;
  worker_name?: string;
  worker_code?: string;
  worker_price?: number;
  remark?: string;
  shift_a_worker_id?: string;
  shift_a_worker_name?: string;
  shift_a_worker_code?: string;
  shift_a_remark?: string;
  shift_b_worker_id?: string;
  shift_b_worker_name?: string;
  shift_b_worker_code?: string;
  shift_b_remark?: string;
}

export interface LineSummary {
  line_id: string;
  line_name: string;
  loom_count: number;
  shift_a: number;
  shift_b: number;
  total: number;
  meter: number;
  rs: number;
}

export interface DailySummary {
  date: string;
  status: DayStatus;
  day_id?: string;
  total_looms: number;
  active_looms: number;
  total_shift_a: number;
  total_shift_b: number;
  grand_total: number;
  average: number;
  percentage: number;
  total_meter: number;
  total_rs: number;
  line_summaries: LineSummary[];
  rows: CalculatedLoomRow[];
}

export interface MonthlySummary {
  year: number;
  month: number;
  month_name: string;
  days_recorded: number;
  total_shift_a: number;
  total_shift_b: number;
  grand_total: number;
  avg_daily_production: number;
  overall_percentage: number;
  total_meter: number;
  total_rs: number;
  base_rs: number;
  adjustment_amount: number;
  final_adjusted_rs: number;
  daily_breakdown: {
    date: string;
    status: DayStatus;
    shift_a: number;
    shift_b: number;
    total: number;
    average: number;
    percentage: number;
    meter: number;
    rs: number;
  }[];
  loom_breakdown: {
    loom_id: string;
    loom_number: number;
    loom_name: string;
    number_line_name: string;
    specification: number;
    rate: number;
    shift_a: number;
    shift_b: number;
    total: number;
    meter: number;
    rs: number;
  }[];
  number_line_breakdown: {
    line_id: string;
    line_name: string;
    loom_count: number;
    total: number;
    meter: number;
    rs: number;
  }[];
  worker_breakdown: {
    worker_id: string;
    worker_name: string;
    worker_code: string;
    assigned_days_count: number;
    total_meters: number;
    total_wages: number;
  }[];
}

export interface ProductionSettings {
  id: string;
  average_divisor: number;
  maximum_production: number;
  meter_conversion_factor: number;
  adjustment_amount: number;
  effective_from: string;
  effective_to?: string | null;
  is_active: boolean;
}

export interface MachineOption {
  id: string;
  name: string;
  isActive: boolean;
}

export interface SubmittedEntry {
  id: string;
  machineNumber: string;
  sortNumber: string;
  productionNumber: string;
  flangeNumber: string;
  batchNumber: string;
  beamMeter: number;
  beamNetWeight: number;
  glm: number;
  startedDate: string;
  finishedDate?: string | null;
  submittedAt: string;
  entryType: 'first-entry';
}

export interface RolledOffEntry {
  id: string;
  machineNumber: string;
  rollDoffDate: string;
  meters: number;
  glmFabric: number;
  weight: number;
  submittedAt: string;
  entryType: 'rolled-off';
}

export interface AuditLog {
  id: string;
  user_name: string;
  user_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  timestamp: string;
  old_value?: any;
  new_value?: any;
  details?: string;
}
