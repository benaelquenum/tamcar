import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentProfile } from '@/lib/session';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { buildMonth, XLSX_MIME } from '@/lib/driveSync';
import { monthKey } from '@/lib/months';

// Archive Excel d'un mois (un onglet par table), générée à la demande : même contenu que celle
// envoyée sur Drive. Équipe TamCar uniquement. Le mois en cours est possible (archive partielle).

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const month = req.nextUrl.searchParams.get('month') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > monthKey(new Date())) {
    return NextResponse.json({ error: 'mois invalide' }, { status: 400 });
  }

  try {
    const { buffer } = await buildMonth(createAdminSupabase(), month);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': `attachment; filename="TamCar-archive-${month}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erreur' }, { status: 500 });
  }
}
