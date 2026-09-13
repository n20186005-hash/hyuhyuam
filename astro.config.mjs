import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

// 搜索控制台中的重复收录（/en 与 /en/）源于两种情况并存：
// 站点实际以目录形式产出（/en/index.html → /en/），但 canonical、hreflang
// 与站内链接一度写成不带尾斜杠的 /en。这里统一为「始终带尾斜杠」。
export default defineConfig({
  site: 'https://hyuhyuam.com',
  trailingSlash: 'always',
  // 内容页面继续以静态方式产出（首屏速度与抓取友好），
  // 仅 /api/weather 通过 prerender = false 走 Workers 按需渲染。
  output: 'static',
  adapter: cloudflare(),
  i18n: {
    defaultLocale: 'ko',
    locales: ['ko', 'zh', 'en', 'ja'],
    routing: {
      prefixDefaultLocale: true,
    },
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'ko',
        locales: { ko: 'ko-KR', zh: 'zh-CN', en: 'en-US', ja: 'ja-JP' },
      },
      // 已设 noindex 的页面（法律页与根跳转页）不应出现在站点地图中
      filter: (page) =>
        page !== 'https://hyuhyuam.com/' &&
        !/\/(privacy-policy|terms-of-service|cookie-settings)\/?$/.test(page),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
