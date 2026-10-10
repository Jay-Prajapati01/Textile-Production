import {
  CalculatedLoomRow,
  DailySummary,
  Loom,
  LoomProduction,
  MonthlySummary,
  NumberLine,
  ProductionDay,
  ProductionSettings,
  SubmittedEntry,
  Worker,
  WorkerEntry,
} from '../types';

/**
 * 1. Calculate Loom Production Total
 * Total = Shift A + Shift B
 */
export function calculate_total(shift_a: number, shift_b: number): number {
  const a = Math.max(0, Number(shift_a) || 0);
  const b = Math.max(0, Number(shift_b) || 0);
  return Math.round((a + b) * 100) / 100;
}

/**
 * 2. Calculate Daily Average
 * Average = Total / Divisor (usually 76 or active looms)
 */
export function calculate_average(total: number, divisor: number): number {
  if (!divisor || divisor <= 0) return 0;
  return Math.round((total / divisor) * 1000) / 1000;
}

/**
 * 3. Calculate Efficiency Percentage
 * Percentage = (Average * 100) / Maximum Production (e.g. 152)
 */
export function calculate_percentage(average: number, maximum_production: number): number {
  if (!maximum_production || maximum_production <= 0) return 0;
  const pct = (average * 100) / maximum_production;
  return Math.round(pct * 100) / 100;
}

/**
 * 4. Calculate Meter / MTS
 * Meter = Total * ConversionFactor (25.4) / Loom Specification (picks/reed)
 */
export function calculate_meter(
  total: number,
  specification: number,
  conversion_factor: number = 25.4
): number {
  if (!specification || specification <= 0) return 0;
  const meter = (total * conversion_factor) / specification;
  return Math.round(meter * 100) / 100;
}

/**
 * 5. Calculate Revenue (Rs/Day)
 * Rs/Day = Meter * Loom Rate
 */
export function calculate_rs(meter: number, rate: number): number {
  const r = Math.max(0, Number(rate) || 0);
  return Math.round(meter * r * 100) / 100;
}

/**
 * Calculate full row for a loom
 */
export function calculate_loom_row(
  loom: Loom,
  production: LoomProduction | undefined,
  workerEntry: WorkerEntry | undefined,
  worker: Worker | undefined,
  numberLine: NumberLine | undefined,
  settings: ProductionSettings,
  entry: SubmittedEntry | null = null,
  beamContext: { opening_meter: number; cumulative_meter: number } | null = null,
  shiftWorkers: { shiftA?: Worker; shiftB?: Worker } = {}
): CalculatedLoomRow {
  const shift_a = production ? production.shift_a : 0;
  const shift_b = production ? production.shift_b : 0;
  const total = calculate_total(shift_a, shift_b);
  const average = calculate_average(total, settings.average_divisor);
  const percentage = calculate_percentage(average, settings.maximum_production);
  const meter = calculate_meter(total, loom.specification, settings.meter_conversion_factor);
  const rs = calculate_rs(meter, loom.rate);
  const batch_number = entry ? entry.batchNumber : null;
  const beam_meter = entry ? entry.beamMeter : null;
  const opening_meter = entry ? beamContext?.opening_meter ?? 0 : null;
  const cumulative_meter = entry ? beamContext?.cumulative_meter ?? meter : null;
  const remaining_meter =
    beam_meter !== null && cumulative_meter !== null
      ? Math.round((beam_meter - cumulative_meter) * 100) / 100
      : null;

  return {
    loom_id: loom.id,
    loom_number: loom.loom_number,
    loom_name: loom.name,
    number_line_id: loom.number_line_id,
    number_line_name: numberLine?.name || 'Line 1',
    specification: loom.specification,
    rate: loom.rate,
    is_active: loom.is_active,
    shift_a,
    shift_b,
    total,
    average,
    percentage,
    meter,
    rs,
    batch_number,
    beam_meter,
    opening_meter,
    cumulative_meter,
    remaining_meter,
    worker_id: worker?.id,
    worker_name: worker?.name,
    worker_code: worker?.code,
    worker_price: workerEntry?.price_override ?? worker?.default_price ?? 0,
    remark: workerEntry?.remark || '',
    shift_a_worker_id: shiftWorkers.shiftA?.id ?? workerEntry?.shift_a_worker_id ?? '',
    shift_a_worker_name: shiftWorkers.shiftA?.name,
    shift_a_worker_code: shiftWorkers.shiftA?.code,
    shift_a_remark: workerEntry?.remark || '',
    shift_b_worker_id: shiftWorkers.shiftB?.id ?? workerEntry?.shift_b_worker_id ?? '',
    shift_b_worker_name: shiftWorkers.shiftB?.name,
    shift_b_worker_code: shiftWorkers.shiftB?.code,
    shift_b_remark: workerEntry?.shift_b_remark || '',
  };
}

/**
 * 6. Calculate Daily Summary
 */
export function calculate_daily_summary(
  date: string,
  day: ProductionDay | undefined,
  looms: Loom[],
  productions: LoomProduction[],
  workerEntries: WorkerEntry[],
  workers: Worker[],
  numberLines: NumberLine[],
  settings: ProductionSettings,
  entries: SubmittedEntry[] = [],
  allDays: ProductionDay[] = [],
  allProductions: LoomProduction[] = []
): DailySummary {
  const prodMap = new Map<string, LoomProduction>();
  productions.forEach((p) => prodMap.set(p.loom_id, p));

  const workerEntryMap = new Map<string, WorkerEntry>();
  workerEntries.forEach((w) => workerEntryMap.set(w.loom_id, w));

  const workerMap = new Map<string, Worker>();
  workers.forEach((w) => workerMap.set(w.id, w));

  const lineMap = new Map<string, NumberLine>();
  numberLines.forEach((l) => lineMap.set(l.id, l));

  const activeEntryMap = new Map<number, SubmittedEntry>();
  entries.forEach((e) => {
    const machineNo = Number(String(e.machineNumber).replace(/\D/g, ''));
    if (!Number.isFinite(machineNo) || machineNo <= 0) return;
    if (String(e.startedDate) > date) return;
    if (e.finishedDate && String(e.finishedDate) < date) return;
    const prev = activeEntryMap.get(machineNo);
    if (!prev || String(e.startedDate) > String(prev.startedDate)) {
      activeEntryMap.set(machineNo, e);
    }
  });

  // Sort looms by loom_number
  const sortedLooms = [...looms].sort((a, b) => a.loom_number - b.loom_number);

  // Beam carry-forward: cumulative consumption per loom from entry.startedDate .. date
  const dateByDayId = new Map<string, string>();
  allDays.forEach((d) => dateByDayId.set(d.id, d.production_date));

  const beamContextFor = (
    loom: Loom,
    entry: SubmittedEntry
  ): { opening_meter: number; cumulative_meter: number } => {
    const windowStart = String(entry.startedDate);
    let cumulative = 0;
    let todayMeter = 0;
    for (const p of allProductions) {
      if (p.loom_id !== loom.id) continue;
      const dayDate = dateByDayId.get(p.production_day_id);
      if (!dayDate || dayDate < windowStart || dayDate > date) continue;
      const m = calculate_meter(
        calculate_total(p.shift_a, p.shift_b),
        loom.specification,
        settings.meter_conversion_factor
      );
      cumulative += m;
      if (dayDate === date) todayMeter += m;
    }
    cumulative = Math.round(cumulative * 100) / 100;
    const opening = Math.round((cumulative - todayMeter) * 100) / 100;
    return { opening_meter: opening, cumulative_meter: cumulative };
  };

  const rows: CalculatedLoomRow[] = sortedLooms.map((loom) => {
    const prod = prodMap.get(loom.id);
    const wEntry = workerEntryMap.get(loom.id);
    const worker = wEntry ? workerMap.get(wEntry.worker_id) : undefined;
    const shiftAId = wEntry?.shift_a_worker_id ?? wEntry?.worker_id ?? '';
    const shiftBId = wEntry?.shift_b_worker_id ?? '';
    const shiftAWorker = shiftAId ? workerMap.get(shiftAId) : undefined;
    const shiftBWorker = shiftBId ? workerMap.get(shiftBId) : undefined;
    const line = lineMap.get(loom.number_line_id);
    const entry = activeEntryMap.get(loom.loom_number) ?? null;
    const beamContext = entry ? beamContextFor(loom, entry) : null;
    return calculate_loom_row(loom, prod, wEntry, worker, line, settings, entry, beamContext, {
      shiftA: shiftAWorker,
      shiftB: shiftBWorker,
    });
  });

  const activeLooms = sortedLooms.filter((l) => l.is_active);
  const total_shift_a = Math.round(rows.reduce((sum, r) => sum + r.shift_a, 0) * 100) / 100;
  const total_shift_b = Math.round(rows.reduce((sum, r) => sum + r.shift_b, 0) * 100) / 100;
  const grand_total = Math.round((total_shift_a + total_shift_b) * 100) / 100;

  // Divisor: use settings.average_divisor or number of active sides (looms * 2)
  const divisor = settings.average_divisor > 0 ? settings.average_divisor : activeLooms.length * 2;
  const average = calculate_average(grand_total, divisor);
  const percentage = calculate_percentage(average, settings.maximum_production);
  const total_meter = Math.round(rows.reduce((sum, r) => sum + r.meter, 0) * 100) / 100;
  const total_rs = Math.round(rows.reduce((sum, r) => sum + r.rs, 0) * 100) / 100;

  // Number Line breakdown
  const line_summaries = numberLines.map((line) => {
    const lineRows = rows.filter((r) => r.number_line_id === line.id);
    const s_a = Math.round(lineRows.reduce((acc, r) => acc + r.shift_a, 0) * 100) / 100;
    const s_b = Math.round(lineRows.reduce((acc, r) => acc + r.shift_b, 0) * 100) / 100;
    const tot = Math.round((s_a + s_b) * 100) / 100;
    const mtr = Math.round(lineRows.reduce((acc, r) => acc + r.meter, 0) * 100) / 100;
    const rev = Math.round(lineRows.reduce((acc, r) => acc + r.rs, 0) * 100) / 100;

    return {
      line_id: line.id,
      line_name: line.name,
      loom_count: lineRows.length,
      shift_a: s_a,
      shift_b: s_b,
      total: tot,
      meter: mtr,
      rs: rev,
    };
  });

  return {
    date,
    status: day ? day.status : 'draft',
    day_id: day?.id,
    total_looms: looms.length,
    active_looms: activeLooms.length,
    total_shift_a,
    total_shift_b,
    grand_total,
    average,
    percentage,
    total_meter,
    total_rs,
    line_summaries,
    rows,
  };
}

/**
 * 7. Calculate Monthly Summary
 */
export function calculate_monthly_summary(
  year: number,
  month: number, // 1 to 12
  dailySummaries: DailySummary[],
  looms: Loom[],
  numberLines: NumberLine[],
  workers: Worker[],
  settings: ProductionSettings
): MonthlySummary {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const month_name = monthNames[month - 1] || `Month ${month}`;

  let total_shift_a = 0;
  let total_shift_b = 0;
  let grand_total = 0;
  let total_meter = 0;
  let total_rs = 0;

  const daily_breakdown = dailySummaries.map((ds) => {
    total_shift_a += ds.total_shift_a;
    total_shift_b += ds.total_shift_b;
    grand_total += ds.grand_total;
    total_meter += ds.total_meter;
    total_rs += ds.total_rs;

    return {
      date: ds.date,
      status: ds.status,
      shift_a: ds.total_shift_a,
      shift_b: ds.total_shift_b,
      total: ds.grand_total,
      average: ds.average,
      percentage: ds.percentage,
      meter: ds.total_meter,
      rs: ds.total_rs,
    };
  });

  total_shift_a = Math.round(total_shift_a * 100) / 100;
  total_shift_b = Math.round(total_shift_b * 100) / 100;
  grand_total = Math.round(grand_total * 100) / 100;
  total_meter = Math.round(total_meter * 100) / 100;
  total_rs = Math.round(total_rs * 100) / 100;

  const days_recorded = dailySummaries.length;
  const avg_daily_production =
    days_recorded > 0 ? Math.round((grand_total / days_recorded) * 100) / 100 : 0;
  const overall_average =
    days_recorded > 0 && settings.average_divisor > 0
      ? calculate_average(avg_daily_production, settings.average_divisor)
      : 0;
  const overall_percentage = calculate_percentage(overall_average, settings.maximum_production);

  // Loom breakdown across month
  const lineMap = new Map<string, NumberLine>();
  numberLines.forEach((l) => lineMap.set(l.id, l));

  const loom_breakdown = looms
    .sort((a, b) => a.loom_number - b.loom_number)
    .map((loom) => {
      let l_shift_a = 0;
      let l_shift_b = 0;
      let l_total = 0;
      let l_meter = 0;
      let l_rs = 0;

      dailySummaries.forEach((ds) => {
        const row = ds.rows.find((r) => r.loom_id === loom.id);
        if (row) {
          l_shift_a += row.shift_a;
          l_shift_b += row.shift_b;
          l_total += row.total;
          l_meter += row.meter;
          l_rs += row.rs;
        }
      });

      return {
        loom_id: loom.id,
        loom_number: loom.loom_number,
        loom_name: loom.name,
        number_line_name: lineMap.get(loom.number_line_id)?.name || 'Line 1',
        specification: loom.specification,
        rate: loom.rate,
        shift_a: Math.round(l_shift_a * 100) / 100,
        shift_b: Math.round(l_shift_b * 100) / 100,
        total: Math.round(l_total * 100) / 100,
        meter: Math.round(l_meter * 100) / 100,
        rs: Math.round(l_rs * 100) / 100,
      };
    });

  // Number Line breakdown across month
  const number_line_breakdown = numberLines.map((line) => {
    let line_total = 0;
    let line_meter = 0;
    let line_rs = 0;
    let loom_count = 0;

    loom_breakdown.forEach((lb) => {
      const loom = looms.find((l) => l.id === lb.loom_id);
      if (loom && loom.number_line_id === line.id) {
        loom_count++;
        line_total += lb.total;
        line_meter += lb.meter;
        line_rs += lb.rs;
      }
    });

    return {
      line_id: line.id,
      line_name: line.name,
      loom_count,
      total: Math.round(line_total * 100) / 100,
      meter: Math.round(line_meter * 100) / 100,
      rs: Math.round(line_rs * 100) / 100,
    };
  });

  // Worker breakdown across month
  const worker_breakdown = workers.map((w) => {
    let assigned_days_count = 0;
    let total_meters = 0;
    let total_wages = 0;

    dailySummaries.forEach((ds) => {
      const assignedRows = ds.rows.filter((r) => r.worker_id === w.id);
      if (assignedRows.length > 0) {
        assigned_days_count++;
        assignedRows.forEach((r) => {
          total_meters += r.meter;
          const wagePrice = r.worker_price || w.default_price || 0;
          total_wages += r.meter * wagePrice;
        });
      }
    });

    return {
      worker_id: w.id,
      worker_name: w.name,
      worker_code: w.code,
      assigned_days_count,
      total_meters: Math.round(total_meters * 100) / 100,
      total_wages: Math.round(total_wages * 100) / 100,
    };
  });

  const base_rs = total_rs;
  // Apply adjustment: e.g. Base + Adjustment (e.g. -35000)
  const adjustment_amount = settings.adjustment_amount || 0;
  const final_adjusted_rs = Math.max(0, Math.round((base_rs + adjustment_amount) * 100) / 100);

  return {
    year,
    month,
    month_name,
    days_recorded,
    total_shift_a,
    total_shift_b,
    grand_total,
    avg_daily_production,
    overall_percentage,
    total_meter,
    total_rs,
    base_rs,
    adjustment_amount,
    final_adjusted_rs,
    daily_breakdown,
    loom_breakdown,
    number_line_breakdown,
    worker_breakdown,
  };
}
