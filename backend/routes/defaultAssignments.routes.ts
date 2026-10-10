import { Router, Request, Response } from 'express';
import { db } from '../services/db';
import { getActor } from '../middleware/actor';
import { DefaultAssignment } from '../types';

const router = Router();

// GET /api/default-assignments — current default roster
router.get('/', (_req: Request, res: Response) => {
  return res.json(db.getDefaultAssignments());
});

// PUT /api/default-assignments — replace the default roster
router.put('/', (req: Request, res: Response) => {
  const actor = getActor(req);
  const { assignments } = req.body;
  if (!Array.isArray(assignments)) {
    return res.status(400).json({ error: 'assignments array is required' });
  }

  const sanitized: DefaultAssignment[] = assignments
    .filter((a: any) => a && typeof a.loom_id === 'string')
    .map((a: any) => ({
      loom_id: String(a.loom_id),
      shift_a_worker_id: String(a.shift_a_worker_id || ''),
      shift_b_worker_id: String(a.shift_b_worker_id || ''),
    }));

  const saved = db.saveDefaultAssignments(sanitized);

  db.addAuditLog({
    user_name: actor.name,
    user_email: actor.email,
    action: 'SAVE_DEFAULT_ASSIGNMENTS',
    entity_type: 'DEFAULT_ASSIGNMENTS',
    entity_id: 'default-roster',
    details: `Saved default worker roster with ${saved.length} loom assignments`,
  });

  return res.json(saved);
});

export default router;
