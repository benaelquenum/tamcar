'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { BookOpenIcon, DownloadIcon, SearchIcon, XIcon } from '@/components/Icon';
import { GUIDE_SECTIONS, type GuideBlock, type GuideSection } from './content';
import { RichText } from './RichText';

const PDF_URL = '/admin/guide/pdf';

// Sans accents ni majuscules : « chauffeur » trouve « Chauffeurs », « ADR » trouve « adr »…
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function blockText(b: GuideBlock): string {
  switch (b.type) {
    case 'p':
    case 'h3':
      return b.text;
    case 'ul':
    case 'steps':
      return b.items.join(' ');
    case 'table':
      return [...b.head, ...b.rows.flat()].join(' ');
    case 'note':
      return `${b.title} ${b.text}`;
  }
}

const SEARCH_INDEX = GUIDE_SECTIONS.map((s) => ({
  id: s.id,
  text: norm(`${s.group} ${s.title} ${s.path ?? ''} ${s.blocks.map(blockText).join(' ')}`.replace(/\*\*/g, '')),
}));

/** Bouton « Guide » du menu + fenêtre (pop-up) du guide d'utilisation, avec téléchargement du PDF. */
export function GuideLauncher() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-sm rounded-lg px-md py-sm text-sm font-semibold text-white/85 transition hover:bg-white/10 hover:text-white"
      >
        <BookOpenIcon className="h-4 w-4" />
        Guide d&apos;utilisation
      </button>
      {open && <GuideDialog onClose={close} />}
    </>
  );
}

function GuideDialog({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState(GUIDE_SECTIONS[0].id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  const visible = useMemo<GuideSection[]>(() => {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return GUIDE_SECTIONS;
    const ok = new Set(SEARCH_INDEX.filter((s) => tokens.every((t) => s.text.includes(t))).map((s) => s.id));
    return GUIDE_SECTIONS.filter((s) => ok.has(s.id));
  }, [query]);

  // Une nouvelle recherche repart du haut du résultat.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    if (visible[0]) setActiveId(visible[0].id);
  }, [visible]);

  const goTo = useCallback((id: string) => {
    const root = scrollRef.current;
    const el = root?.querySelector<HTMLElement>(`[data-guide-id="${id}"]`);
    if (root && el) root.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
    setActiveId(id);
  }, []);

  // Suit la section visible pour surligner le sommaire.
  const onScroll = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    const top = root.scrollTop + 80;
    let current = visible[0]?.id;
    for (const s of visible) {
      const el = root.querySelector<HTMLElement>(`[data-guide-id="${s.id}"]`);
      if (el && el.offsetTop <= top) current = s.id;
    }
    if (current) setActiveId(current);
  }, [visible]);

  if (!mounted) return null;

  // Sommaire : une rubrique par groupe
  const groups: { name: string; items: GuideSection[] }[] = [];
  for (const s of visible) {
    const last = groups[groups.length - 1];
    if (last && last.name === s.group) last.items.push(s);
    else groups.push({ name: s.group, items: [s] });
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-neutral-900/60 p-0 md:items-center md:p-lg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        className="flex h-dvh w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl md:h-[min(90dvh,860px)] md:rounded-2xl"
      >
        <header className="grid grid-cols-[1fr_auto] items-center gap-sm border-b border-neutral-200 px-lg py-md md:flex">
          <div className="order-1 min-w-0 md:flex-1">
            <h2 id="guide-title" className="text-lg font-extrabold text-neutral-900">
              Guide d&apos;utilisation du back-office
            </h2>
            <p className="text-xs text-neutral-500">À quoi sert chaque onglet, et où aller pour chaque tâche.</p>
          </div>
          <a
            href={PDF_URL}
            download="Guide-back-office-TamCar.pdf"
            className="order-3 col-span-2 inline-flex items-center justify-center gap-xs rounded-lg bg-primary-700 px-md py-sm text-sm font-bold text-white transition hover:bg-primary-800 md:order-2 md:col-span-1"
          >
            <DownloadIcon className="h-4 w-4" />
            Télécharger le guide (PDF)
          </a>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer le guide"
            className="order-2 grid h-9 w-9 place-items-center rounded-full text-neutral-600 transition hover:bg-neutral-100 md:order-3"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Sommaire (écran large) */}
          <nav aria-label="Sommaire du guide" className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 md:flex">
            <div className="p-md">
              <SearchBox value={query} onChange={setQuery} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-sm pb-md">
              {groups.length === 0 && <p className="px-sm py-md text-xs text-neutral-500">Aucun résultat.</p>}
              {groups.map((g) => (
                <div key={g.name} className="mb-md">
                  <p className="px-sm pb-xs text-[10px] font-extrabold uppercase tracking-wider text-neutral-400">{g.name}</p>
                  <ul>
                    {g.items.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => goTo(s.id)}
                          aria-current={activeId === s.id ? 'true' : undefined}
                          className={`w-full rounded-md px-sm py-xs text-left text-sm transition ${
                            activeId === s.id ? 'bg-primary-100 font-bold text-primary-800' : 'text-neutral-700 hover:bg-neutral-100'
                          }`}
                        >
                          {s.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Recherche et saut de section (téléphone) */}
            <div className="space-y-sm border-b border-neutral-200 p-md md:hidden">
              <SearchBox value={query} onChange={setQuery} />
              <select
                aria-label="Aller à une section"
                value={activeId}
                onChange={(e) => goTo(e.target.value)}
                className="w-full rounded-lg bg-neutral-100 px-md py-sm text-sm ring-1 ring-neutral-200"
              >
                {visible.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>

            <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto px-lg py-lg">
              {visible.length === 0 ? (
                <p className="py-2xl text-center text-sm text-neutral-500">Aucune section ne correspond à « {query} ».</p>
              ) : (
                visible.map((s, i) => (
                  <GuideSectionView key={s.id} section={s} showGroup={i === 0 || visible[i - 1].group !== s.group} onNavigate={onClose} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative block">
      <span className="sr-only">Rechercher dans le guide</span>
      <SearchIcon className="pointer-events-none absolute left-sm top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Rechercher (ex. chauffeur, retrait…)"
        className="w-full rounded-lg bg-white py-sm pl-8 pr-sm text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </label>
  );
}

function GuideSectionView({ section, showGroup, onNavigate }: { section: GuideSection; showGroup: boolean; onNavigate: () => void }) {
  const canOpen = section.path && !section.path.includes('…');
  return (
    <section data-guide-id={section.id} className="mb-2xl scroll-mt-md">
      {showGroup && <p className="mb-sm text-[11px] font-extrabold uppercase tracking-wider text-primary-700">{section.group}</p>}
      <div className="mb-md flex flex-wrap items-center gap-sm border-b border-neutral-200 pb-sm">
        <h3 className="text-xl font-extrabold text-neutral-900">{section.title}</h3>
        {section.path && (
          <span className="rounded-full bg-neutral-100 px-sm py-0.5 font-mono text-[11px] text-neutral-500">{section.path}</span>
        )}
        {canOpen && (
          <Link href={section.path as string} onClick={onNavigate} className="ml-auto text-xs font-bold text-primary-700 hover:underline">
            Ouvrir l&apos;onglet →
          </Link>
        )}
      </div>
      <div className="space-y-sm">
        {section.blocks.map((b, i) => (
          <Block key={i} block={b} />
        ))}
      </div>
    </section>
  );
}

function Block({ block }: { block: GuideBlock }) {
  switch (block.type) {
    case 'p':
      return (
        <p className="text-sm leading-relaxed text-neutral-700">
          <RichText>{block.text}</RichText>
        </p>
      );
    case 'h3':
      return <h4 className="pt-sm text-xs font-extrabold uppercase tracking-wider text-primary-700">{block.text}</h4>;
    case 'ul':
      return (
        <ul className="space-y-xs">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-sm text-sm leading-relaxed text-neutral-700">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" aria-hidden />
              <span>
                <RichText>{it}</RichText>
              </span>
            </li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <ol className="space-y-sm">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-sm text-sm leading-relaxed text-neutral-700">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-100 text-[11px] font-extrabold text-primary-800">
                {i + 1}
              </span>
              <span>
                <RichText>{it}</RichText>
              </span>
            </li>
          ))}
        </ol>
      );
    case 'table':
      return (
        <div className="overflow-x-auto rounded-xl ring-1 ring-neutral-200">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="bg-neutral-100 text-[11px] font-extrabold uppercase tracking-wider text-neutral-500">
              <tr>
                {block.head.map((h) => (
                  <th key={h} className="px-md py-sm">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i} className="border-t border-neutral-100 align-top">
                  {r.map((c, j) => (
                    <td key={j} className={`px-md py-sm leading-relaxed ${j === 0 ? 'w-[34%] font-bold text-neutral-900' : 'text-neutral-700'}`}>
                      <RichText>{c}</RichText>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'note':
      return (
        <div
          className={`rounded-lg border-l-4 p-md ${
            block.tone === 'warn' ? 'border-warning bg-warning/10' : 'border-primary-500 bg-primary-50'
          }`}
        >
          <p className={`text-sm font-extrabold ${block.tone === 'warn' ? 'text-neutral-900' : 'text-primary-800'}`}>{block.title}</p>
          <p className="mt-xs text-sm leading-relaxed text-neutral-700">
            <RichText>{block.text}</RichText>
          </p>
        </div>
      );
  }
}
