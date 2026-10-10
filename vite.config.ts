import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    root: path.resolve(import.meta.dirname, 'frontend'),
    envDir: import.meta.dirname,
    build: { outDir: path.resolve(import.meta.dirname, 'dist'), emptyOutDir: true },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'frontend'),
      },
    },
    server: {
      port: Number(process.env.PORT) || 3002,
      watch: {
        // The JSON database file is rewritten on every API mutation. If Vite
        // watches it, @tailwindcss/vite's hotUpdate hook broadcasts a full
        // page reload on each write, wiping UI state (active tabs, toasts).
        ignored: ['**/data/**'],
      },
    },
  };
});
