import { Router, Request, Response } from 'express';
import { db } from '../services/db';
import { getActor } from '../middleware/actor';
import { getLocalToday, requiredMissing } from '../utils/validation';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const entries = db
    .getRolledOffEntries()
    .slice()
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  return res.json(entries);
});

router.post('/', (req: Request, res: Response) => {
  const actor = getActor(req);
  const { machineNumber, rollDoffDate, meters, glmFabric, weight } = req.body;

  const missing = requiredMissing([
    ['machineNumber', machineNumber],
    ['meters', meters],
    ['weight', weight],
  ]);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Required fields missing: ${missing.join(', ')}` });
  }

  const metersValue = Number(meters);
  const weightValue = Number(weight);
  if (!Number.isFinite(metersValue) || metersValue < 0) {
    return res.status(400).json({ error: 'Meters must be a number of 0 or more' });
  }
  if (!Number.isFinite(weightValue) || weightValue < 0) {
    return res.status(400).json({ error: 'Weight must be a number of 0 or more' });
  }

  const today = getLocalToday();
  const doffDate = rollDoffDate ? String(rollDoffDate) : today;
  if (doffDate > today) {
    return res.status(400).json({ error: 'Roll Doff Date cannot be in the future' });
  }

  const computedGlmFabric =
    metersValue > 0
      ? weightValue / metersValue
      : Number.isFinite(Number(glmFabric))
      ? Number(glmFabric)
      : 0;

  const entry = db.addRolledOffEntry({
    machineNumber: String(machineNumber),
    rollDoffDate: doffDate,
    meters: metersValue,
    glmFabric: computedGlmFabric,
    weight: weightValue,
  });

  db.addAuditLog({
    user_name: actor.name,
    user_email: actor.email,
    action: 'CREATE_ROLLED_OFF_ENTRY',
    entity_type: 'ROLLED_OFF_ENTRY',
    entity_id: entry.id,
    new_value: entry,
    details: `Saved rolled off entry ${entry.id} for machine ${entry.machineNumber}`,
  });

  return res.status(201).json(entry);
});

export default router;
