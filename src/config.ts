export const siteConfig = {
  name: 'Hyuhyuam Hermitage',
  baseUrl: 'https://hyuhyuam.com',
  slug: 'hyuhyuam-hermitage',
  locales: ['zh', 'en', 'ja', 'ko'] as const,
};

export const ogLocale: Record<string, string> = {
  zh: 'zh_CN',
  en: 'en_US',
  ja: 'ja_JP',
  ko: 'ko_KR',
};
