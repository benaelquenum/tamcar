export default function CommandeLoading() {
  return (
    <main className="flex h-dvh flex-col bg-white">
      <header className="flex items-center gap-md px-lg pb-md pt-lg">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200">
          <span className="text-xl leading-none text-neutral-400">←</span>
        </div>
        <h1 className="text-xl font-extrabold leading-tight text-neutral-900">Votre trajet</h1>
      </header>

      <section className="space-y-sm px-lg">
        <div className="h-14 w-full animate-pulse rounded-xl bg-neutral-100 ring-1 ring-neutral-200" />
        <div className="h-14 w-full animate-pulse rounded-xl bg-neutral-100 ring-1 ring-neutral-200" />
      </section>

      <section className="relative mt-md min-h-[180px] flex-1 animate-pulse bg-neutral-100">
        <div className="absolute bottom-md left-md flex items-center gap-xs text-xs text-neutral-500">
          <span className="relative grid h-2 w-2 place-items-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-500/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
          </span>
          <span>Chargement de la carte…</span>
        </div>
      </section>

      <div className="flex-none border-t border-neutral-100 bg-white px-lg pb-lg pt-md">
        <div className="h-14 w-full rounded-xl bg-primary-500/40" />
      </div>
    </main>
  );
}
