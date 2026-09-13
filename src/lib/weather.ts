/**
 * 气象数据模型（服务端归一化 + 多语言词表）
 *
 * 服务端（构建期快照、运行时接口）与浏览器端共用同一份规范化结构与词表，
 * 保证首屏 HTML 与实时刷新后的渲染结果完全一致。
 */
import { attraction } from '../config';
import { beaufort, buildAdvice, type AdviceBundle } from './advice';

export type WeatherLang = 'ko' | 'zh' | 'en' | 'ja';

/** 服务端缓存有效期（秒）。数据本身更新频率约 15 分钟，超过即重新取数。 */
export const WEATHER_TTL_SECONDS = 900;

export interface DayForecast {
  date: string;
  code: number;
  tMax: number | null;
  tMin: number | null;
  precip: number | null;
  pop: number;
  uv: number;
  /** 当日最大风速（km/h） */
  wind: number;
  /** 当日最大风力等级 */
  windLevel: number | null;
  sunrise: string;
  sunset: string;
}

export interface WeatherPayload {
  ok: boolean;
  /** 数据观测/生成时间（ISO 8601，已按 Asia/Seoul 归一） */
  updatedAt: string;
  timezone: string;
  current: {
    temp: number | null;
    feels: number | null;
    humidity: number | null;
    precip: number | null;
    code: number;
    wind: number | null;
    /** 风力等级（蒲福风级） */
    windLevel: number | null;
    gust: number | null;
    /** 阵风风力等级 */
    gustLevel: number | null;
    isDay: boolean;
  };
  today: DayForecast | null;
  /** 未来 24 小时逐时降水概率 / 紫外线指数 / 能见度（米） */
  next24: { pop: number[]; uv: number[]; vis: number[] };
  days: DayForecast[];
  /** 由规则引擎推导的可执行建议（与语言无关，只含文案键） */
  advice: AdviceBundle;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;

const clampInt = (v: unknown): number => {
  const n = num(v);
  return n === null ? 0 : Math.round(n);
};

/** 上游请求地址（坐标、时区、要素集合集中在此处定义） */
export function buildUpstreamUrl(): string {
  const params = new URLSearchParams({
    latitude: String(attraction.latitude),
    longitude: String(attraction.longitude),
    timezone: 'Asia/Seoul',
    current:
      'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,is_day',
    hourly: 'precipitation_probability,uv_index,cloud_cover,visibility',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset,uv_index_max,wind_speed_10m_max',
    forecast_days: '8',
    wind_speed_unit: 'kmh',
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

const hhmm = (iso: unknown): string =>
  typeof iso === 'string' && iso.length >= 16 ? iso.slice(11, 16) : '';

/** 把上游响应压缩为本站所需的最小结构，减少响应体积 */
export function normalizeWeather(raw: any): WeatherPayload {
  const c = raw?.current ?? {};
  const d = raw?.daily ?? {};
  const h = raw?.hourly ?? {};

  const days: DayForecast[] = (d.time ?? []).map((t: string, i: number) => {
    const wind = clampInt(d.wind_speed_10m_max?.[i]);
    return {
      date: t,
      code: clampInt(d.weather_code?.[i]),
      tMax: num(d.temperature_2m_max?.[i]),
      tMin: num(d.temperature_2m_min?.[i]),
      precip: num(d.precipitation_sum?.[i]),
      pop: clampInt(d.precipitation_probability_max?.[i]),
      uv: clampInt(d.uv_index_max?.[i]),
      wind,
      windLevel: beaufort(wind),
      sunrise: hhmm(d.sunrise?.[i]),
      sunset: hhmm(d.sunset?.[i]),
    };
  });

  const nowIso: string = typeof c.time === 'string' ? c.time : '';
  const hourlyTime: string[] = h.time ?? [];
  let start = hourlyTime.findIndex((t) => nowIso && t >= nowIso);
  if (start < 0) start = 0;
  const win = (arr: unknown[] | undefined) =>
    (arr ?? []).slice(start, start + 24) as unknown[];
  const next24 = {
    pop: win(h.precipitation_probability).map(clampInt),
    uv: win(h.uv_index).map(clampInt),
    vis: win(h.visibility).map((v) => {
      const n = num(v);
      return n === null ? 99999 : Math.round(n);
    }),
  };

  const today = days[0] ?? null;
  const wind = num(c.wind_speed_10m);
  const gust = num(c.wind_gusts_10m);

  const payload: WeatherPayload = {
    ok: true,
    updatedAt: nowIso || new Date().toISOString(),
    timezone: raw?.timezone ?? 'Asia/Seoul',
    current: {
      temp: num(c.temperature_2m),
      feels: num(c.apparent_temperature),
      humidity: num(c.relative_humidity_2m),
      precip: num(c.precipitation),
      code: clampInt(c.weather_code),
      wind,
      windLevel: beaufort(wind),
      gust,
      gustLevel: beaufort(gust),
      isDay: c.is_day === 1 || c.is_day === true,
    },
    today,
    next24,
    days,
    advice: { summary: { id: '', tone: 'good', icon: '' }, alerts: [], outfits: [], plans: [], items: [] },
  };

  payload.advice = buildAdvice(payload);
  return payload;
}

/** 天气现象编码 → 各语言文案 */
const CODE_TEXT: Record<WeatherLang, Record<number, string>> = {
  ko: {
    0: '맑음',
    1: '대체로 맑음',
    2: '구름 조금',
    3: '흐림',
    45: '안개',
    48: '서리 안개',
    51: '약한 이슬비',
    53: '이슬비',
    55: '강한 이슬비',
    56: '어는 이슬비',
    57: '강한 어는 이슬비',
    61: '약한 비',
    63: '비',
    65: '강한 비',
    66: '어는 비',
    67: '강한 어는 비',
    71: '약한 눈',
    73: '눈',
    75: '폭설',
    77: '싸락눈',
    80: '약한 소나기',
    81: '소나기',
    82: '강한 소나기',
    85: '소낙눈',
    86: '많은 소낙눈',
    95: '뇌우',
    96: '우박 동반 뇌우',
    99: '강한 우박 뇌우',
  },
  zh: {
    0: '晴',
    1: '大部晴朗',
    2: '多云',
    3: '阴',
    45: '雾',
    48: '冻雾',
    51: '小毛毛雨',
    53: '毛毛雨',
    55: '大毛毛雨',
    56: '冻毛毛雨',
    57: '强冻毛毛雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    66: '冻雨',
    67: '强冻雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    77: '米雪',
    80: '小阵雨',
    81: '阵雨',
    82: '强阵雨',
    85: '小阵雪',
    86: '大阵雪',
    95: '雷暴',
    96: '伴冰雹雷暴',
    99: '强冰雹雷暴',
  },
  en: {
    0: 'Clear',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Freezing fog',
    51: 'Light drizzle',
    53: 'Drizzle',
    55: 'Heavy drizzle',
    56: 'Freezing drizzle',
    57: 'Heavy freezing drizzle',
    61: 'Light rain',
    63: 'Rain',
    65: 'Heavy rain',
    66: 'Freezing rain',
    67: 'Heavy freezing rain',
    71: 'Light snow',
    73: 'Snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Light showers',
    81: 'Showers',
    82: 'Violent showers',
    85: 'Snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with hail',
    99: 'Severe thunderstorm with hail',
  },
  ja: {
    0: '晴れ',
    1: 'ほぼ晴れ',
    2: '晴れ時々くもり',
    3: 'くもり',
    45: '霧',
    48: '着氷性の霧',
    51: '弱い霧雨',
    53: '霧雨',
    55: '強い霧雨',
    56: '着氷性霧雨',
    57: '強い着氷性霧雨',
    61: '弱い雨',
    63: '雨',
    65: '強い雨',
    66: '着氷性の雨',
    67: '強い着氷性の雨',
    71: '弱い雪',
    73: '雪',
    75: '大雪',
    77: '霧雪',
    80: '弱いにわか雨',
    81: 'にわか雨',
    82: '激しいにわか雨',
    85: 'にわか雪',
    86: '強いにわか雪',
    95: '雷雨',
    96: '雹を伴う雷雨',
    99: '激しい雹を伴う雷雨',
  },
};

export const WEATHER_CODE_KEYS = Object.keys(CODE_TEXT.ko).map(Number);

export function weatherCodeTable(lang: WeatherLang): Record<number, string> {
  return CODE_TEXT[lang] ?? CODE_TEXT.en;
}

export function weatherCodeText(code: number, lang: WeatherLang): string {
  const table = weatherCodeTable(lang);
  return table[code] ?? table[3];
}

/**
 * 直接取数并归一化。用于构建期生成首屏快照，
 * 使 HTML 在无脚本或爬虫抓取时同样包含完整气象信息。
 */
export async function fetchWeatherSnapshot(): Promise<WeatherPayload | null> {
  try {
    const res = await fetch(buildUpstreamUrl(), { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const payload = normalizeWeather(await res.json());
    return payload.ok ? payload : null;
  } catch {
    return null;
  }
}

/** 天气现象编码 → 简易图标（全语言通用，避免额外图片资源） */
export function weatherCodeIcon(code: number, isDay = true): string {
  if (code === 0) return isDay ? '☀️' : '🌙';
  if (code === 1) return isDay ? '🌤️' : '🌙';
  if (code === 2) return isDay ? '⛅' : '☁️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 57) return '🌦️';
  if (code >= 61 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '🌨️';
  if (code >= 80 && code <= 82) return '🌧️';
  if (code >= 85 && code <= 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌡️';
}
