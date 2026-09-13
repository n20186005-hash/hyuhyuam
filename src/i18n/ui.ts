import zh from './zh.json';
import en from './en.json';
import ja from './ja.json';
import ko from './ko.json';

export const defaultLang = 'ko';
export const languagesList = ['ko', 'zh', 'en', 'ja'] as const;

export const languages: Record<string, string> = {
  ko: 'ko',
  zh: '中',
  en: 'en',
  ja: 'jp',
};

const ui: Record<string, any> = { zh, en, ja, ko };

export function getLangFromUrl(url: URL): string {
  const seg = url.pathname.split('/').filter(Boolean);
  const lang = seg[0];
  return (languagesList as readonly string[]).includes(lang) ? lang : defaultLang;
}

export function getI18n(url: URL) {
  const lang = getLangFromUrl(url);
  const messages = ui[lang];
  const t = (key: string): string => {
    const found = key
      .split('.')
      .reduce<any>((o, i) => (o == null ? undefined : o[i]), messages);
    return found ?? '';
  };
  return { lang, messages, t };
}

/**
 * 生成站点内链路径，统一带尾斜杠。
 * 站点以目录形式产出（/en/index.html 对外即 /en/），
 * 若链接写成 /en，会先经过一次跳转，还会让搜索引擎把 /en 与 /en/ 分别收录。
 */
export function localeHref(lang: string, hash = ''): string {
  return `/${lang}/${hash}`;
}

/**
 * canonical 与 hreflang 的绝对地址。
 * 必须与浏览器实际访问到的地址完全一致（含尾斜杠），否则会互相冲突。
 */
export function buildAlternates(path = ''): Record<string, string> {
  const base = 'https://hyuhyuam.com';
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
  const mk = (l: string) => `${base}/${l}/${clean ? clean + '/' : ''}`;
  return {
    zh: mk('zh'),
    en: mk('en'),
    ja: mk('ja'),
    ko: mk('ko'),
    xDefault: mk('ko'),
  };
}

export function htmlLangAttr(lang: string): string {
  if (lang === 'zh') return 'zh-CN';
  return lang;
}

/**
 * 填充展示模板里的 {placeholder}。
 * 评分、评价数等会变动的数据统一存在 src/config.ts，各语言只保留措辞与括号样式
 * （例如中文用全角「（）」、英文用半角「()」），避免数字被写死在多份语言文件中。
 */
export function fillTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}
