import { cookies } from 'next/headers';
import { DEFAULT_LANG, LANG_COOKIE, t, type Lang } from './i18n';

export function getLang(): Lang {
  const c = cookies().get(LANG_COOKIE)?.value;
  if (c === 'fr' || c === 'en') return c;
  return DEFAULT_LANG;
}

export function getT(): (key: string, vars?: Record<string, string | number>) => string {
  const lang = getLang();
  return (key, vars) => t(lang, key, vars);
}
