import { Router, Request, Response } from 'express';
import { db } from '../services/db';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  return res.json(db.getNumberLines());
});

router.post('/', (req: Request, res: Response) => {
  const { name } = req.body;
  const line = db.addNumberLine({ name: name || 'New Line', is_active: true });
  return res.status(201).json(line);
});

router.patch('/:id', (req: Request, res: Response) => {
  const updated = db.updateNumberLine(req.params.id, req.body);
  return res.json(updated);
});

export default router;
