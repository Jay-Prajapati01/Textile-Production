import { Router, Request, Response } from 'express';
import { db } from '../services/db';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const machines = db
    .getLooms()
    .slice()
    .sort((a, b) => a.loom_number - b.loom_number)
    .map((loom) => ({
      id: `MC-${loom.loom_number.toString().padStart(2, '0')}`,
      name: loom.name,
      isActive: loom.is_active,
    }));
  return res.json(machines);
});

export default router;
