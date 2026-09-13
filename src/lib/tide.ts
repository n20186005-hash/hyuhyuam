/**
 * 潮位与海况数据模型（服务端归一化）
 *
 * 与气象模块保持同一套约定：上游原始响应在服务端被压缩为最小结构，
 * 服务端渲染、构建期快照与浏览器端刷新共用同一份结构与同一份取样窗口，
 * 因此首屏 HTML 与刷新后的结果完全一致。
 *
 * 时间一律使用上游返回的当地时刻字符串（Asia/Seoul，无夏令时）。
 * 需要做时间差运算时统一用 kst() 附加 +09:00 偏移，避免受运行环境时区影响。
 */
import { attraction } from '../config';
import { buildCoastAdvice, type CoastAdvice } from './advice';

/** 服务端缓存有效期（秒） */
export const TIDE_TTL_SECONDS = 900;

/** 参与曲线绘制的逐时点数（48 小时） */
export const TIDE_CHART_HOURS = 48;

/** 时刻表最多展示的条目数 */
const MAX_EVENTS = 8;

const KST = '+09:00';

/** 当地时刻字符串 → 绝对时间（Asia/Seoul 无夏令时，可直接固定偏移） */
export function kst(local: string): Date {
  return new Date(`${local.length === 16 ? `${local}:00` : local}${KST}`);
}

/** 当地时刻字符串是否为当日 00:00 */
const localDate = (local: string): string => local.slice(0, 10);

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 在当地时刻字符串上平移若干分钟，返回同格式字符串 */
function shiftMinutes(local: string, minutes: number): string {
  const d = kst(local);
  d.setUTCMinutes(d.getUTCMinutes() + Math.round(minutes));
  // 转回 Asia/Seoul 当地的墙上时间
  const localMs = d.getTime() + 9 * 3600 * 1000;
  const w = new Date(localMs);
  return `${w.getUTCFullYear()}-${pad2(w.getUTCMonth() + 1)}-${pad2(w.getUTCDate())}T${pad2(
    w.getUTCHours(),
  )}:${pad2(w.getUTCMinutes())}`;
}

/** 当前时刻（Asia/Seoul 墙上时间，分钟取整） */
function nowLocal(): string {
  const w = new Date(Date.now() + 9 * 3600 * 1000);
  return `${w.getUTCFullYear()}-${pad2(w.getUTCMonth() + 1)}-${pad2(w.getUTCDate())}T${pad2(
    w.getUTCHours(),
  )}:${pad2(w.getUTCMinutes())}`;
}

export interface TidePoint {
  /** 当地时刻（YYYY-MM-DDTHH:mm） */
  t: string;
  /** 潮位（米，相对平均海平面） */
  h: number;
}

export interface TideEvent {
  t: string;
  h: number;
  kind: 'high' | 'low';
}

export interface TideDay {
  date: string;
  min: number;
  max: number;
  /** 日潮差（米） */
  range: number;
}

export interface SeaState {
  waveHeight: number | null;
  wavePeriod: number | null;
  waveDir: number | null;
  sst: number | null;
}

export interface TidePayload {
  ok: boolean;
  updatedAt: string;
  timezone: string;
  /** 当前潮位（无数据时为 null） */
  now: TidePoint | null;
  /** 潮势：涨潮 / 落潮 / 平潮 */
  trend: 'rising' | 'falling' | 'steady';
  /** 未来 48 小时逐时潮位 */
  hourly: TidePoint[];
  /** 未来若干次高潮与低潮 */
  events: TideEvent[];
  next: { high: TideEvent | null; low: TideEvent | null };
  /** 逐日潮差 */
  days: TideDay[];
  /** 潮差趋势：趋向大潮 / 趋向小潮 / 基本持平 */
  rangeTrend: 'spring' | 'neap' | 'steady';
  sea: SeaState;
  /** 由海况与潮时推导的礁石安全提示（与语言无关，只含文案键） */
  advice: CoastAdvice;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** 上游请求地址（坐标与要素集合集中在此处定义） */
export function buildMarineUrl(): string {
  const params = new URLSearchParams({
    latitude: String(attraction.latitude),
    longitude: String(attraction.longitude),
    timezone: 'Asia/Seoul',
    hourly:
      'sea_level_height_msl,wave_height,wave_period,wave_direction,sea_surface_temperature',
    current:
      'sea_level_height_msl,wave_height,wave_period,wave_direction,sea_surface_temperature',
    forecast_days: '4',
  });
  return `https://marine-api.open-meteo.com/v1/marine?${params.toString()}`;
}

/**
 * 逐时序列 → 高潮/低潮事件。
 * 先取局部极值点（窗口 3 小时，保证不会被 1 厘米的量化台阶误判），
 * 再用相邻三点做抛物线插值，把极值时刻精确到 10 分钟。
 */
function findEvents(hourly: TidePoint[]): TideEvent[] {
  const W = 3;
  const n = hourly.length;
  const raw: { i: number; kind: 'high' | 'low' }[] = [];

  for (let i = W; i < n - W; i++) {
    const h = hourly[i].h;
    let isMax = true;
    let isMin = true;
    for (let j = i - W; j <= i + W; j++) {
      if (j === i) continue;
      if (hourly[j].h > h) isMax = false;
      if (hourly[j].h < h) isMin = false;
    }
    if (isMax || isMin) raw.push({ i, kind: isMax ? 'high' : 'low' });
  }

  // 平坦段会产生连续同类候选，保留其中极值更明显的那个，并强制高低交替
  const merged: { i: number; kind: 'high' | 'low' }[] = [];
  for (const c of raw) {
    const last = merged[merged.length - 1];
    if (last && last.kind === c.kind) {
      const better =
        c.kind === 'high' ? hourly[c.i].h > hourly[last.i].h : hourly[c.i].h < hourly[last.i].h;
      if (better) merged[merged.length - 1] = c;
      continue;
    }
    merged.push(c);
  }

  return merged.map(({ i, kind }) => {
    const prev = hourly[Math.max(0, i - 1)].h;
    const next = hourly[Math.min(n - 1, i + 1)].h;
    const cur = hourly[i].h;
    const denom = prev - 2 * cur + next;
    const offset = denom === 0 ? 0 : (0.5 * (prev - next)) / denom;
    const refined = denom === 0 ? cur : cur - 0.25 * (prev - next) * offset;
    const minutes = Math.max(-45, Math.min(45, Math.round((offset * 60) / 10) * 10));
    return {
      t: minutes === 0 ? hourly[i].t : shiftMinutes(hourly[i].t, minutes),
      h: Math.round(refined * 1000) / 1000,
      kind,
    };
  });
}

/** 逐日潮差 */
function dailyRanges(hourly: TidePoint[]): TideDay[] {
  const buckets = new Map<string, number[]>();
  for (const p of hourly) {
    const key = localDate(p.t);
    const list = buckets.get(key);
    if (list) list.push(p.h);
    else buckets.set(key, [p.h]);
  }
  const out: TideDay[] = [];
  for (const [date, values] of buckets) {
    if (values.length < 20) continue;
    const min = Math.min(...values);
    const max = Math.max(...values);
    out.push({
      date,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      range: Math.round((max - min) * 100) / 100,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** 潮差趋势：近期两日与再后三日的平均潮差对比 */
function rangeTrend(days: TideDay[]): 'spring' | 'neap' | 'steady' {
  const near = days.slice(0, 2).map((d) => d.range);
  const far = days.slice(2, 5).map((d) => d.range);
  if (near.length < 2 || far.length < 2) return 'steady';
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const a = avg(near);
  const b = avg(far);
  if (a === 0) return 'steady';
  const delta = (b - a) / a;
  if (delta > 0.12) return 'spring';
  if (delta < -0.12) return 'neap';
  return 'steady';
}

/** 把上游响应压缩为本站所需的最小结构 */
export function normalizeTide(raw: any): TidePayload {
  const h = raw?.hourly ?? {};
  const c = raw?.current ?? {};
  const times: string[] = Array.isArray(h.time) ? h.time : [];
  const levels: unknown[] = Array.isArray(h.sea_level_height_msl) ? h.sea_level_height_msl : [];

  const hourly: TidePoint[] = [];
  for (let i = 0; i < times.length && i < levels.length; i++) {
    const value = num(levels[i]);
    if (value === null) continue;
    hourly.push({ t: String(times[i]).slice(0, 16), h: Math.round(value * 1000) / 1000 });
  }

  if (!hourly.length) {
    return {
      ok: false,
      updatedAt: new Date().toISOString(),
      timezone: raw?.timezone ?? 'Asia/Seoul',
      now: null,
      trend: 'steady',
      hourly: [],
      events: [],
      next: { high: null, low: null },
      days: [],
      rangeTrend: 'steady',
      sea: { waveHeight: null, wavePeriod: null, waveDir: null, sst: null },
      advice: { coast: [] },
    };
  }

  const nowIso = typeof c.time === 'string' ? c.time.slice(0, 16) : nowLocal();

  // 当前潮位优先取上游 current；缺失时用最近一个不晚于现在的逐时值
  let idx = -1;
  for (let i = 0; i < hourly.length; i++) {
    if (hourly[i].t <= nowIso) idx = i;
    else break;
  }
  if (idx < 0) idx = 0;

  const currentLevel = num(c.sea_level_height_msl);
  const now: TidePoint = {
    t: nowIso,
    h: currentLevel === null ? hourly[idx].h : Math.round(currentLevel * 1000) / 1000,
  };

  const delta = now.h - hourly[Math.max(0, idx - 1)].h;
  const trend: TidePayload['trend'] =
    Math.abs(delta) < 0.008 ? 'steady' : delta > 0 ? 'rising' : 'falling';

  const events = findEvents(hourly).filter((e) => e.t >= nowIso);
  const nextHigh = events.find((e) => e.kind === 'high') ?? null;
  const nextLow = events.find((e) => e.kind === 'low') ?? null;
  const days = dailyRanges(hourly);

  const sea: SeaState = {
    waveHeight: num(c.wave_height),
    wavePeriod: num(c.wave_period),
    waveDir: num(c.wave_direction),
    sst: num(seaTemp(raw)),
  };

  /** 距某个高潮／低潮还有多少分钟（用于判断是否处在可以下礁石的窗口内） */
  const minutesTo = (e: TideEvent | null): number | null =>
    e === null ? null : Math.round((kst(e.t).getTime() - kst(nowIso).getTime()) / 60000);

  return {
    ok: true,
    updatedAt: nowIso,
    timezone: raw?.timezone ?? 'Asia/Seoul',
    now,
    trend,
    hourly: hourly.slice(idx, idx + TIDE_CHART_HOURS),
    events: events.slice(0, MAX_EVENTS),
    next: { high: nextHigh, low: nextLow },
    days,
    rangeTrend: rangeTrend(days),
    sea,
    advice: buildCoastAdvice({
      waveHeight: sea.waveHeight,
      sst: sea.sst,
      trend,
      minutesToHigh: minutesTo(nextHigh),
      minutesToLow: minutesTo(nextLow),
    }),
  };
}

/** 表层水温：current 缺失时回退到逐时序列的第一个有效值 */
function seaTemp(raw: any): unknown {
  const v = num(raw?.current?.sea_surface_temperature);
  if (v !== null) return v;
  const arr: unknown[] = raw?.hourly?.sea_surface_temperature ?? [];
  for (const item of arr) {
    const n = num(item);
    if (n !== null) return n;
  }
  return null;
}

/** 8 方位风的通用缩写（全语言一致，避免额外词表） */
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export function compassText(deg: number | null): string {
  if (deg === null || !Number.isFinite(deg)) return '—';
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return COMPASS[i];
}

/**
 * 直接取数并归一化。用于构建期生成首屏快照，
 * 使 HTML 在无脚本或爬虫抓取时同样包含完整潮位信息。
 */
export async function fetchTideSnapshot(): Promise<TidePayload | null> {
  try {
    const res = await fetch(buildMarineUrl(), { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const payload = normalizeTide(await res.json());
    return payload.ok ? payload : null;
  } catch {
    return null;
  }
}
