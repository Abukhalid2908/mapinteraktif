import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    host: '0.0.0.0',
    port: 2800,
    // Vite menolak request dengan Host header yang tidak dikenal secara
    // default (proteksi DNS rebinding) -> tanpa ini, akses lewat IP LAN
    // (bukan localhost) akan gagal walau server sudah bind ke 0.0.0.0.
    allowedHosts: true,
    fs: { deny: ['backend/**', 'tools/**', '.git/**'] },
    proxy: {
      '/facilities.json': {
        target: 'http://127.0.0.1:2801',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:2801',
        changeOrigin: true,
      },
      '/admin': {
        target: 'http://127.0.0.1:2801',
        changeOrigin: true,
      },
    },
  },
  worker: { format: 'es' },
  plugins: [vinext(), sites()],
});
