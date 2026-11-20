import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://midnightchildrenrecords.com',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
