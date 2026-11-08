import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    target: 'es2022', // az ütemező modul top-level await-et használ
    rollupOptions: {
      input: {
        main: path.resolve(here, 'client/index.html'),
        utemezo: path.resolve(here, 'client/utemezo/index.html'), // a v26 ütemező (v25 felület)
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
