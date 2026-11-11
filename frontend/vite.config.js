import { cp } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function preservePublicImages() {
  let config;
  return {
    name: 'workly-public-images',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    async writeBundle() {
      const output = path.resolve(config.root, config.build.outDir);
      await cp(path.resolve(config.root, 'assets/img'), path.join(output, 'assets/img'), {
        recursive: true
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = process.env.WORKLY_API_PROXY || env.WORKLY_API_PROXY;
  const proxy = target
    ? {
        '/api': { target, changeOrigin: true },
        '/uploads': { target, changeOrigin: true }
      }
    : undefined;
  return {
    plugins: [react(), tailwindcss(), preservePublicImages()],
    build: { assetsDir: 'react-assets' },
    server: {
      port: 5173,
      proxy
    }
  };
});
