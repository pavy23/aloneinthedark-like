import { defineConfig } from 'vite';

// Single-file build (IIFE, no code splitting) used to publish the game as one self-contained HTML page.
export default defineConfig({
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist-artifact',
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    lib: {
      entry: 'src/main.ts',
      formats: ['iife'],
      name: 'BeneathTheKeel',
      fileName: () => 'game.js',
    },
  },
});
