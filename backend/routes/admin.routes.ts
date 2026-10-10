import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAdmin } from '../middleware/auth';
import { createEmptyDatabase } from '../services/db';
import { supabaseAdmin } from '../services/supabase';

const router = Router();
router.use(requireAdmin);

router.get('/tenants', async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('tenants').select('id,name,email,is_active,created_at').order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
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

export default router;
