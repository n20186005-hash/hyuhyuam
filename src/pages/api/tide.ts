/**
 * 潮位与海况接口（服务端渲染路由）
 *
 * 与气象接口同构：在 Cloudflare Workers 运行时由服务端向上游取数、
 * 归一化后写入边缘缓存，浏览器只与本域同源接口通信。
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import {
  TIDE_TTL_SECONDS,
  buildMarineUrl,
  normalizeTide,
  type TidePayload,
} from '../../lib/tide';

/** 边缘缓存键（按站点维度固定，便于全站共享同一份数据） */
const CACHE_KEY = 'https://hyuhyuam.com/__cache/tide';
const EDGE_TTL_SECONDS = 300;

/** 同一 Worker 实例内的短期记忆，避免边缘缓存写入抖动时重复回源 */
let memo: { at: number; payload: TidePayload } | null = null;

const edgeCache = (): Cache | undefined => {
  try {
    return (globalThis as any).caches?.default as Cache | undefined;
  } catch {
    return undefined;
  }
};

const jsonResponse = (payload: TidePayload, source: string) =>
  new Response(JSON.stringify(payload), {
    status: payload.ok ? 200 : 502,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${EDGE_TTL_SECONDS}, s-maxage=${TIDE_TTL_SECONDS}, stale-while-revalidate=3600`,
      'x-tide-source': source,
    },
  });

const failure = (): TidePayload =>
  ({
    ok: false,
    updatedAt: new Date().toISOString(),
    timezone: 'Asia/Seoul',
    now: null,
    trend: 'steady',
    hourly: [],
    events: [],
    next: { high: null, low: null },
    days: [],
    rangeTrend: 'steady',
    sea: { waveHeight: null, wavePeriod: null, waveDir: null, sst: null },
    advice: { coast: [] },
  }) as TidePayload;

export const GET: APIRoute = async () => {
  const now = Date.now();
  if (memo && now - memo.at < TIDE_TTL_SECONDS * 1000) {
    return jsonResponse(memo.payload, 'memory');
  }

  const cache = edgeCache();
  if (cache) {
    const hit = await cache.match(CACHE_KEY).catch(() => undefined);
    if (hit) {
      const payload = (await hit.json().catch(() => null)) as TidePayload | null;
      if (payload?.ok) {
        memo = { at: now, payload };
        return jsonResponse(payload, 'edge');
      }
    }
  }

  try {
    const res = await fetch(buildMarineUrl(), { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`upstream ${res.status}`);

    const payload = normalizeTide(await res.json());
    if (!payload.ok) throw new Error('empty series');
    memo = { at: now, payload };

    if (cache) {
      await cache
        .put(
          CACHE_KEY,
          new Response(JSON.stringify(payload), {
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': `public, max-age=${TIDE_TTL_SECONDS}`,
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
