import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { ParrainerClient } from './ParrainerClient';

type Redemption = { code: string; reward_fcfa: number; created_at: string };

export default async function ParrainerPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login?next=/parrainer');

  const supabase = createServerSupabase();
  const { data: myCode } = await supabase.rpc('get_or_create_my_referral_code');
  const { data: redemptions } = await supabase
    .from('referral_redemptions')
    .select('code, reward_fcfa, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const code = (myCode as { code: string; reward_fcfa: number } | null) || {
    code: '—',
    reward_fcfa: 500,
  };
  const list = (redemptions ?? []) as Redemption[];
  const mineOwned = list.filter((r) => r.code === code.code);
  const totalEarned = mineOwned.reduce((s, r) => s + r.reward_fcfa, 0);

  return (
    <main className="relative min-h-dvh bg-neutral-50">
      <div className="relative z-10 mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center gap-md">
          <Link
            href="/"
            aria-label="Retour"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200"
          >
            <span className="text-xl leading-none">←</span>
          </Link>
          <Logo className="h-8 w-auto" />
        </header>

        <section className="mt-xl">
          <h1 className="text-2xl font-extrabold text-neutral-900">
            Parraine un ami, gagne {code.reward_fcfa} F
          </h1>
          <p className="mt-xs text-sm text-neutral-600">
            Quand ton ami saisit ton code à sa première commande, vous recevez chacun{' '}
            <strong>{code.reward_fcfa} F</strong> sur votre wallet TamCar Crédit.
          </p>
        </section>

        <section className="mt-lg rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 p-lg text-white shadow-glow">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary-100">
            Ton code parrainage
          </p>
          <p
            className="mt-xs select-all text-4xl font-extrabold tracking-widest"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {code.code}
          </p>
          <ParrainerClient code={code.code} reward={code.reward_fcfa} />
        </section>

        {mineOwned.length > 0 && (
          <section className="mt-lg rounded-xl bg-white p-lg ring-1 ring-neutral-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Gains parrainage
            </p>
            <p
              className="mt-xs text-2xl font-extrabold text-primary-700"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {totalEarned.toLocaleString('fr-FR').replace(/,/g, ' ')} F
            </p>
            <p className="mt-xs text-[11px] text-neutral-600">
              {mineOwned.length} ami{mineOwned.length > 1 ? 's' : ''} parrainé
              {mineOwned.length > 1 ? 's' : ''}
            </p>
          </section>
        )}

        <section className="mt-lg rounded-xl border-2 border-dashed border-neutral-200 bg-white p-lg">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Un ami t&apos;a donné un code ?
          </p>
          <RedeemForm />
        </section>

        <div className="h-2xl" />
      </div>
    </main>
  );
}

function RedeemForm() {
  return (
    <form action="/parrainer/redeem" method="post" className="mt-md flex gap-sm">
      <input
        type="text"
        name="code"
        maxLength={12}
        minLength={6}
        required
        placeholder="XXXXXX"
        className="flex-1 rounded-lg bg-neutral-100 px-md py-sm font-mono text-lg font-bold uppercase tracking-widest text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      />
      <button
        type="submit"
        className="rounded-lg bg-primary-500 px-md text-sm font-bold text-white shadow-sm hover:brightness-110"
      >
        Utiliser
      </button>
    </form>
  );
}
