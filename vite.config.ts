import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2021',
    sourcemap: true,
  },
  // Rapier ships a WASM file; ensure it is treated as an asset and not inlined.
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
});
