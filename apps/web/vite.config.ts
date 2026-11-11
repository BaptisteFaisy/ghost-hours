import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app under /ghost-hours/ (override with BASE_PATH).
const base = process.env.BASE_PATH ?? '/ghost-hours/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: { port: 5173 },
});
