export type Locale = 'en' | 'zh-Hans' | 'zh-Hant';

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'zh-Hans', 'zh-Hant'];

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_STORAGE_KEY = 'mistboard.locale';

export type LocaleMeta = {
  dateLocale: string;
  displayName: string;
  htmlLang: string;
  pathPrefix: string;
};

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: {
    dateLocale: 'en-US',
    displayName: 'English',
    htmlLang: 'en',
    pathPrefix: '',
  },
  'zh-Hans': {
    dateLocale: 'zh-CN',
    displayName: '简体中文',
    htmlLang: 'zh-Hans',
    pathPrefix: '/zh-hans',
  },
  'zh-Hant': {
    dateLocale: 'zh-TW',
    displayName: '繁體中文',
    htmlLang: 'zh-Hant',
    pathPrefix: '/zh-hant',
  },
};

export function isLocale(value: string | null | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function isArticleLocale(
  locale: Locale | null | undefined,
): locale is 'zh-Hans' | 'zh-Hant' {
  return locale === 'zh-Hans' || locale === 'zh-Hant';
}

export function localeFromPath(pathname = currentPathname()): Locale | null {
  const lower = pathname.toLowerCase();
  if (lower === '/zh-hans' || lower.startsWith('/zh-hans/')) return 'zh-Hans';
  if (lower === '/zh-hant' || lower.startsWith('/zh-hant/')) return 'zh-Hant';
  return null;
}

export function storedLocale(): Locale | null {
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function setStoredLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage can be unavailable in private mode or tests.
  }
}

export function browserLocale(): Locale | null {
  if (typeof navigator === 'undefined') return null;
  const languages = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  for (const language of languages) {
    const locale = localeFromLanguageTag(language);
    if (locale) return locale;
  }
  return null;
}

export function localeFromLanguageTag(language: string | null | undefined): Locale | null {
  if (!language) return null;
  const tag = language.toLowerCase();
  if (tag === 'zh-hans' || tag === 'zh-cn' || tag === 'zh-sg') return 'zh-Hans';
  if (
    tag === 'zh-hant' ||
    tag === 'zh-tw' ||
    tag === 'zh-hk' ||
    tag === 'zh-mo' ||
    tag === 'zh-hant-tw'
  )
    return 'zh-Hant';
  if (tag === 'zh' || tag.startsWith('zh-')) return 'zh-Hans';
  if (tag === 'en' || tag.startsWith('en-')) return 'en';
  return null;
}

export function currentLocale(): Locale {
  return localeFromPath() ?? storedLocale() ?? browserLocale() ?? DEFAULT_LOCALE;
}

export function applyAccountLocalePreference(locale: string | null | undefined): boolean {
  if (!locale || localeFromPath()) return false;
  const previous = currentLocale();
  const supportedLocale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  setStoredLocale(supportedLocale);
  applyDocumentLocale(supportedLocale);
  return previous !== supportedLocale;
}

export function initializeLocaleFromCurrentUrl(): Locale {
  const pathLocale = localeFromPath();
  if (pathLocale) setStoredLocale(pathLocale);
  const locale = currentLocale();
  applyDocumentLocale(locale);
  return locale;
}

export function applyDocumentLocale(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = LOCALE_META[locale].htmlLang;
}

export function localizedHref(path: string, locale = currentLocale()): string {
  if (!path.startsWith('/')) return path;
  const { pathname, suffix } = splitPathSuffix(stripLocalePrefix(path));
  const prefix = contentLocalePrefix(locale);
  if (!prefix || !isContentPath(pathname)) return `${pathname}${suffix}`;
  return `${prefix}${pathname}${suffix}`;
}

export function contentLocalePrefix(locale: Locale): string {
  if (locale === 'zh-Hans' || locale === 'zh-Hant') return LOCALE_META[locale].pathPrefix;
  return '';
}

export function stripLocalePrefix(path: string): string {
  const { pathname, suffix } = splitPathSuffix(path);
  const lower = pathname.toLowerCase();
  for (const locale of SUPPORTED_LOCALES) {
    const prefix = LOCALE_META[locale].pathPrefix;
    if (!prefix) continue;
    if (lower === prefix || lower.startsWith(`${prefix}/`)) {
      const stripped = pathname.slice(prefix.length) || '/';
      return `${stripped}${suffix}`;
    }
  }
  return path;
}

function isContentPath(pathname: string): boolean {
  return (
    pathname === '/rules' ||
    pathname.startsWith('/rules/') ||
    pathname === '/blog' ||
    pathname.startsWith('/blog/')
  );
}

function splitPathSuffix(path: string): { pathname: string; suffix: string } {
  const match = path.match(/^([^?#]*)(.*)$/);
  return {
    pathname: match?.[1] || '/',
    suffix: match?.[2] || '',
  };
}

function currentPathname(): string {
  return typeof window === 'undefined' ? '/' : window.location.pathname;
}
