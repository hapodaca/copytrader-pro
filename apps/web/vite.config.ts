import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const webRoot = path.resolve(__dirname);

  // Load env from monorepo root
  const env = loadEnv(mode, path.resolve(__dirname, '../../'), '');

  return {
    root: webRoot,
    plugins: [react()],
    envDir: path.resolve(__dirname, '../../'),
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      allowedHosts: ['app.synctradepro.io', 'synctradepro.io'],
      // Faster HMR on Windows — evitar polling innecesario
      watch: {
        usePolling: false,
      },
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
        '/screenshots': {
          target: env.VITE_API_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    // Pre-bundlear deps al arrancar para que las páginas carguen más rápido
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom'],
    },
  };
});
