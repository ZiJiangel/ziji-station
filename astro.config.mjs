import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'hybrid',
  adapter: cloudflare({
    imageService: 'compile',
  }),
  integrations: [react()],
  devToolbar: {
    enabled: false
  },
  server: {
    port: 4321,
    host: true
  }
});
