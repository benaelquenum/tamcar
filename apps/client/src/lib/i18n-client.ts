'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_LANG, LANG_COOKIE, t, type Lang } from './i18n';

function readLangFromCookie(): Lang {
  if (typeof document === 'undefined') return DEFAULT_LANG;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LANG_COOKIE}=(\\w+)`));
  const val = match?.[1];
  if (val === 'fr' || val === 'en') return val;
  return DEFAULT_LANG;
}

export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG);
  useEffect(() => {
    setLang(readLangFromCookie());
  }, []);
  return (key, vars) => t(lang, key, vars);
}
