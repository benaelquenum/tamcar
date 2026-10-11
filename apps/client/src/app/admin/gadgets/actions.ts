'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

type State = { error?: string; ok?: string } | null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Valide le classement d'un tour : les gagnants sont enregistrés (une seule fois) et prévenus par notification. */
export async function validateGadgetRound(_prev: State, formData: FormData): Promise<State> {
  const kind = String(formData.get('kind') || '');
  const from = String(formData.get('from') || '');
  const to = String(formData.get('to') || '');
  if (!['driver', 'client'].includes(kind) || !DATE_RE.test(from) || !DATE_RE.test(to)) return { error: 'Tour invalide.' };
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('admin_gadget_validate', { p_kind: kind, p_from: from, p_to: to });
  if (error) return { error: error.message };
  revalidatePath('/admin/gadgets');
  const n = Number(data ?? 0);
  return {
    ok:
      n > 0
        ? `${n} gagnant${n > 1 ? 's' : ''} enregistré${n > 1 ? 's' : ''} et prévenu${n > 1 ? 's' : ''}.`
        : 'Aucun nouveau gagnant : le classement de ce tour était déjà validé, ou personne n’est éligible.',
  };
}

/** Suivi de la remise d'un cadeau : cadeau choisi, statut (attribué / remis / refusé), note. */
export async function updateGadgetAward(_prev: State, formData: FormData): Promise<State> {
  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || '');
  const gadget = String(formData.get('gadget') || '');
  const note = String(formData.get('note') || '');
  if (!id) return { error: 'Cadeau introuvable.' };
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_gadget_update', {
    p_id: id,
    p_status: status,
    p_gadget: gadget || null,
    p_note: note || null,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/gadgets');
  return { ok: 'Enregistré.' };
}
