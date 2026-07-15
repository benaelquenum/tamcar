import { Logo } from '@/components/Logo';

export default function CommandeLoading() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-64 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-70 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center gap-md">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200">
            <span className="text-xl leading-none text-neutral-400">←</span>
          </div>
          <Logo className="h-8 w-auto opacity-60" />
        </header>

        <h1 className="mt-lg text-2xl font-extrabold leading-tight text-neutral-900">
          Où allez-vous ?
        </h1>

        <section className="mt-lg space-y-md">
          <SkeletonInput />
          <SkeletonInput />
        </section>

        <section className="mt-lg">
          <div className="h-64 w-full animate-pulse rounded-xl bg-neutral-200" />
        </section>

        <div className="mt-lg flex items-center gap-xs text-xs text-neutral-500">
          <span className="relative grid h-2 w-2 place-items-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-500/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
          </span>
          <span>Chargement de la carte…</span>
        </div>
      </div>
    </main>
  );
}

function SkeletonInput() {
  return (
    <div>
      <div className="mb-xs h-3 w-16 rounded bg-neutral-200" />
      <div className="h-14 w-full animate-pulse rounded-xl bg-neutral-100 ring-1 ring-neutral-200" />
      <div className="mt-md flex flex-wrap gap-xs">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-6 w-16 animate-pulse rounded-full bg-neutral-100" />
        ))}
      </div>
    </div>
  );
}
