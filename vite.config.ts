import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/',
  resolve: {
    alias: [
      { find: '@', replacement: projectRoot },
      { find: 'next/navigation', replacement: path.join(projectRoot, 'lib/browser-router.ts') },
      { find: 'next/dynamic', replacement: path.join(projectRoot, 'lib/browser-dynamic.tsx') },
    ],
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
