import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const form = await request.formData();
  const raw = form.get('code');
  if (typeof raw !== 'string' || raw.trim().length < 6) {
    return NextResponse.redirect(new URL('/parrainer?err=invalid', request.url), 303);
  }
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('redeem_referral_code', { p_code: raw.trim() });
  if (error) {
    const enc = encodeURIComponent(error.message);
    return NextResponse.redirect(new URL(`/parrainer?err=${enc}`, request.url), 303);
  }
  return NextResponse.redirect(new URL('/parrainer?ok=1', request.url), 303);
}
