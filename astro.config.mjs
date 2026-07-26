import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ahmadassi.ca',
  output: 'static',
  build: { inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
});
