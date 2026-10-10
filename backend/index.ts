import 'dotenv/config';
import { createApp } from './app';

const PORT = Number(process.env.PORT) || 3002;

const startServer = async () => {
  const app = await createApp();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Loom Production Management System running on http://localhost:${PORT}`);
  });
};

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
