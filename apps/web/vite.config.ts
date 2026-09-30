import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/cases': 'http://127.0.0.1:3001',
      '/reports': 'http://127.0.0.1:3001',
      '/stores': 'http://127.0.0.1:3001',
      '/chat': 'http://127.0.0.1:3001',
    },
  },
});