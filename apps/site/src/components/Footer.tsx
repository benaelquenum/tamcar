import Link from 'next/link';
import { ADDRESS, CLIENT_APP_URL, CONTACT_EMAIL, DRIVER_APP_URL, LEGAL } from '@/lib/config';

export function Footer() {
  return (
    <footer className="bg-neutral-900 text-neutral-400">
      <div className="mx-auto grid max-w-6xl gap-2xl px-lg py-3xl md:grid-cols-4">
        <div className="md:col-span-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-blanc.png" alt="TamCar" className="h-14 w-auto" />
          <p className="mt-md text-sm leading-relaxed">
            Le VTC du Bénin. Cotonou, Porto-Novo et le corridor, à prix fixe garanti.
          </p>
        </div>

        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-200">Le site</h2>
          <ul className="mt-md space-y-xs text-sm">
            <li><Link href="/clients" className="hover:text-white">Clients</Link></li>
            <li><Link href="/chauffeurs" className="hover:text-white">Chauffeurs</Link></li>
            <li><Link href="/partenaires" className="hover:text-white">Partenaires véhicule</Link></li>
            <li><Link href="/connexion" className="hover:text-white">Espace partenaire</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-200">Les applications</h2>
          <ul className="mt-md space-y-xs text-sm">
            <li><a href={CLIENT_APP_URL} className="hover:text-white">TamCar : commander une course</a></li>
            <li><a href={DRIVER_APP_URL} className="hover:text-white">TamCar Pro : espace chauffeur</a></li>
          </ul>
          <h2 className="mt-xl text-xs font-bold uppercase tracking-wider text-neutral-200">Documents</h2>
          <ul className="mt-md space-y-xs text-sm">
            <li><a href={LEGAL.cgu} className="hover:text-white">Conditions d’utilisation</a></li>
            <li><a href={LEGAL.privacy} className="hover:text-white">Confidentialité</a></li>
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-200">Nous joindre</h2>
          <address className="mt-md space-y-xs text-sm not-italic">
            <p>{ADDRESS}</p>
            <p>
              <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white">{CONTACT_EMAIL}</a>
            </p>
          </address>
        </div>
      </div>
      <div className="border-t border-neutral-800 px-lg py-lg text-center text-xs text-neutral-500">
        © {new Date().getFullYear()} TamCar — Tam Logistics SARL, en cours de constitution. Les simulations de gains sont indicatives : ni garantie de rendement, ni engagement avant la signature d’un contrat.
      </div>
    </footer>
  );
}
