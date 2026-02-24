import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, '../../packages/core/src'),
      '@db': path.resolve(__dirname, '../../packages/database/src'),
    },
  },
  // Provide shims for Node.js globals that don't exist in browser
  define: {
    'process.env': JSON.stringify({}),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  // Exclude Node.js-only packages from browser bundle
  optimizeDeps: {
    exclude: ['@backy-cms/database', '@supabase/supabase-js'],
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      external: ['@backy-cms/database'],
    },
  },
});
