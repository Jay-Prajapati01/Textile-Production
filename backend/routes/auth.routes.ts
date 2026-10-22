import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { supabaseAdmin, supabasePublic } from '../services/supabase';

const router = Router();

router.post('/login', async (req: AuthenticatedRequest, res: Response) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Email and password are required' });
  const { data, error } = await supabasePublic.auth.signInWithPassword({ email, password });
  if (error || !data.session) return res.status(401).json({ error: 'Invalid email or password' });
  return res.json({ token: data.session.access_token, refreshToken: data.session.refresh_token });
});

router.post('/refresh', async (req: AuthenticatedRequest, res: Response) => {
  const refreshToken = req.body?.refreshToken;
  if (typeof refreshToken !== 'string') return res.status(400).json({ error: 'Refresh token required' });
  const { data, error } = await supabasePublic.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) return res.status(401).json({ error: 'Session expired' });
  return res.json({ token: data.session.access_token, refreshToken: data.session.refresh_token });
});

router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const actor = req.actor!;
  if (actor.role === 'admin') {
    return res.json({ id: actor.id, name: actor.name, email: actor.email, role: actor.role, tenantId: null });
  }
  try {
    const { data, error } = await supabaseAdmin.from('tenants').select('id,name,is_active').eq('id', actor.tenantId).single();
    if (error || !data) return res.status(403).json({ error: 'Your factory assignment could not be found' });
    return res.json({ id: actor.id, name: actor.name, email: actor.email, role: actor.role,
      tenantId: data.id, companyName: data.name, tenantActive: data.is_active });
  } catch {
    return res.status(503).json({ error: 'Factory account could not be verified' });
  }
});

router.post('/change-password', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 12) {
    return res.status(400).json({ error: 'Current password and a new password of at least 12 characters are required' });
  }
  const { error: verifyError } = await supabasePublic.auth.signInWithPassword({ email: req.actor!.email, password: currentPassword });
  if (verifyError) return res.status(401).json({ error: 'Current password is incorrect' });
  const { error } = await supabaseAdmin.auth.admin.updateUserById(req.actor!.id, { password: newPassword });
  if (error) return res.status(500).json({ error: 'Password could not be changed' });
  return res.json({ success: true });
});

router.post('/logout', (_req, res) => res.json({ success: true }));

export default router;
