import {
  CRITICAL_ACCOUNT_I18N_KEYS,
  EN_ACCOUNT,
  ZH_HANS_ACCOUNT,
  ZH_HANT_ACCOUNT,
} from './catalogs/account.js';
import {
  CRITICAL_COMMUNITY_I18N_KEYS,
  EN_COMMUNITY,
  ZH_HANS_COMMUNITY,
  ZH_HANT_COMMUNITY,
} from './catalogs/community.js';
import {
  CRITICAL_CONTENT_I18N_KEYS,
  EN_CONTENT,
  ZH_HANS_CONTENT,
  ZH_HANT_CONTENT,
} from './catalogs/content.js';
import { CRITICAL_PLAY_I18N_KEYS, EN_PLAY, ZH_HANS_PLAY, ZH_HANT_PLAY } from './catalogs/play.js';
import {
  CRITICAL_REVIEW_I18N_KEYS,
  EN_REVIEW,
  ZH_HANS_REVIEW,
  ZH_HANT_REVIEW,
} from './catalogs/review.js';
import {
  CRITICAL_SHELL_I18N_KEYS,
  EN_SHELL,
  ZH_HANS_SHELL,
  ZH_HANT_SHELL,
} from './catalogs/shell.js';
import { currentLocale, type Locale } from './locale.js';

type I18nParams = Record<string, number | string>;

export type AppI18nDomain = {
  critical: readonly string[];
  english: Readonly<Record<string, string>>;
  locales: Readonly<Record<Exclude<Locale, 'en'>, Readonly<Record<string, string>>>>;
  name: string;
  prefixes: readonly string[];
};

export const APP_I18N_DOMAINS: readonly AppI18nDomain[] = [
  {
    name: 'shell',
    prefixes: [
      'nav',
      'home',
      'site',
      'footer',
      'notFound',
      'connection',
      'lag',
      'prefs',
      'homePuzzle',
      'homeForum',
    ],
    english: EN_SHELL,
    locales: { 'zh-Hans': ZH_HANS_SHELL, 'zh-Hant': ZH_HANT_SHELL },
    critical: CRITICAL_SHELL_I18N_KEYS,
  },
  {
    name: 'content',
    prefixes: [
      'videos',
      'articles',
      'rules',
      'news',
      'patron',
      'contact',
      'about',
      'source',
      'contribute',
      'thanks',
      'faq',
      'terms',
      'privacy',
    ],
    english: EN_CONTENT,
    locales: { 'zh-Hans': ZH_HANS_CONTENT, 'zh-Hant': ZH_HANT_CONTENT },
    critical: CRITICAL_CONTENT_I18N_KEYS,
  },
  {
    name: 'account',
    prefixes: ['account'],
    english: EN_ACCOUNT,
    locales: { 'zh-Hans': ZH_HANS_ACCOUNT, 'zh-Hant': ZH_HANT_ACCOUNT },
    critical: CRITICAL_ACCOUNT_I18N_KEYS,
  },
  {
    name: 'community',
    prefixes: [
      'profile',
      'inbox',
      'friends',
      'following',
      'chat',
      'title',
      'verifyTitle',
      'coach',
      'streamer',
      'challenge',
    ],
    english: EN_COMMUNITY,
    locales: { 'zh-Hans': ZH_HANS_COMMUNITY, 'zh-Hant': ZH_HANT_COMMUNITY },
    critical: CRITICAL_COMMUNITY_I18N_KEYS,
  },
  {
    name: 'play',
    prefixes: ['game', 'play', 'lobby', 'setup', 'variant', 'live', 'result'],
    english: EN_PLAY,
    locales: { 'zh-Hans': ZH_HANS_PLAY, 'zh-Hant': ZH_HANT_PLAY },
    critical: CRITICAL_PLAY_I18N_KEYS,
  },
  {
    name: 'review',
    prefixes: ['replay', 'watch'],
    english: EN_REVIEW,
    locales: { 'zh-Hans': ZH_HANS_REVIEW, 'zh-Hant': ZH_HANT_REVIEW },
    critical: CRITICAL_REVIEW_I18N_KEYS,
  },
];

const EN = {
  ...EN_SHELL,
  ...EN_CONTENT,
  ...EN_ACCOUNT,
  ...EN_COMMUNITY,
  ...EN_PLAY,
  ...EN_REVIEW,
} as const;

export type I18nKey = keyof typeof EN;

const ZH_HANS = {
  ...ZH_HANS_SHELL,
  ...ZH_HANS_CONTENT,
  ...ZH_HANS_ACCOUNT,
  ...ZH_HANS_COMMUNITY,
  ...ZH_HANS_PLAY,
  ...ZH_HANS_REVIEW,
} satisfies Partial<Record<I18nKey, string>>;

const ZH_HANT = {
  ...ZH_HANT_SHELL,
  ...ZH_HANT_CONTENT,
  ...ZH_HANT_ACCOUNT,
  ...ZH_HANT_COMMUNITY,
  ...ZH_HANT_PLAY,
  ...ZH_HANT_REVIEW,
} satisfies Partial<Record<I18nKey, string>>;

const CATALOGS: Record<Exclude<Locale, 'en'>, Partial<Record<I18nKey, string>>> = {
  'zh-Hans': ZH_HANS,
  'zh-Hant': ZH_HANT,
};

export const CRITICAL_I18N_KEYS = [
  ...CRITICAL_SHELL_I18N_KEYS,
  ...CRITICAL_CONTENT_I18N_KEYS,
  ...CRITICAL_ACCOUNT_I18N_KEYS,
  ...CRITICAL_COMMUNITY_I18N_KEYS,
  ...CRITICAL_PLAY_I18N_KEYS,
  ...CRITICAL_REVIEW_I18N_KEYS,
] as const satisfies readonly I18nKey[];

export function t(key: I18nKey, params: I18nParams = {}, locale: Locale = currentLocale()): string {
  const template = translationFor(locale, key);
  return interpolate(template, params);
}

export function hasAppTranslation(locale: Locale, key: I18nKey): boolean {
  if (locale === 'en') return key in EN;
  return CATALOGS[locale][key] !== undefined;
}

export function appTranslationKeys(): I18nKey[] {
  return Object.keys(EN) as I18nKey[];
}

function translationFor(locale: Locale, key: I18nKey): string {
  if (locale === 'en') return EN[key];
  return CATALOGS[locale][key] ?? EN[key];
}

function interpolate(template: string, params: I18nParams): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}
