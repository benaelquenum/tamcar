import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';

// Fichier pour l'opérateur : une ligne par chauffeur bénéficiaire de la semaine (numéro au format international, nom, rang).
// Réservé aux administrateurs. Séparateur « ; » et BOM UTF-8 : s'ouvre correctement dans Excel en français.
export const dynamic = 'force-dynamic';

/** Numéro béninois au format 229 + 10 chiffres commençant par 01 (comme FeexPay et les opérateurs) ; vide si le numéro est inexploitable. */
function normalizePhone(input: string | null | undefined): string {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.startsWith('00229')) d = d.slice(5);
  else if (d.startsWith('229')) d = d.slice(3);
  if (d.length === 8) d = '01' + d;
  return d.length === 10 && d.startsWith('01') ? '229' + d : '';
}

function cell(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'admin') return new Response('Not found', { status: 404 });

  const week = new URL(req.url).searchParams.get('week') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return new Response('Semaine invalide', { status: 400 });

  const supabase = createServerSupabase();
  const [{ data, error }, { data: costRule }] = await Promise.all([
    supabase
      .from('data_bundle_awards')
      .select('rank, status, profile:profiles!profile_id(full_name, phone)')
      .eq('week_start', week)
      .neq('status', 'cancelled')
      .order('rank'),
    supabase.from('program_rules').select('value').eq('key', 'data_bundle_cost_fcfa').maybeSingle(),
  ]);
  if (error) return new Response('Erreur de lecture', { status: 500 });
  const cost = (costRule as { value?: number } | null)?.value ?? 1000;

  type Row = { rank: number; status: string; profile: { full_name: string | null; phone: string | null } | { full_name: string | null; phone: string | null }[] | null };
  const lines = ['Numéro;Nom;Rang;Forfait (F);Semaine du;Statut'];
  for (const r of (data ?? []) as unknown as Row[]) {
    const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
    lines.push([
      cell(normalizePhone(p?.phone) || `NUMÉRO À VÉRIFIER (${p?.phone ?? 'aucun'})`),
      cell(p?.full_name ?? ''),
      r.rank,
      cost,
      week,
      r.status === 'sent' ? 'activé' : 'à activer',
    ].join(';'));
  }
  const body = '﻿' + lines.join('\r\n') + '\r\n';
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="forfaits-internet-${week}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
