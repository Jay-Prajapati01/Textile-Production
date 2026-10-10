import express, { Express, NextFunction, Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import auditRoutes from './routes/audit.routes';
import adminRoutes from './routes/admin.routes';
import authRoutes from './routes/auth.routes';
import defaultAssignmentsRoutes from './routes/defaultAssignments.routes';
import entriesRoutes from './routes/entries.routes';
import loomsRoutes from './routes/looms.routes';
import machinesRoutes from './routes/machines.routes';
import numberLinesRoutes from './routes/numberLines.routes';
import productionDaysRoutes from './routes/productionDays.routes';
import reportsRoutes from './routes/reports.routes';
import rolledOffRoutes from './routes/rolledOff.routes';
import settingsRoutes from './routes/settings.routes';
import workersRoutes from './routes/workers.routes';
import { authenticate, AuthenticatedRequest } from './middleware/auth';
import { db } from './services/db';
import { supabaseAdmin } from './services/supabase';

export const createApp = async (): Promise<Express> => {
  const app = express();

  app.use(express.json());

  app.use('/api/auth', authRoutes);
  app.use('/api/admin', authenticate, adminRoutes);
  app.use('/api', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const actor = req.actor!;
    const selected = actor.role === 'admin' ? req.header('x-tenant-id') : actor.tenantId;
    if (!selected) return res.status(400).json({ error: 'Select a factory first' });
    if (actor.role === 'admin') {
      const { data } = await supabaseAdmin.from('tenants').select('id').eq('id', selected).eq('is_active', true).single();
      if (!data) return res.status(404).json({ error: 'Factory not found' });
    } else {
      const { data } = await supabaseAdmin.from('tenants').select('is_active').eq('id', selected).single();
      if (!data?.is_active) return res.status(403).json({ error: 'Factory is inactive' });
    }
    try {
      await db.run(selected, actor.token, () => {
        const originalSend = res.send.bind(res);
        res.send = ((body: unknown) => {
          void db.persist().then(() => originalSend(body)).catch((error: Error) => {
            console.error('Tenant state save failed:', error);
            res.status(error.message.includes('revision') ? 409 : 500).type('json');
            originalSend(JSON.stringify({ error: error.message }));
          });
          return res;
        }) as typeof res.send;
        next();
      });
    } catch (error) { next(error); }
  });
  app.use('/api/machines', machinesRoutes);
  app.use('/api/looms', loomsRoutes);
  app.use('/api/workers', workersRoutes);
  app.use('/api/number-lines', numberLinesRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/entries', entriesRoutes);
  app.use('/api/rolled-off', rolledOffRoutes);
  app.use('/api/production-days', productionDaysRoutes);
  app.use('/api/default-assignments', defaultAssignmentsRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/audit-logs', auditRoutes);

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};
