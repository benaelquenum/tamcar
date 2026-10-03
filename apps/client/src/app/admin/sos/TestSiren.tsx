'use client';

import { useState } from 'react';
import { BellIcon } from '@/components/Icon';
import { testSiren } from '@/lib/adminSounds';

export function TestSiren() {
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setMsg(null);
    const ok = await testSiren(3000);
    setMsg(
      ok
        ? 'Sirène lancée pendant 3 secondes. Si vous ne l’entendez pas, vérifiez le volume de l’appareil.'
        : 'Le navigateur bloque le son : cliquez une fois sur la page, puis réessayez.',
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-md">
      <button
        type="button"
        onClick={run}
        className="inline-flex items-center gap-xs rounded-lg bg-neutral-900 px-md py-sm text-xs font-bold text-white hover:bg-neutral-700"
      >
        <BellIcon className="h-4 w-4" />
        Tester la sirène (3 s)
      </button>
      {msg && <p className="text-xs text-neutral-600">{msg}</p>}
    </div>
  );
}
