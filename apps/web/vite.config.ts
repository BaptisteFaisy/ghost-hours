import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app under /ghost-hours/ (override with BASE_PATH).
const base = process.env.BASE_PATH ?? '/ghost-hours/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    // The floor, written down: the bundle must parse in the oldest engine this
    // project claims to support (see `docs/BROWSERS.md`). Vite's default says
    // the same thing today, but a default can move with a version bump — an
    // explicit target cannot.
    target: ['es2020', 'safari14', 'firefox78', 'chrome87', 'edge88'],
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: { port: 5173 },
});
