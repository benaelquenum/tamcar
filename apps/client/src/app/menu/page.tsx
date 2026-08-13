import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { BottomTabBar } from '@/components/BottomTabBar';
import {
  ArrowRightIcon,
  CalendarIcon,
  CarIcon,
  FileTextIcon,
  GiftIcon,
  HomeIcon,
  LifeBuoyIcon,
  PassIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
} from '@/components/Icon';
import { getCurrentProfile } from '@/lib/session';
import { SUPPORT_PHONE } from '@/lib/support';

/**
 * Second niveau de navigation. La barre d'onglets n'a que cinq
 * emplacements ; tout ce qui n'est pas quotidien atterrit ici, groupé par
 * intention plutôt qu'en une liste plate.
 */

type Entry = {
  href: string;
  label: string;
  hint: string;
  Icon: (props: { className?: string }) => JSX.Element;
  external?: boolean;
};

const SERVICES: Entry[] = [
  {
    href: '/reservations',
    label: 'Mes réservations',
    hint: 'Vos courses programmées, à venir et passées',
    Icon: CalendarIcon,
  },
  {
    href: '/tampass',
    label: 'TamPass',
    hint: 'Abonnement trajets réguliers, chauffeur attitré',
    Icon: PassIcon,
  },
  {
    href: '/chauffeurs',
    label: 'Mes chauffeurs',
    hint: 'Reprendre un chauffeur que vous avez déjà eu',
    Icon: UserIcon,
  },
  {
    href: '/commande?proche=1',
    label: 'Commander pour un proche',
    hint: 'La course part à son nom et à son numéro',
    Icon: UsersIcon,
  },
  {
    href: '/lieux',
    label: 'Mes lieux',
    hint: 'Maison, travail et vos adresses enregistrées',
    Icon: HomeIcon,
  },
];

const COMPTE: Entry[] = [
  { href: '/compte', label: 'Mon compte', hint: 'Profil, langue, mot de passe', Icon: SettingsIcon },
  { href: '/parrainer', label: 'Parrainer', hint: 'Invitez, gagnez du crédit TamCar', Icon: GiftIcon },
  { href: '/cgu', label: 'Conditions & confidentialité', hint: 'CGU et politique de confidentialité', Icon: FileTextIcon },
];

function Row({ entry }: { entry: Entry }) {
  const inner = (
    <>
      <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-primary-50 text-primary-700">
        <entry.Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-neutral-900">{entry.label}</span>
        <span className="block truncate text-[11px] text-neutral-500">{entry.hint}</span>
      </span>
      <ArrowRightIcon className="h-4 w-4 flex-none text-neutral-300" />
    </>
  );
  const cls =
    'flex items-center gap-md rounded-xl border border-neutral-200 bg-white p-md transition hover:border-primary-300 hover:shadow-sm';

  if (entry.external) {
    return (
      <a href={entry.href} target="_blank" rel="noreferrer" className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={entry.href} className={cls}>
      {inner}
    </Link>
  );
}

export default async function MenuPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const aide: Entry = {
    href: `https://wa.me/${SUPPORT_PHONE.replace(/^\+/, '')}?text=${encodeURIComponent(
      "Bonjour, j'ai besoin d'aide sur TamCar.",
    )}`,
    label: 'Aide',
    hint: 'Écrivez-nous sur WhatsApp, on répond vite',
    Icon: LifeBuoyIcon,
    external: true,
  };

  return (
    <main className="relative min-h-dvh bg-white">
      <div className="mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center gap-md">
          <Logo className="h-8 w-auto" />
        </header>

        <h1 className="mt-lg text-2xl font-extrabold text-neutral-900">Menu</h1>

        <section className="mt-lg">
          <h2 className="mb-sm text-xs font-bold uppercase tracking-wider text-neutral-500">
            Services
          </h2>
          <div className="space-y-sm">
            {SERVICES.map((e) => (
              <Row key={e.href} entry={e} />
            ))}
          </div>
        </section>

        <section className="mt-lg">
          <h2 className="mb-sm text-xs font-bold uppercase tracking-wider text-neutral-500">
            Compte
          </h2>
          <div className="space-y-sm">
            {COMPTE.map((e) => (
              <Row key={e.href} entry={e} />
            ))}
            <Row entry={aide} />
          </div>
        </section>

        <section className="mt-lg">
          <Link
            href="/devenir-chauffeur"
            className="flex items-center gap-md rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 p-md text-white shadow-glow"
          >
            <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-white/20">
              <CarIcon className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-bold">Devenir chauffeur TamCar</span>
              <span className="block text-[11px] opacity-90">
                2 formules · cession 24 mois ou propriétaire libre
              </span>
            </span>
            <ArrowRightIcon className="h-4 w-4 flex-none" />
          </Link>
        </section>

        <BottomTabBar />
      </div>
    </main>
  );
}
