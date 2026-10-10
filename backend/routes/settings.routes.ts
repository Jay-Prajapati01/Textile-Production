import { Router, Request, Response } from 'express';
import { db } from '../services/db';
import { getActor } from '../middleware/actor';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  return res.json(db.getSettings());
});

router.patch('/', (req: Request, res: Response) => {
  const actor = getActor(req);
  const oldSettings = db.getSettings();
  const updated = db.updateSettings(req.body);

  db.addAuditLog({
    user_name: actor.name,
    user_email: actor.email,
    action: 'UPDATE_SETTINGS',
    entity_type: 'SETTINGS',
    entity_id: 'default',
    old_value: oldSettings,
    new_value: updated,
    details: 'Updated calculation settings (divisor/max/factor/adjustment)',
  });

  return res.json(updated);
});

export default router;
