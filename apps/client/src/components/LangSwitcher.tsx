'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AVAILABLE_LANGS, LANG_COOKIE, type Lang } from '@/lib/i18n';

export function LangSwitcher({ current }: { current: Lang }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setLang(next: Lang) {
    if (next === current || pending) return;
    // Set cookie 1 an
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${maxAge}; SameSite=Lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex gap-xs">
      {AVAILABLE_LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          disabled={pending}
          className={`rounded-md px-md py-xs text-xs font-bold transition ${
            current === l.code
              ? 'bg-primary-500 text-white'
              : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
          aria-pressed={current === l.code}
        >
          {l.native}
        </button>
      ))}
    </div>
  );
}
