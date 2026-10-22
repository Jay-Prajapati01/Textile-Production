import { NextFunction, Request, Response } from 'express';
import { supabaseAdmin, supabasePublic } from '../services/supabase';

export interface AuthenticatedRequest extends Request {
  actor?: { id: string; email: string; name: string; role: 'admin' | 'factory_owner'; tenantId: string | null; token: string };
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1];
  if (!token) return res.status(401).json({ error: 'Please sign in' });
  const { data: userData, error: authError } = await supabasePublic.auth.getUser(token);
  if (authError || !userData.user) return res.status(401).json({ error: 'Session expired' });
  const { data: profile, error } = await supabaseAdmin.from('profiles')
    .select('role,tenant_id,name').eq('id', userData.user.id).single();
  if (error || !profile) return res.status(403).json({ error: 'No account profile' });
  if (profile.role !== 'admin' && profile.role !== 'factory_owner') {
    return res.status(403).json({ error: 'Account role is not configured' });
  }
  if ((profile.role === 'factory_owner' && !profile.tenant_id) || (profile.role === 'admin' && profile.tenant_id)) {
    return res.status(403).json({ error: 'Account factory assignment is invalid' });
  }
  req.actor = {
    id: userData.user.id,
    email: userData.user.email || '',
    name: profile.name || userData.user.email || 'User',
    role: profile.role,
    tenantId: profile.tenant_id,
    token,
  };
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.actor?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}
