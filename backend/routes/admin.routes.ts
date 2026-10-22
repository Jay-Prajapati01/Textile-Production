import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAdmin } from '../middleware/auth';
import { createEmptyDatabase, DatabaseSchema } from '../services/db';
import { supabaseAdmin } from '../services/supabase';
import { calculate_daily_summary, calculate_meter } from '../services/calculationService';

const router = Router();
router.use(requireAdmin);

router.get('/tenants', async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('tenants').select('id,name,email,is_active,created_at').order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

router.get('/overview', async (req, res) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!validDate(from) || !validDate(to) || from > to) return res.status(400).json({ error: 'Valid from and to dates are required' });
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  const span = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (span > 366) return res.status(400).json({ error: 'Date range cannot exceed 366 days' });

  const [tenants, snapshots] = await Promise.all([
    supabaseAdmin.from('tenants').select('id,name,email,is_active,created_at').order('created_at'),
    supabaseAdmin.from('tenant_states').select('tenant_id,state,updated_at'),
  ]);
  if (tenants.error) return res.status(500).json({ error: tenants.error.message });
  if (snapshots.error) return res.status(500).json({ error: snapshots.error.message });
  const dates: string[] = [];
  for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) dates.push(date.toISOString().slice(0, 10));
  const series = dates.map((date) => ({ date, production: 0, meters: 0, revenue: 0, factories_reporting: 0 }));
  const factoryMetrics: Array<Record<string, unknown>> = [];
  const loomTotals = new Map<string, { factory: string; loom: string; meters: number; production: number }>();
  const workerTotals = new Map<string, { factory: string; worker: string; code: string; wages: number; meters: number }>();
  let shiftA = 0; let shiftB = 0; let production = 0; let meters = 0; let revenue = 0; let recordedDays = 0;
  let totalLooms = 0; let activeLooms = 0; let totalWorkers = 0; let efficiencySum = 0; let efficiencyCount = 0;

  const activeTenantIds = new Set((tenants.data || []).filter((tenant) => tenant.is_active).map((tenant) => tenant.id));
  for (const snapshot of snapshots.data || []) {
    const tenant = (tenants.data || []).find((item) => item.id === snapshot.tenant_id);
    if (!tenant) continue;
    const includeInPortfolio = activeTenantIds.has(tenant.id);
    const state = snapshot.state as unknown as DatabaseSchema;
    const looms = state.looms || []; const workers = state.workers || [];
    const days = state.production_days || []; const productions = state.loom_productions || [];
    const byDate = new Map(days.map((day) => [day.production_date, day]));
    const daily = dates.map((date, index) => {
      const day = byDate.get(date);
      const dayProductions = day ? productions.filter((row) => row.production_day_id === day.id) : [];
      const workerEntries = day ? (state.worker_entries || []).filter((row) => row.production_day_id === day.id) : [];
      const summary = calculate_daily_summary(date, day, looms, dayProductions, workerEntries, workers,
        state.number_lines || [], state.settings, state.submitted_entries || [], days, productions);
      const point = series[index];
      if (includeInPortfolio) {
        point.production += summary.grand_total;
        point.meters += summary.total_meter;
        point.revenue += summary.total_rs;
        if (summary.grand_total > 0) point.factories_reporting += 1;
      }
      return summary;
    });
    const periodDays = daily.filter((summary) => byDate.has(summary.date));
    const totals = periodDays.reduce((sum, summary) => ({
      shift_a: sum.shift_a + summary.total_shift_a,
      shift_b: sum.shift_b + summary.total_shift_b,
      production: sum.production + summary.grand_total,
      meters: sum.meters + summary.total_meter,
      revenue: sum.revenue + summary.total_rs,
    }), { shift_a: 0, shift_b: 0, production: 0, meters: 0, revenue: 0 });
    const recorded = days.filter((day) => day.production_date >= from && day.production_date <= to);
    const lastActivity = snapshot.updated_at;
    const dayMap = new Map(days.map((day) => [day.id, day.production_date]));
    const periodProductions = productions.filter((row) => {
      const date = dayMap.get(row.production_day_id);
      return !!date && date >= from && date <= to;
    });
    for (const row of includeInPortfolio ? periodProductions : []) {
      const loom = looms.find((item) => item.id === row.loom_id);
      if (!loom) continue;
      const key = `${tenant.id}:${loom.id}`;
      const current = loomTotals.get(key) || { factory: tenant.name, loom: loom.name || `Loom ${loom.loom_number}`, meters: 0, production: 0 };
      current.production += row.shift_a + row.shift_b;
      current.meters += calculate_meter(row.shift_a + row.shift_b, loom.specification, state.settings?.meter_conversion_factor || 25.4);
      loomTotals.set(key, current);
    }
    for (const summary of includeInPortfolio ? periodDays : []) {
      if (includeInPortfolio && summary.grand_total > 0) { efficiencySum += summary.percentage; efficiencyCount += 1; }
      for (const row of summary.rows) {
        for (const workerId of [row.shift_a_worker_id, row.shift_b_worker_id]) {
          if (!workerId) continue;
          const worker = workers.find((item) => item.id === workerId);
          if (!worker) continue;
          const key = `${tenant.id}:${worker.id}`;
          const total = workerTotals.get(key) || { factory: tenant.name, worker: worker.name, code: worker.code, wages: 0, meters: 0 };
          const assignment = (state.worker_entries || []).find((entry) => entry.loom_id === row.loom_id && dayMap.get(entry.production_day_id || '') === summary.date);
          const sideMeters = calculate_meter(workerId === row.shift_a_worker_id ? row.shift_a : row.shift_b, row.specification, state.settings?.meter_conversion_factor || 25.4);
          const price = assignment?.price_override ?? worker.default_price ?? 0;
          total.meters += sideMeters;
          total.wages += sideMeters * price;
          workerTotals.set(key, total);
        }
      }
    }
    if (includeInPortfolio) {
      totalLooms += looms.length; activeLooms += looms.filter((loom) => loom.is_active).length; totalWorkers += workers.filter((worker) => worker.is_active).length;
      shiftA += totals.shift_a; shiftB += totals.shift_b; production += totals.production; meters += totals.meters; revenue += totals.revenue; recordedDays += recorded.length;
    }
    const productiveDays = periodDays.filter((item) => item.grand_total > 0);
    factoryMetrics.push({ id: tenant.id, name: tenant.name, email: tenant.email, is_active: tenant.is_active,
      created_at: tenant.created_at, last_activity: lastActivity, loom_count: looms.length,
      active_loom_count: looms.filter((loom) => loom.is_active).length,
      worker_count: workers.filter((worker) => worker.is_active).length,
      days_recorded: recorded.length, shift_a: totals.shift_a, shift_b: totals.shift_b,
      production: totals.production, meters: totals.meters, revenue: totals.revenue,
      average_efficiency: productiveDays.length
        ? productiveDays.reduce((sum, item) => sum + item.percentage, 0) / productiveDays.length
        : 0 });
  }
  for (const point of series) { point.production = Math.round(point.production * 100) / 100; point.meters = Math.round(point.meters * 100) / 100; point.revenue = Math.round(point.revenue * 100) / 100; }
  const allTenants = tenants.data || [];
  return res.json({ from, to, days: span, tenant_count: allTenants.length,
    active_tenants: allTenants.filter((tenant) => tenant.is_active).length,
    inactive_tenants: allTenants.filter((tenant) => !tenant.is_active).length,
    total_looms: totalLooms, active_looms: activeLooms, total_workers: totalWorkers,
    shift_a: shiftA, shift_b: shiftB, production, meters, revenue, recorded_days: recordedDays,
    average_efficiency: efficiencyCount ? efficiencySum / efficiencyCount : 0,
    trend: series, factories: factoryMetrics.sort((a, b) => Number(b.meters) - Number(a.meters)),
    top_looms: [...loomTotals.values()].sort((a, b) => b.meters - a.meters).slice(0, 10),
    top_workers: [...workerTotals.values()].sort((a, b) => b.wages - a.wages).slice(0, 10),
  });
});

router.post('/tenants', async (req: AuthenticatedRequest, res: Response) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !email.includes('@') || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Name, valid email and password of at least 8 characters required' });
  }
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (authError || !authData.user) return res.status(400).json({ error: authError?.message || 'Account creation failed' });
  const userId = authData.user.id;
  const { data: tenant, error: tenantError } = await supabaseAdmin.from('tenants')
    .insert({ name: name.trim(), email: email.trim().toLowerCase(), created_by: req.actor!.id })
    .select('id,name,email,is_active,created_at').single();
  if (tenantError || !tenant) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return res.status(400).json({ error: tenantError?.message || 'Tenant creation failed' });
  }
  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    id: userId, name: name.trim(), role: 'factory_owner', tenant_id: tenant.id,
  });
  const { error: stateError } = profileError ? { error: profileError } : await supabaseAdmin.from('tenant_states').insert({
    tenant_id: tenant.id, state: createEmptyDatabase(),
  });
  if (stateError) {
    await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return res.status(500).json({ error: stateError.message });
  }
  return res.status(201).json(tenant);
});

router.patch('/tenants/:id', async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id;
  const { name, email, is_active } = req.body || {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Factory name cannot be empty' });
    updates.name = name.trim();
  }
  if (email !== undefined) {
    if (typeof email !== 'string' || !email.includes('@')) return res.status(400).json({ error: 'Valid owner email required' });
    updates.email = email.trim().toLowerCase();
  }
  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') return res.status(400).json({ error: 'is_active must be a boolean' });
    updates.is_active = is_active;
  }
  const { data: previousTenant, error: lookupError } = await supabaseAdmin.from('tenants').select('id,name,email,is_active,created_at').eq('id', id).single();
  if (lookupError || !previousTenant) return res.status(404).json({ error: lookupError?.message || 'Factory not found' });
  const { data: profile } = email !== undefined
    ? await supabaseAdmin.from('profiles').select('id').eq('tenant_id', id).eq('role', 'factory_owner').maybeSingle()
    : { data: null };
  if (email !== undefined && profile && email.trim().toLowerCase() !== previousTenant.email.toLowerCase()) {
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(profile.id, { email: email.trim().toLowerCase(), email_confirm: true });
    if (authError) return res.status(409).json({ error: 'Owner login email could not be changed: ' + authError.message });
  }
  const { data: tenant, error } = await supabaseAdmin.from('tenants').update(updates).eq('id', id)
    .select('id,name,email,is_active,created_at').single();
  if (error || !tenant) {
    if (profile && email !== undefined && email.trim().toLowerCase() !== previousTenant.email.toLowerCase()) {
      await supabaseAdmin.auth.admin.updateUserById(profile.id, { email: previousTenant.email, email_confirm: true });
    }
    return res.status(400).json({ error: error?.message || 'Factory update failed' });
  }
  if (name !== undefined) await supabaseAdmin.from('profiles').update({ name: tenant.name }).eq('tenant_id', id).eq('role', 'factory_owner');
  return res.json(tenant);
});

export default router;
