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

/**
 * 单景点 SEO 实体绑定数据（Entity Binding）
 * 对应模版中的 {{DOMAIN_NAME}} / {{ATTRACTION_*}} / {{CITY_NAME}} / {{LATITUDE}} 等占位符。
 * 所有页面（BaseLayout / Hero / MapEmbed 等）统一引用此处的数据，避免实体信息分散。
 */
export const attraction = {
  domain: 'hyuhyuam.com',
  siteUrl: 'https://hyuhyuam.com',
  /** Knowledge Graph 中用于锚定该景点实体的稳定 @id */
  entityId: 'https://hyuhyuam.com/#attraction',

  /** {{ATTRACTION_FULL_NAME}} 官方全称 */
  fullName: 'Hyuhyuam Hermitage',
  /** {{ATTRACTION_SHORT_NAME}} 常用俗称 / 域名对应含义 */
  shortName: 'Hyuhyuam',
  /** 各语言下的官方名称，用于 alternateName 语义等同声明 */
  localNames: {
    zh: '休休庵',
    ko: '휴휴암',
    en: 'Hyuhyuam Hermitage',
    ja: '休休庵',
  },

  streetAddress: '3-16 Gwangjin 2-gil, Hyeonnam-myeon',
  /** {{CITY_NAME}} */
  city: 'Yangyang-gun',
  township: 'Hyeonnam-myeon',
  /** {{STATE_PROVINCE}} */
  region: 'Gangwon-do',
  /** {{COUNTRY_NAME}} / {{COUNTRY_CODE_2LETTER}} */
  country: 'South Korea',
  countryCode: 'KR',
  /** {{POSTAL_CODE}} */
  postalCode: '25056',

  /** {{LATITUDE}} / {{LONGITUDE}} (WGS84) */
  latitude: 37.9610367,
  longitude: 128.768413,

  telephone: '+82-33-671-0093',
  ratingValue: 4.3,
  reviewCount: 6436,
  /**
   * 评分与评价数的来源平台。
   * 该评分是第三方平台上的访客评价汇总，并非本站自采，页面上必须明示来源，
   * 否则容易被判定为站点评分自述（self-serving review），反而有损可信度。
   */
  ratingSourceName: 'Google Maps',
  ratingSourceUrl: 'https://maps.app.goo.gl/Fms7tDXPUZUyGCxf6',

  /** {{MAPS_SHARE_URL}} */
  mapsShareUrl: 'https://maps.app.goo.gl/Fms7tDXPUZUyGCxf6',
  /** {{MAPS_EMBED_SRC}} */
  mapsEmbedSrc: 'https://www.google.com/maps?q=%ED%9C%B4%ED%9C%B4%EC%95%94&z=16&output=embed',

  /** {{GOVT_TOURISM_URL}} 当地官方旅游局链接（襄阳郡文化观光门户） */
  govtTourismUrl: 'https://tour.yangyang.go.kr/pub/pleasure_ramantic.do',
  govtTourismName: 'Yangyang-gun Culture & Tourism',

  heroImage: '/gallery/hyuhyuam-hermitage-1.jpg',
} as const;

export type Attraction = typeof attraction;
