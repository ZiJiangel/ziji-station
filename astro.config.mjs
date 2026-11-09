import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  integrations: [react()],
  devToolbar: {
    enabled: false
  },
  server: {
    port: 4321,
    host: true
  }
});