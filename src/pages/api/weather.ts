/**
 * 气象数据接口（服务端渲染路由）
 *
 * 该路由在 Cloudflare Workers 运行时执行：由服务端向上游取数、归一化并写入
 * 边缘缓存，浏览器只与本域同源接口通信。缓存命中时不产生任何上游请求。
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import {
  WEATHER_TTL_SECONDS,
  buildUpstreamUrl,
  normalizeWeather,
  type WeatherPayload,
} from '../../lib/weather';

/** 边缘缓存键（按站点维度固定，便于全站共享同一份数据） */
const CACHE_KEY = 'https://hyuhyuam.com/__cache/weather';
const EDGE_TTL_SECONDS = 300;

/** 同一 Worker 实例内的短期记忆，避免边缘缓存写入抖动时重复回源 */
let memo: { at: number; payload: WeatherPayload } | null = null;

const edgeCache = (): Cache | undefined => {
  try {
    return (globalThis as any).caches?.default as Cache | undefined;
  } catch {
    return undefined;
  }
};

const jsonResponse = (payload: WeatherPayload, source: string) =>
  new Response(JSON.stringify(payload), {
    status: payload.ok ? 200 : 502,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${EDGE_TTL_SECONDS}, s-maxage=${WEATHER_TTL_SECONDS}, stale-while-revalidate=3600`,
      'x-weather-source': source,
    },
  });

const failure = (): WeatherPayload =>
  ({
    ok: false,
    updatedAt: new Date().toISOString(),
    timezone: 'Asia/Seoul',
    current: {
      temp: null,
      feels: null,
      humidity: null,
      precip: null,
      code: 3,
      wind: null,
      windLevel: null,
      gust: null,
      gustLevel: null,
      isDay: true,
    },
    today: null,
    next24: { pop: [], uv: [], vis: [] },
    days: [],
    advice: {
      summary: { id: 'summary-caution', tone: 'caution', icon: '🌦️' },
      alerts: [],
      outfits: [],
      plans: [],
      items: [],
    },
  }) as WeatherPayload;

export const GET: APIRoute = async () => {
  const now = Date.now();
  if (memo && now - memo.at < WEATHER_TTL_SECONDS * 1000) {
    return jsonResponse(memo.payload, 'memory');
  }

  const cache = edgeCache();
  if (cache) {
    const hit = await cache.match(CACHE_KEY).catch(() => undefined);
    if (hit) {
      const payload = (await hit.json().catch(() => null)) as WeatherPayload | null;
      if (payload?.ok) {
        memo = { at: now, payload };
        return jsonResponse(payload, 'edge');
      }
    }
  }

  try {
    const res = await fetch(buildUpstreamUrl(), {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);

    const payload = normalizeWeather(await res.json());
    memo = { at: now, payload };

    if (cache) {
      await cache
        .put(
          CACHE_KEY,
          new Response(JSON.stringify(payload), {
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': `public, max-age=${WEATHER_TTL_SECONDS}`,
            },
          }),
        )
        .catch(() => undefined);
    }

    return jsonResponse(payload, 'origin');
  } catch {
    if (memo) return jsonResponse(memo.payload, 'stale');
    return jsonResponse(failure(), 'error');
  }
};
