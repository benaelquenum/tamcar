import { createServerSupabase } from '@/lib/supabase-server';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { setProgramRule } from './actions';

export const dynamic = 'force-dynamic';

type RuleRow = { key: string; value: number; label: string };
type Summary = {
  start?: string;
  month_paid?: number;
  month_count?: number;
  month_drivers?: number;
  total_paid?: number;
  approach_month_paid?: number;
  approach_month_count?: number;
  approach_total_paid?: number;
};

function fmt(n: number | null | undefined): string {
  return Math.round(n ?? 0).toLocaleString('fr-FR').replace(/,/g, ' ');
}

const VEHICLES: { cat: string; label: string }[] = [
  { cat: 'moto', label: 'Moto' },
  { cat: 'tricycle', label: 'Tricycle' },
  { cat: 'essentiel', label: 'Voiture Essentiel' },
  { cat: 'confort', label: 'Voiture Confort' },
];

export default async function AdminBonusPage() {
  const supabase = createServerSupabase();
  const [{ data: rules }, { data: sum }] = await Promise.all([
    supabase.from('program_rules').select('key, value, label').order('key'),
    supabase.rpc('admin_bonus_summary'),
  ]);
  const rows = (rules ?? []) as RuleRow[];
  const r = Object.fromEntries(rows.map((x) => [x.key, x.value])) as Record<string, number>;
  const s = (sum ?? {}) as Summary;
  const cede = (r.surplus_cede_pct ?? 0) / 100;

  const table = VEHICLES.map((v) => {
    const floor = r[`floor_${v.cat}`] ?? 0;
    const share = (r[`share_${v.cat}`] ?? 0) / 100;
    const take = floor * share; // ce que TamCar encaisse par jour à l'objectif
    const cotis = r[`tamassur_${v.cat}`] ?? 0;
    const ex = (pct: number) => {
      const surplus = floor * (pct / 100 - 1);
      const gain = surplus * share;
      const bonus = Math.floor(gain * cede);
      return { surplus, gain, bonus, keeps: gain - bonus };
    };
    return { ...v, floor, share, take, cotis, rate: Math.round(1000 * share * cede), e150: ex(150), e200: ex(200) };
  });

  const groups: { title: string; hint?: string; keys: string[] }[] = [
    { title: 'Objectifs quotidiens (volume dans l’app)', hint: 'Plancher de recettes = objectif du jour tout compris ÷ 60 % (part de TamCar, versement et TamAssur compris) : moto 3 500 F → 5 850 F, tricycle 6 000 F → 10 000 F, Essentiel 8 200 F → 13 700 F, Confort 10 000 F → 16 700 F (décision du 20 octobre 2026). C’est le seuil à partir duquel le bonus se calcule et le volume affiché aux partenaires dans leur contrat.', keys: ['floor_moto', 'floor_tricycle', 'floor_essentiel', 'floor_confort'] },
    { title: 'Part de TamCar sur le volume', hint: 'Voitures : 25 % (20 % de commission + 5 % de gestion du véhicule, clé du plan d’affaires v6). Moto et tricycle : 60 % (le versement).', keys: ['share_moto', 'share_tricycle', 'share_essentiel', 'share_confort'] },
    { title: 'Versement quotidien (formule Cession)', hint: 'Part de TamCar à couvrir chaque jour, du lundi au samedi : somme (prix − part du chauffeur) des courses du jour. Au-delà, la part de TamCar continue de compter. À minuit, le manque est prélevé sur le portefeuille Revenus ; un jour non travaillé déclaré dans la fiche du chauffeur n’est pas prélevé. Démarrage : réglage floor_debit_from (2027-01-01).', keys: ['versement_moto', 'versement_tricycle', 'versement_essentiel', 'versement_confort'] },
    { title: 'Bonus', keys: ['surplus_cede_pct'] },
    { title: 'Priorité de proximité (qui voit la course, et quand)', hint: 'Une course s’ouvre par cercles autour du client : les chauffeurs du 1er cercle la voient tout de suite, les suivants après le délai indiqué (le délai part de la demande du client). Mettre « Priorité active » à 0 rétablit l’ancien fonctionnement : tous les chauffeurs à moins de 10 km, en même temps.', keys: ['prio_enabled', 'prio_r1_m', 'prio_r2_m', 'prio_d2_s', 'prio_r3_m', 'prio_d3_s', 'prio_r4_m', 'prio_d4_s'] },
    { title: 'Prime d’approche (chauffeur éloigné du client)', hint: 'Distance mesurée à l’acceptation, à vol d’oiseau. Plafond : part de TamCar sur la course. Versée à la fin de la course.', keys: ['approach_free_m', 'approach_rate_moto', 'approach_rate_tricycle', 'approach_rate_essentiel', 'approach_rate_confort', 'approach_rate_premium', 'approach_cap_pct', 'approach_max_fcfa'] },
    { title: 'Maintien en flotte (ABANDONNÉ : laisser à 0)', hint: 'Ancien prélèvement mensuel de 3 points du volume sur le fonds de rachat. Il est arrêté depuis la clé du plan v6 (chauffeur 40 %, propriétaire 30 %, fonds de rachat 5 %, TamCar 25 %) : TamCar finance les frais d’entrée (30 000 F par véhicule), les senteurs, les gadgets et les forfaits internet sur sa propre part. Ces réglages doivent rester à 0.', keys: ['upkeep_permille_essentiel', 'upkeep_permille_confort', 'upkeep_permille_premium', 'upkeep_permille_moto', 'upkeep_permille_tricycle'] },
    { title: 'Versements aux partenaires véhicule et AIB', hint: 'Le partenaire demande lui-même le versement de sa part disponible : un mois (réglable) après la première course de ses véhicules, puis du 1er au 5 de chaque mois (réglable ; 31 = toujours ouvert), pour les sommes acquises à la fin du mois écoulé, avec le numéro de sa facture normalisée. Il enregistre son compte de paiement, que l’équipe valide. Les frais de transaction sont à sa charge : Mobile Money en ‰ du montant net d’AIB (10 = 1 %, à caler sur le tarif FeexPay), virement bancaire en forfait. TamCar retient l’AIB sur chaque versement : 30 ‰ (3 %) si le partenaire a un identifiant fiscal unique, 50 ‰ (5 %) sinon, 0 si l’équipe constate une exonération (fiche du partenaire, motif obligatoire). Demandes et règlements : page « Partenaires véhicules ».', keys: ['dealer_payout_wait_months', 'dealer_payout_window_days', 'dealer_payout_min_fcfa', 'dealer_payout_fee_permille', 'dealer_payout_fee_bank_fcfa', 'aib_rate_ifu_permille', 'aib_rate_noifu_permille'] },
    { title: 'Forfaits internet des meilleurs chauffeurs', hint: 'Chaque semaine (lundi–samedi), un forfait internet est offert aux X % des chauffeurs éligibles qui ont le mieux travaillé, par ordre décroissant de performance (volume ÷ objectif de la catégorie). Éligible : objectif quotidien atteint au moins N jours sur 6, aucune annulation imputable, note suffisante. Minimum et maximum de bénéficiaires par semaine. Le coût d’un forfait, financé par TamCar sur sa part, sert au suivi du budget. Voir la page « Forfaits internet ». Démarrage : date data_bundle_from (1er juillet 2027).', keys: ['data_bundle_top_pct', 'data_bundle_min_winners', 'data_bundle_max_winners', 'data_bundle_min_days', 'data_bundle_min_rating', 'data_bundle_cost_fcfa'] },
    { title: 'Produits de senteur (ABANDONNÉ : laisser à 0)', hint: 'Ancien prélèvement mensuel sur le fonds de rachat. Les produits de senteur sont désormais financés par TamCar sur sa propre part : ces réglages doivent rester à 0.', keys: ['senteur_moto', 'senteur_tricycle', 'senteur_essentiel', 'senteur_confort', 'senteur_premium'] },
    { title: 'Annulation par le client', hint: 'Frais quand le chauffeur est arrivé ou à moins d’une minute du client ; gratuit sinon. Débités sur TamCar Crédit, moitié pour le chauffeur.', keys: ['cancel_fee_fcfa', 'cancel_fee_radius_m'] },
    { title: 'TamAssur : cotisation quotidienne par véhicule', hint: '1 000 F pour tous les véhicules (minimum imposé par NSIA). Entièrement payées par le chauffeur, sur son portefeuille Revenus (part du fonds de rachat = 0 %).', keys: ['tamassur_moto', 'tamassur_tricycle', 'tamassur_essentiel', 'tamassur_confort', 'tamassur_premium', 'tamassur_fund_pct'] },
    { title: 'TamAssur : épargne garantie par TamCar', hint: 'Montant garanti par année de cotisation complète : 250 000 F (moto 250 000 F à 12 mois, tricycle et voitures 500 000 F à 24 mois, puis 250 000 F de plus par année de contrat jusqu’au terme). Sur chaque cotisation de 1 000 F, la part épargnée est 250 000 ÷ 300 = 834 F ; le reste couvre les frais du contrat d’assurance-épargne et la garantie.', keys: ['tamassur_guarantee_year'] },
    { title: 'Décès ou invalidité : restitution des cotisations', hint: 'Part des cotisations réellement prélevées restituée : X % avant N mois de cotisation, Y % à partir de N mois (CGU : la moitié avant 12 mois, la totalité ensuite). Le calcul d’un dossier se fait dans Retraits TamAssur, onglet « Calculateur décès ou invalidité ».', keys: ['death_early_pct', 'death_threshold_months', 'death_late_pct'] },
    { title: 'Durée du contrat par catégorie', hint: 'Durée indicative d’un contrat de partenariat, de la mise en service du véhicule à son transfert au chauffeur : moto 12 mois, tricycle 24, Essentiel 36, Confort 48, VIP 60. Elle peut être ajustée véhicule par véhicule dans la fiche du véhicule (page Véhicules). Elle fixe la fin prévue du contrat du chauffeur et l’avis écrit envoyé 15 jours avant ; elle ne change pas la durée avant retrait TamAssur ci-dessous.', keys: ['contract_months_moto', 'contract_months_tricycle', 'contract_months_essentiel', 'contract_months_confort', 'contract_months_premium'] },
    { title: 'TamAssur : premier palier de retrait', hint: 'Premier palier de retrait de l’épargne garantie : moto 12 mois (= son contrat, 250 000 F) ; tricycle et voitures 24 mois (500 000 F), puis 250 000 F de plus à chaque année de contrat accomplie jusqu’au terme (36 mois : 750 000 F ; 48 : 1 000 000 F ; 60 : 1 250 000 F). Un véhicule dont la durée de contrat diffère de celle de sa catégorie ne se retire qu’au terme du contrat, au prorata (250 000 F × durée ÷ 12). Condition constante : aucune dette sur le portefeuille Revenus.', keys: ['tamassur_months_moto', 'tamassur_months_tricycle', 'tamassur_months_essentiel', 'tamassur_months_confort', 'tamassur_months_premium'] },
    { title: 'Réservations : pénalité d’annulation tardive', hint: 'Appliquée à moins de 10 minutes du départ : celui qui annule est débité de ce montant, reversé en entier à l’autre partie (client ou chauffeur). Gratuit avant. Un désistement relance toujours la recherche d’un chauffeur.', keys: ['booking_penalty_fcfa'] },
    { title: 'Gadgets des meilleurs (chauffeurs et clients, tous les 6 mois)', hint: 'Un tour par semestre civil : on classe les chauffeurs et les clients sur les courses terminées du tour (à égalité : la note, puis le volume). Éligible = minimum de courses, note minimale (en dixièmes d’étoile : 47 = 4,7 ; 0 = pas de condition) et pas plus d’annulations imputables que la tolérance. Le budget et la valeur des cadeaux servent à vérifier la dépense dans la page « Gadgets ».', keys: ['gadget_winners_drivers', 'gadget_winners_clients', 'gadget_driver_min_rides', 'gadget_driver_min_rating', 'gadget_client_min_rides', 'gadget_client_min_rating', 'gadget_max_late_cancels', 'gadget_value_driver_fcfa', 'gadget_value_client_fcfa', 'gadget_budget_fcfa'] },
    { title: 'Rendez-vous des candidats chauffeurs', hint: 'Nombre maximal de candidats acceptés sur un même créneau de 30 minutes (3 par défaut). Quand un créneau en compte autant, il n’est plus proposé ; une annulation libère une place.', keys: ['rdv_capacity_per_slot'] },
    { title: 'Paiements', hint: 'Paiement réel FeexPay à 1 : les recharges et règlements de dette passent par Mobile Money (à mettre à 1 une fois les clés FeexPay posées). Mode TEST à 1 : recharges et règlements simulés (gratuits) autorisés tant que le paiement réel n’est pas actif ; à mettre à 0 au lancement. Virements automatiques à 1 : seulement après un test validé ; à 0, les retraits chauffeur sont payés à la main depuis « Retraits chauffeur » (ou d’un clic par « Envoyer par FeexPay »). Un retrait automatique ne part seul que s’il ne dépasse pas le montant maximal, si le chauffeur n’a pas déjà reçu le plafond du jour et si le numéro a déjà reçu un retrait payé (validation du premier retrait vers un numéro : 1 = oui) ; sinon il attend votre validation.', keys: ['payments_provider', 'payments_test_mode', 'payouts_auto', 'payout_auto_max_fcfa', 'payout_auto_daily_cap_fcfa', 'payout_hold_new_number'] },
  ];

  return (
    <div>
      <div className="mb-lg flex flex-wrap items-baseline justify-between gap-md">
        <h1 className="text-2xl font-extrabold text-neutral-900">Bonus et cotisations chauffeur</h1>
        <p className="text-sm text-neutral-600">
          Démarrage : <strong>{s.start ? new Date(s.start).toLocaleDateString('fr-FR', { timeZone: 'Africa/Porto-Novo' }) : '—'}</strong>
        </p>
      </div>

      <p className="mb-lg rounded-md bg-neutral-100 p-md text-xs text-neutral-700">
        <strong>Bonus :</strong> chaque soir à 23 h 55 (du lundi au samedi), sur le volume des courses terminées{' '}
        <strong>dans l&apos;app</strong> au-dessus de l&apos;objectif du véhicule, TamCar reverse au chauffeur{' '}
        <strong>{r.surplus_cede_pct ?? 0} % de la part qu&apos;elle touche</strong> sur ce surplus. Au plancher, le bonus est
        nul ; TamCar garde toujours l&apos;autre moitié, donc ne perd jamais d&apos;argent sur le bonus.
      </p>

      <div className="mb-xl grid grid-cols-2 gap-md md:grid-cols-5">
        {[
          ['Versé ce mois', `${fmt(s.month_paid)} F`],
          ['Bonus ce mois', fmt(s.month_count)],
          ['Chauffeurs concernés', fmt(s.month_drivers)],
          ['Total versé', `${fmt(s.total_paid)} F`],
          ['Primes d’approche ce mois', `${fmt(s.approach_month_paid)} F (${fmt(s.approach_month_count)})`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-white p-md shadow-sm ring-1 ring-neutral-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
            <p className="mt-xs text-xl font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <h2 className="mb-sm text-sm font-bold uppercase tracking-wider text-neutral-500">Ce que chaque véhicule rapporte et coûte, par jour</h2>
      <div className="mb-xl overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="px-md py-sm">Véhicule</th>
              <th className="px-md py-sm text-right">Objectif</th>
              <th className="px-md py-sm text-right">TamCar touche à l’objectif</th>
              <th className="px-md py-sm text-right">Bonus par 1 000 F en plus</th>
              <th className="px-md py-sm text-right">À 150 % : bonus / TamCar garde</th>
              <th className="px-md py-sm text-right">À 200 % : bonus / TamCar garde</th>
              <th className="px-md py-sm text-right">Cotisation TamAssur (part de ce que TamCar touche)</th>
            </tr>
          </thead>
          <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
            {table.map((t) => (
              <tr key={t.cat} className="border-b border-neutral-100 last:border-0">
                <td className="px-md py-sm font-semibold text-neutral-900">{t.label}</td>
                <td className="px-md py-sm text-right">{fmt(t.floor)} F</td>
                <td className="px-md py-sm text-right">{fmt(t.take)} F</td>
                <td className="px-md py-sm text-right">{fmt(t.rate)} F</td>
                <td className="px-md py-sm text-right">
                  {fmt(t.e150.bonus)} F / <strong className="text-success">{fmt(t.e150.keeps)} F</strong>
                </td>
                <td className="px-md py-sm text-right">
                  {fmt(t.e200.bonus)} F / <strong className="text-success">{fmt(t.e200.keeps)} F</strong>
                </td>
                <td className="px-md py-sm text-right">
                  {fmt(t.cotis)} F <span className="text-neutral-500">({t.take > 0 ? Math.round((100 * t.cotis) / t.take) : 0} %)</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {groups.map((g) => (
        <section key={g.title} className="mb-xl">
          <h2 className="mb-xs text-sm font-bold uppercase tracking-wider text-neutral-500">{g.title}</h2>
          {g.hint && <p className="mb-sm text-xs text-neutral-500">{g.hint}</p>}
          <ul className="divide-y divide-neutral-200 rounded-xl bg-white shadow-sm">
            {g.keys
              .map((k) => rows.find((x) => x.key === k))
              .filter((x): x is RuleRow => !!x)
              .map((x) => (
                <li key={x.key} className="flex flex-wrap items-center justify-between gap-md px-lg py-sm">
                  <span className="min-w-0 flex-1 text-xs text-neutral-800">{x.label}</span>
                  <form action={setProgramRule} className="flex items-center gap-xs">
                    <input type="hidden" name="key" value={x.key} />
                    <input
                      type="number"
                      name="value"
                      min={0}
                      defaultValue={x.value}
                      className="w-28 rounded-md border border-neutral-200 bg-white px-md py-xs text-right text-sm"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    />
                    <ConfirmSubmit
                      message="Enregistrer ce réglage ? Il s’applique dès le prochain calcul du soir."
                      className="rounded-md bg-neutral-800 px-md py-xs text-xs font-bold text-white hover:bg-neutral-900"
                    >
                      OK
                    </ConfirmSubmit>
                  </form>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
