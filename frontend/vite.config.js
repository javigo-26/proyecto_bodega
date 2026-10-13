import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuración de Vite: el proxy envía /api al backend Node (puerto 3000)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
