import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, '../../dist/webview'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.tsx'),
      output: {
        format: 'iife',
        entryFileNames: 'index.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'index.css';
          }
          return 'assets/[name].[ext]';
        }
      }
    },
    cssCodeSplit: false,
    sourcemap: true,
    minify: true
  },
  define: {
    'process.env.NODE_ENV': '"production"'
  }
});

