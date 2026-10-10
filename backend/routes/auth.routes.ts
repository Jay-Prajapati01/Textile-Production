import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { supabasePublic } from '../services/supabase';

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

router.get('/me', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const actor = req.actor!;
  return res.json({ id: actor.id, name: actor.name, email: actor.email, role: actor.role, tenantId: actor.tenantId });
});

router.post('/logout', (_req, res) => res.json({ success: true }));

export default router;
