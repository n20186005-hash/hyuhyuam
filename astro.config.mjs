import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://hyuhyuam.com',
  output: 'static',
  i18n: {
    defaultLocale: 'ko',
    locales: ['ko', 'zh', 'en', 'ja'],
    routing: {
      prefixDefaultLocale: true,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
