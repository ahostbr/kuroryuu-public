import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': 'http://127.0.0.1:8200',
      '/v2': 'http://127.0.0.1:8200',
    },
  },
});
