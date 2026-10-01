import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    allowedHosts: true,
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
  },
  build: { outDir: '../../editor-dist', emptyOutDir: true },
});
