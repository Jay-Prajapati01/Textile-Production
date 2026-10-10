import { Router, Request, Response } from 'express';
import { db } from '../services/db';
import { getActor } from '../middleware/actor';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  return res.json(db.getWorkers());
});

router.post('/', (req: Request, res: Response) => {
  const actor = getActor(req);
  const { name, code, default_price, is_active } = req.body;
  if (!name || !code) {
    return res.status(400).json({ error: 'Worker name and code are required' });
  }

  const newWorker = db.addWorker({
    name,
    code,
    default_price: Number(default_price) || 1.8,
    is_active: is_active ?? true,
  });

  db.addAuditLog({
    user_name: actor.name,
    user_email: actor.email,
    action: 'CREATE_WORKER',
    entity_type: 'WORKER',
    entity_id: newWorker.id,
    new_value: newWorker,
    details: `Created worker ${newWorker.name} (${newWorker.code})`,
  });

  return res.status(201).json(newWorker);
});

router.patch('/:id', (req: Request, res: Response) => {
  const updated = db.updateWorker(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Worker not found' });
  }
  return res.json(updated);
});

export default router;
