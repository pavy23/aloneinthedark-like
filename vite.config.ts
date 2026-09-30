import { defineConfig } from 'vite';

// Relative base so the build works from any static host path (GitHub Pages, S3, a sub-folder, ...).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
  server: { host: true },
});
