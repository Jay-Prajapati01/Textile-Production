import { Router, Request, Response } from 'express';
import { db } from '../services/db';
import { getActor } from '../middleware/actor';
import { getLocalToday, requiredMissing } from '../utils/validation';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const entries = db
    .getSubmittedEntries()
    .slice()
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  return res.json(entries);
});

router.post('/', (req: Request, res: Response) => {
  const actor = getActor(req);
  const {
    machineNumber,
    sortNumber,
    productionNumber,
    flangeNumber,
    batchNumber,
    beamMeter,
    beamNetWeight,
    glm,
    startedDate,
    finishedDate,
  } = req.body;

  const missing = requiredMissing([
    ['machineNumber', machineNumber],
    ['sortNumber', sortNumber],
    ['productionNumber', productionNumber],
    ['flangeNumber', flangeNumber],
    ['batchNumber', batchNumber],
    ['startedDate', startedDate],
  ]);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Required fields missing: ${missing.join(', ')}` });
  }

  const meter = Number(beamMeter);
  const weight = Number(beamNetWeight);
  if (!Number.isFinite(meter) || meter < 0) {
    return res.status(400).json({ error: 'Beam Meter must be a number of 0 or more' });
  }
  if (!Number.isFinite(weight) || weight < 0) {
    return res.status(400).json({ error: 'Beam Net Weight must be a number of 0 or more' });
  }

  const today = getLocalToday();
  if (String(startedDate) > today) {
    return res.status(400).json({ error: 'Started Date cannot be in the future' });
  }
  if (finishedDate && String(finishedDate) > today) {
    return res.status(400).json({ error: 'Finished Date cannot be in the future' });
  }

  const computedGlm =
    meter > 0 ? weight / meter : Number.isFinite(Number(glm)) ? Number(glm) : 0;

  const entry = db.addSubmittedEntry({
    machineNumber: String(machineNumber),
    sortNumber: String(sortNumber),
    productionNumber: String(productionNumber),
    flangeNumber: String(flangeNumber),
    batchNumber: String(batchNumber),
    beamMeter: meter,
    beamNetWeight: weight,
    glm: computedGlm,
    startedDate: String(startedDate),
    finishedDate: finishedDate ? String(finishedDate) : null,
  });

  db.addAuditLog({
    user_name: actor.name,
    user_email: actor.email,
    action: 'CREATE_FIRST_ENTRY',
    entity_type: 'ENTRY',
    entity_id: entry.id,
    new_value: entry,
    details: `Saved first entry ${entry.id} for machine ${entry.machineNumber}`,
  });

  return res.status(201).json(entry);
});

export default router;
