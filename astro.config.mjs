// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  site: 'https://xrplmesh.com',
  vite: {
    build: {
      cssCodeSplit: false, // Bundle all CSS into one file (eliminates chain)
    },
  },
});
