/**
 * 出行建议规则引擎
 *
 * 设计原则：
 * 1. 引擎只产出「文案键 + 语气 + 图标」，具体文案交给 i18n，四种语言共用同一套判断逻辑，
 *    不会出现「某种语言下建议与另一种语言不一致」的问题。
 * 2. 纯函数、零依赖，服务端（构建期快照 / 接口）与浏览器端刷新时读到的是同一份结果，
 *    因此首屏 HTML 与刷新后的页面完全一致。
 * 3. 只输出命中条件的条目，未命中的直接不出现在结果里（不给用户堆无用信息）。
 * 4. 语气分三档：risk（红色，安全相关）/ caution（琥珀色，需要准备）/ good（绿色，正向推荐）。
 */

export type AdviceTone = 'risk' | 'caution' | 'good';

export interface AdviceEntry {
  /** 文案键，对应 i18n 中的 weather.adviceTexts */
  id: string;
  tone: AdviceTone;
  icon: string;
}

export interface AdviceBundle {
  /** 一句话总览 */
  summary: AdviceEntry;
  /** 风险提醒（红色置顶） */
  alerts: AdviceEntry[];
  /** 出行穿搭 */
  outfits: AdviceEntry[];
  /** 游玩安排 */
  plans: AdviceEntry[];
  /** 随身物品 */
  items: AdviceEntry[];
}

export interface CoastAdvice {
  /** 海边／礁石专属提示（数据来自潮汐与海况） */
  coast: AdviceEntry[];
}

/** 文案键注册表：图标与语气在此集中定义，规则里只引用键名 */
const META: Record<string, { icon: string; tone: AdviceTone }> = {
  // 总览
  'summary-good': { icon: '✅', tone: 'good' },
  'summary-caution': { icon: '🌦️', tone: 'caution' },
  'summary-risk': { icon: '⚠️', tone: 'risk' },

  // 风险提醒
  'alert-thunder': { icon: '⛈️', tone: 'risk' },
  'alert-wind': { icon: '🌪️', tone: 'risk' },
  'alert-rain': { icon: '🌧️', tone: 'risk' },
  'alert-snow': { icon: '🌨️', tone: 'risk' },
  'alert-heat': { icon: '🥵', tone: 'risk' },
  'alert-cold': { icon: '🥶', tone: 'risk' },
  'alert-fog': { icon: '🌫️', tone: 'risk' },

  // 出行穿搭
  'outfit-mild': { icon: '👕', tone: 'good' },
  'outfit-light': { icon: '👕', tone: 'good' },
  'outfit-heat': { icon: '🩳', tone: 'caution' },
  'outfit-rain': { icon: '🧥', tone: 'caution' },
  'outfit-wind': { icon: '💨', tone: 'caution' },
  'outfit-layer': { icon: '🧥', tone: 'caution' },
  'outfit-warm': { icon: '🧥', tone: 'caution' },
  'outfit-cold': { icon: '🥶', tone: 'caution' },

  // 游玩安排
  'plan-good': { icon: '🌤️', tone: 'good' },
  'plan-photo': { icon: '📷', tone: 'good' },
  'plan-sunrise': { icon: '🌅', tone: 'good' },
  'plan-rain-possible': { icon: '☔', tone: 'caution' },
  'plan-rain-light': { icon: '🌂', tone: 'caution' },
  'plan-rain-heavy': { icon: '🌧️', tone: 'risk' },
  'plan-wind': { icon: '💨', tone: 'caution' },
  'plan-wind-strong': { icon: '🌊', tone: 'risk' },
  'plan-thunder': { icon: '⛈️', tone: 'risk' },
  'plan-fog': { icon: '🌫️', tone: 'caution' },
  'plan-heat': { icon: '🥵', tone: 'caution' },
  'plan-cold': { icon: '🥶', tone: 'caution' },

  // 随身物品
  'item-raincoat': { icon: '🧥', tone: 'caution' },
  'item-umbrella': { icon: '☂️', tone: 'caution' },
  'item-foldable': { icon: '🌂', tone: 'caution' },
  'item-sunscreen': { icon: '🧴', tone: 'caution' },
  'item-sunglasses': { icon: '🕶️', tone: 'caution' },
  'item-hat': { icon: '🧢', tone: 'caution' },
  'item-water': { icon: '💧', tone: 'caution' },
  'item-coat-thick': { icon: '🧥', tone: 'caution' },
  'item-jacket': { icon: '🧥', tone: 'caution' },
  'item-mask': { icon: '😷', tone: 'caution' },
  'item-grip-shoes': { icon: '🥾', tone: 'caution' },

  // 海边／礁石
  'coast-calm': { icon: '🌊', tone: 'good' },
  'coast-low-tide': { icon: '🦀', tone: 'good' },
  'coast-high-tide': { icon: '⏳', tone: 'caution' },
  'coast-swell-caution': { icon: '🌊', tone: 'caution' },
  'coast-swell-risk': { icon: '🌊', tone: 'risk' },
  'coast-cold-water': { icon: '🥶', tone: 'caution' },
};

/** 全部文案键，供组件构建「键 → 文案」字典 */
export const ADVICE_IDS: string[] = Object.keys(META);

const entry = (id: string, tone?: AdviceTone): AdviceEntry => ({
  id,
  icon: META[id]?.icon ?? '•',
  tone: tone ?? META[id]?.tone ?? 'caution',
});

/** 各组最多展示的条目数：宁可少而准，也不堆满 */
const MAX = { alerts: 3, outfits: 3, plans: 3, items: 5, coast: 3 } as const;

/** 风力（km/h）→ 蒲福风级；与「5~6 级注意、7 级以上危险」的阈值口径一致 */
export function beaufort(kmh: number | null | undefined): number | null {
  if (typeof kmh !== 'number' || !Number.isFinite(kmh)) return null;
  const steps = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  let level = 0;
  for (let i = 0; i < steps.length; i++) if (kmh >= steps[i]) level = i + 1;
  return level;
}

/** 阈值集中在此，便于按季节或当地经验调整 */
const T = {
  /** 大概率下雨的降水概率 */
  popLikely: 60,
  /** 日雨量达到「中到大雨」的量级（mm） */
  rainSumHeavy: 20,
  /** 气温偏高 / 极端偏高（℃） */
  hot: 32,
  hotExtreme: 35,
  /** 气温偏低（℃） */
  cold: 10,
  /** 早晚需要外套（℃） */
  coolNight: 8,
  /** 昼夜温差（℃） */
  tempSwing: 8,
  /** 紫外线偏强 / 很强 */
  uvStrong: 5,
  uvVeryStrong: 8,
  /** 结冰风险（℃） */
  freezing: -3,
  /** 能见度低（m） */
  fogVis: 1000,
  /** 5 级风 / 7 级风（km/h） */
  windCaution: 29,
  windRisk: 50,
  /** 阵风危险（km/h） */
  gustRisk: 70,
} as const;

export interface AdviceWeatherInput {
  current: {
    temp: number | null;
    feels: number | null;
    humidity: number | null;
    precip: number | null;
    code: number;
    wind: number | null;
    gust: number | null;
    isDay: boolean;
  };
  today: {
    code: number;
    tMax: number | null;
    tMin: number | null;
    precip: number | null;
    pop: number;
    uv: number;
    wind: number;
  } | null;
  /** 未来 24 小时逐时降水概率 / 紫外线 / 能见度（米） */
  next24: { pop: number[]; uv: number[]; vis: number[] };
}

const maxOf = (arr: number[] | undefined, fallback = 0): number =>
  arr && arr.length ? Math.max(...arr) : fallback;

const minOf = (arr: number[] | undefined): number | undefined =>
  arr && arr.length ? Math.min(...arr) : undefined;

/**
 * 依据天气数据推导可执行建议。
 * 只输出命中条件的条目，风险条目按严重度排在最前。
 */
export function buildAdvice(input: AdviceWeatherInput): AdviceBundle {
  const cur = input.current;
  const today = input.today;
  const next24 = input.next24 ?? { pop: [], uv: [], vis: [] };

  // 判断口径统一为「今天 + 未来 12 小时」：到访者关心的是当下这半天到一天，
  // 若直接取未来 24 小时，深夜会把明天上午的紫外线、明天的降水概率误当成今天的天气。
  const popMax = Math.max(today?.pop ?? 0, maxOf(next24.pop.slice(0, 12)));
  const uvMax = Math.max(today?.uv ?? 0, maxOf(next24.uv.slice(0, 12)));
  const windMax = Math.max(today?.wind ?? 0, cur.wind ?? 0);
  const gustMax = Math.max(cur.gust ?? 0, cur.wind ?? 0);
  // 能见度只看近 6 小时：雾是短时现象，用远处的数据判断当下的雾没有意义
  const visMin = minOf(next24.vis.slice(0, 6));

  const tMax = today?.tMax ?? cur.temp ?? null;
  const tMin = today?.tMin ?? null;
  const rainSum = today?.precip ?? 0;
  const code = today?.code ?? cur.code;

  const thunder = code >= 95;
  const snow = (code >= 71 && code <= 77) || code === 85 || code === 86;
  const heavyRain = !snow && (code === 65 || code === 67 || code === 82 || rainSum >= T.rainSumHeavy);
  const raining = !snow && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82));
  const wet = raining || rainSum >= 1;
  const rainPossible = popMax >= T.popLikely;
  const fog = code === 45 || code === 48 || (visMin !== undefined && visMin < T.fogVis);

  const hot = tMax !== null && tMax >= T.hot;
  const veryHot = tMax !== null && tMax >= T.hotExtreme;
  const cold = tMax !== null && tMax <= T.cold;
  const freezing = tMin !== null && tMin <= T.freezing;
  const uvStrong = uvMax >= T.uvStrong;
  const uvVeryStrong = uvMax >= T.uvVeryStrong;
  const windy = windMax >= T.windCaution || gustMax >= 39;
  const stormy = windMax >= T.windRisk || gustMax >= T.gustRisk;

  // ── 风险提醒：安全相关，优先级最高 ─────────────────────────────
  // 说明：这里只根据预报数据推导风险，措辞为「将出现／正在出现」，
  // 不冒充官方预警。若要接入气象台正式预警（台风、暴雨、山洪等），
  // 在 META 中登记文案键后于此处 push 即可，界面会自动置顶为红色。
  const alerts: AdviceEntry[] = [];
  if (thunder) alerts.push(entry('alert-thunder'));
  if (stormy) alerts.push(entry('alert-wind'));
  if (heavyRain) alerts.push(entry('alert-rain'));
  if (snow && rainSum >= 5) alerts.push(entry('alert-snow'));
  if (veryHot) alerts.push(entry('alert-heat'));
  if (freezing) alerts.push(entry('alert-cold'));
  if (fog) alerts.push(entry('alert-fog'));

  // ── 出行穿搭 ──────────────────────────────────────────────
  const outfits: AdviceEntry[] = [];
  if (cold) outfits.push(entry('outfit-cold'));
  else if (tMin !== null && tMin <= T.coolNight) outfits.push(entry('outfit-warm'));
  if (wet || thunder) outfits.push(entry('outfit-rain'));
  if (stormy || windy) outfits.push(entry('outfit-wind'));
  if (hot) outfits.push(entry('outfit-heat'));
  else if (tMax !== null && tMax >= 26) outfits.push(entry('outfit-light'));
  if (!cold && tMax !== null && tMin !== null && tMax - tMin > T.tempSwing) {
    outfits.push(entry('outfit-layer'));
  }
  if (!outfits.length) outfits.push(entry('outfit-mild'));

  // ── 游玩安排 ──────────────────────────────────────────────
  const plans: AdviceEntry[] = [];
  if (thunder) plans.push(entry('plan-thunder'));
  if (heavyRain) plans.push(entry('plan-rain-heavy'));
  if (stormy) plans.push(entry('plan-wind-strong'));
  else if (windy && !heavyRain) plans.push(entry('plan-wind'));
  if (raining && !heavyRain && !thunder) plans.push(entry('plan-rain-light'));
  else if (rainPossible && !wet) plans.push(entry('plan-rain-possible'));
  if (fog) plans.push(entry('plan-fog'));
  if (hot) plans.push(entry('plan-heat'));
  if (cold) plans.push(entry('plan-cold'));

  const calmSky = code <= 1 && !wet && !fog && !stormy;
  if (calmSky) plans.push(entry('plan-good'));
  else if (code === 2 || code === 3) plans.push(entry('plan-photo'));
  if (calmSky && windMax < T.windCaution) plans.push(entry('plan-sunrise'));

  // ── 随身物品 ──────────────────────────────────────────────
  const items: AdviceEntry[] = [];
  if (heavyRain || thunder) items.push(entry('item-raincoat'));
  else if (raining) items.push(entry('item-umbrella'));
  else if (rainPossible) items.push(entry('item-foldable'));
  if (uvStrong) items.push(entry('item-sunscreen'));
  if (uvVeryStrong) items.push(entry('item-sunglasses'));
  // 风大时帽子容易被吹落，此时的遮阳优先级让给防晒霜与墨镜
  if (hot && !windy) items.push(entry('item-hat'));
  if (hot) items.push(entry('item-water'));
  if (cold) items.push(entry('item-coat-thick'));
  else if (tMin !== null && tMin <= T.coolNight) items.push(entry('item-jacket'));
  if (fog) items.push(entry('item-mask'));
  // 海边礁石与石阶湿滑，抓地鞋是这里最实用的一件装备
  if (wet || windy) items.push(entry('item-grip-shoes'));

  // ── 总览一句话 ────────────────────────────────────────────
  const risky = alerts.length > 0;
  const notable =
    wet || rainPossible || windy || hot || cold || fog || uvStrong || freezing || snow;
  const summary = entry(risky ? 'summary-risk' : notable ? 'summary-caution' : 'summary-good');

  return {
    summary,
    alerts: alerts.slice(0, MAX.alerts),
    outfits: outfits.slice(0, MAX.outfits),
    plans: plans.slice(0, MAX.plans),
    items: items.slice(0, MAX.items),
  };
}

export interface CoastAdviceInput {
  /** 有效波高（米） */
  waveHeight: number | null;
  /** 表层水温（℃） */
  sst: number | null;
  /** 潮势 */
  trend: 'rising' | 'falling' | 'steady';
  /** 距下次高潮的分钟数（null 表示无数据） */
  minutesToHigh: number | null;
  /** 距下次低潮的分钟数（null 表示无数据） */
  minutesToLow: number | null;
}

/**
 * 海边／礁石专属建议。
 * 本景点是礁石海岸，浪高、水温与潮时比气温更直接地决定「能不能下去」。
 */
export function buildCoastAdvice(input: CoastAdviceInput): CoastAdvice {
  const coast: AdviceEntry[] = [];

  const wh = input.waveHeight;
  if (wh !== null && wh >= 1.2) coast.push(entry('coast-swell-risk'));
  else if (wh !== null && wh >= 0.6) coast.push(entry('coast-swell-caution'));

  const toLow = input.minutesToLow;
  const toHigh = input.minutesToHigh;
  const nearLow = toLow !== null && toLow >= 0 && toLow <= 120;
  const nearHigh = toHigh !== null && toHigh >= 0 && toHigh <= 90;
  if (nearLow) coast.push(entry('coast-low-tide'));
  else if (nearHigh || input.trend === 'rising') coast.push(entry('coast-high-tide'));

  const sst = input.sst;
  if (sst !== null && sst <= 17) coast.push(entry('coast-cold-water', sst <= 12 ? 'risk' : 'caution'));

  if (!coast.length) coast.push(entry('coast-calm'));

  return { coast: coast.slice(0, MAX.coast) };
}
