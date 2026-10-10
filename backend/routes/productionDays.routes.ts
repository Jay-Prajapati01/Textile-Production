import { Router, Request, Response } from 'express';
import { db } from '../services/db';
import { getActor } from '../middleware/actor';
import { computeDailySummary } from '../services/summaryService';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const dateParam = req.query.date as string;
  if (dateParam) {
    const summary = computeDailySummary(dateParam);
    return res.json(summary);
  }
  const days = db
    .getProductionDays()
    .sort((a, b) => b.production_date.localeCompare(a.production_date));
  return res.json(days);
});

router.post('/', (req: Request, res: Response) => {
  const actor = getActor(req);
  const { date, productions } = req.body;
  if (!date) {
    return res.status(400).json({ error: 'Production date is required' });
  }

  const day = db.getOrCreateProductionDay(date, actor.name);
  if (day.status === 'locked') {
    return res.status(423).json({ error: 'This production day is locked and cannot be modified' });
  }

  if (Array.isArray(productions)) {
    db.saveLoomProductions(day.id, productions);
  }

  db.addAuditLog({
    user_name: actor.name,
    user_email: actor.email,
    action: 'SAVE_DAILY_PRODUCTION',
    entity_type: 'PRODUCTION_DAY',
    entity_id: day.id,
    details: `Saved shift production values for ${date}`,
  });

  const summary = computeDailySummary(date);
  return res.json(summary);
});

// Ensure a production day exists for the date (creates it + auto-applies the
// default worker roster). Used by Worker-Wivar when opening a brand-new date.
router.post('/ensure', (req: Request, res: Response) => {
  const actor = getActor(req);
  const { date } = req.body;
  if (!date) {
    return res.status(400).json({ error: 'Production date is required' });
  }
  const day = db.getOrCreateProductionDay(date, actor.name);
  // Day may pre-exist without entries (created before defaults were set) —
  // apply the roster if it is still empty.
  db.applyDefaultsIfEmpty(day.id);
  const summary = computeDailySummary(date);
  return res.json(summary);
});

router.put('/:id', (req: Request, res: Response) => {
  const actor = getActor(req);
  const dayId = req.params.id;
  const day = db.getProductionDays().find((d) => d.id === dayId);
  if (!day) {
    return res.status(404).json({ error: 'Production day not found' });
  }
  if (day.status === 'locked') {
    return res.status(423).json({ error: 'This production day is locked and cannot be modified' });
  }

  const { productions } = req.body;
  if (Array.isArray(productions)) {
    db.saveLoomProductions(dayId, productions);
  }

  db.addAuditLog({
    user_name: actor.name,
    user_email: actor.email,
    action: 'UPDATE_DAILY_PRODUCTION',
    entity_type: 'PRODUCTION_DAY',
    entity_id: day.id,
    details: `Updated production values for date ${day.production_date}`,
  });

  const summary = computeDailySummary(day.production_date);
  return res.json(summary);
});

router.post('/:id/complete', (req: Request, res: Response) => {
  const actor = getActor(req);
  const dayId = req.params.id;
  const updated = db.updateProductionDayStatus(dayId, 'completed', actor.name);
  if (!updated) {
    return res.status(404).json({ error: 'Production day not found' });
  }

  db.addAuditLog({
    user_name: actor.name,
    user_email: actor.email,
    action: 'COMPLETE_PRODUCTION_DAY',
    entity_type: 'PRODUCTION_DAY',
    entity_id: dayId,
    details: `Marked day ${updated.production_date} as completed`,
  });

  const summary = computeDailySummary(updated.production_date);
  return res.json(summary);
});

router.post('/:id/lock', (req: Request, res: Response) => {
  const actor = getActor(req);
  const dayId = req.params.id;
  const updated = db.updateProductionDayStatus(dayId, 'locked', actor.name);
  if (!updated) {
    return res.status(404).json({ error: 'Production day not found' });
  }

  db.addAuditLog({
    user_name: actor.name,
    user_email: actor.email,
    action: 'LOCK_PRODUCTION_DAY',
    entity_type: 'PRODUCTION_DAY',
    entity_id: dayId,
    details: `Locked day ${updated.production_date} against alterations`,
  });

  const summary = computeDailySummary(updated.production_date);
  return res.json(summary);
});

router.post('/:id/unlock', (req: Request, res: Response) => {
  const actor = getActor(req);
  const dayId = req.params.id;
  const updated = db.updateProductionDayStatus(dayId, 'draft', actor.name);
  if (!updated) {
    return res.status(404).json({ error: 'Production day not found' });
  }

  db.addAuditLog({
    user_name: actor.name,
    user_email: actor.email,
    action: 'UNLOCK_PRODUCTION_DAY',
    entity_type: 'PRODUCTION_DAY',
    entity_id: dayId,
    details: `Unlocked day ${updated.production_date} for editing`,
  });

  const summary = computeDailySummary(updated.production_date);
  return res.json(summary);
});

router.get('/:id/workers', (req: Request, res: Response) => {
  const entries = db.getWorkerEntries(req.params.id);
  return res.json(entries);
});

router.put('/:id/workers', (req: Request, res: Response) => {
  const actor = getActor(req);
  const dayId = req.params.id;
  const day = db.getProductionDays().find((d) => d.id === dayId);
  if (!day) {
    return res.status(404).json({ error: 'Production day not found' });
  }
  if (day.status === 'locked') {
    return res.status(423).json({ error: 'This production day is locked and cannot be modified' });
  }

  const { entries } = req.body;
  if (Array.isArray(entries)) {
    db.saveWorkerEntries(dayId, entries);
  }

  db.addAuditLog({
    user_name: actor.name,
    user_email: actor.email,
    action: 'UPDATE_WORKER_ENTRIES',
    entity_type: 'PRODUCTION_DAY',
    entity_id: dayId,
    details: `Updated worker assignments for date ${day.production_date}`,
  });

  const summary = computeDailySummary(day.production_date);
  return res.json(summary);
});

export default router;
