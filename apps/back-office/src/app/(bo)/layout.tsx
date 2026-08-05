import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { signOutAction } from '@/app/login/actions';
import {
  BankIcon,
  BookIcon,
  CalendarIcon,
  CheckIcon,
  DashboardIcon,
  FileIcon,
  FolderIcon,
  InboxIcon,
  LogoutIcon,
  PlusIcon,
  SendIcon,
  UsersIcon,
} from '@/components/Icon';
import { Logo } from '@/components/Logo';

const NAV = [
  { href: '/', label: 'Tableau de bord', icon: DashboardIcon },
  { href: '/courrier', label: 'Courrier', icon: InboxIcon },
  { href: '/documents', label: 'Documents', icon: FolderIcon },
  { href: '/echeances', label: 'Échéances', icon: CalendarIcon },
];

const NAV_COMPTA = [
  { href: '/tresorerie', label: 'Trésorerie', icon: BankIcon },
  { href: '/tresorerie/operation', label: 'Nouvelle opération', icon: PlusIcon },
  { href: '/tresorerie/validations', label: 'Validations', icon: CheckIcon },
  { href: '/compta/ecritures', label: 'Écritures', icon: BookIcon },
  { href: '/compta/balance', label: 'Balance', icon: DashboardIcon },
  { href: '/compta/grand-livre', label: 'Grand livre', icon: FolderIcon },
  { href: '/compta/comptes', label: 'Plan de comptes', icon: FileIcon },
  { href: '/compta/plateforme', label: 'Sync plateforme', icon: SendIcon },
];

const NAV_SOON = [{ label: 'RH & paie', icon: UsersIcon }];

export default async function BoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  const roleLabel =
    profile?.role === 'admin'
      ? 'Fondateur'
      : profile?.role === 'accountant'
        ? 'Expert-comptable (lecture)'
        : 'Secrétariat';

  return (
    <div className="flex min-h-dvh bg-neutral-50">
      {/* Sidebar — même charte que l'admin : fond bleu, texte blanc */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col bg-primary-700 text-white">
        <div className="flex items-center gap-sm px-lg py-lg">
          <div className="rounded-md bg-white p-xs">
            <Logo className="h-7 w-auto" />
          </div>
          <div>
            <p className="text-sm font-extrabold leading-tight">Office</p>
            <p className="text-[10px] uppercase tracking-wider text-primary-200">
              Back-office
            </p>
          </div>
        </div>

        <nav className="mt-md flex-1 space-y-xs px-md">
          {NAV.map(({ href, label, icon: IconCmp }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-md rounded-lg px-md py-sm text-sm font-semibold text-primary-100 transition hover:bg-primary-600 hover:text-white"
            >
              <IconCmp className="h-5 w-5 shrink-0" />
              {label}
            </Link>
          ))}

          <p className="px-md pb-xs pt-lg text-[10px] font-bold uppercase tracking-wider text-primary-300">
            Trésorerie & compta
          </p>
          {NAV_COMPTA.map(({ href, label, icon: IconCmp }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-md rounded-lg px-md py-sm text-sm font-semibold text-primary-100 transition hover:bg-primary-600 hover:text-white"
            >
              <IconCmp className="h-5 w-5 shrink-0" />
              {label}
            </Link>
          ))}

          <p className="px-md pb-xs pt-lg text-[10px] font-bold uppercase tracking-wider text-primary-300">
            Bientôt
          </p>
          {NAV_SOON.map(({ label, icon: IconCmp }) => (
            <span
              key={label}
              className="flex cursor-not-allowed items-center gap-md rounded-lg px-md py-sm text-sm font-semibold text-primary-400"
            >
              <IconCmp className="h-5 w-5 shrink-0" />
              {label}
            </span>
          ))}
        </nav>

        <div className="border-t border-primary-600 px-lg py-md">
          <p className="truncate text-sm font-bold">
            {profile?.full_name ?? user.email}
          </p>
          <p className="text-[11px] text-primary-200">{roleLabel}</p>
          <form action={signOutAction} className="mt-sm">
            <button
              type="submit"
              className="flex items-center gap-sm text-xs font-semibold text-primary-200 transition hover:text-white"
            >
              <LogoutIcon className="h-4 w-4" />
              Se déconnecter
            </button>
          </form>
        </div>
      </aside>

      <main className="ml-60 flex-1 px-2xl py-xl">{children}</main>
    </div>
  );
}
