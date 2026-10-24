import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const serverUrl = process.env.JINXO_SERVER ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    // client ต่อ Socket.IO ที่ origin เดียวกันเสมอ — ตอน dev ให้ Vite ส่งต่อไปที่ server
    proxy: {
      '/socket.io': { target: serverUrl, ws: true, changeOrigin: true },
      '/health': { target: serverUrl, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
