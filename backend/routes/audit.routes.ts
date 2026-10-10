import { Router, Request, Response } from 'express';
import { db } from '../services/db';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  return res.json(db.getAuditLogs());
});

export default router;
