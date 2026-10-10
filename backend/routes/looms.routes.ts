import { Router, Request, Response } from 'express';
import { db } from '../services/db';
import { getActor } from '../middleware/actor';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const looms = db.getLooms().sort((a, b) => a.loom_number - b.loom_number);
  return res.json(looms);
});

router.post('/', (req: Request, res: Response) => {
  const actor = getActor(req);
  const { loom_number, name, specification, rate, pick_rate, number_line_id, is_active } =
    req.body;
  if (!loom_number || !specification || !rate) {
    return res.status(400).json({ error: 'Loom number, specification, and rate are required' });
  }

  const newLoom = db.addLoom({
    loom_number: Number(loom_number),
    name: name || `Loom #${Number(loom_number).toString().padStart(2, '0')}`,
    specification: Number(specification),
    rate: Number(rate),
    ...(pick_rate !== undefined && pick_rate !== null && pick_rate !== ''
      ? { pick_rate: Number(pick_rate) }
      : {}),
    number_line_id: number_line_id || 'line-1',
    is_active: is_active ?? true,
  });
  db.addAuditLog({
    user_name: actor.name,
    user_email: actor.email,
    action: 'CREATE_LOOM',
    entity_type: 'LOOM',
    entity_id: newLoom.id,
    new_value: newLoom,
    details: `Created Loom #${newLoom.loom_number}`,
  });

  return res.status(201).json(newLoom);
});

router.patch('/:id', (req: Request, res: Response) => {
  const actor = getActor(req);
  const loomId = req.params.id;
  const oldLoom = db.getLooms().find((l) => l.id === loomId);
  if (!oldLoom) {
    return res.status(404).json({ error: 'Loom not found' });
  }

  const updated = db.updateLoom(loomId, req.body);
  db.addAuditLog({
    user_name: actor.name,
    user_email: actor.email,
    action: 'UPDATE_LOOM',
    entity_type: 'LOOM',
    entity_id: loomId,
    old_value: oldLoom,
    new_value: updated,
    details: `Updated Loom #${oldLoom.loom_number}`,
  });

  return res.json(updated);
});

router.post('/:id/activate', (req: Request, res: Response) => {
  const updated = db.updateLoom(req.params.id, { is_active: true });
  return res.json(updated);
});

router.post('/:id/deactivate', (req: Request, res: Response) => {
  const updated = db.updateLoom(req.params.id, { is_active: false });
  return res.json(updated);
});

export default router;
