import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runBackup } from '@/lib/backup';

// Appelée chaque jour à 05h00 (heure du Bénin) par pg_cron (fonction _run_daily_backup),
// avec la clé de service en « Bearer ». Aucun autre appelant n'est accepté.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!key || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const result = await runBackup('cron');
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'erreur' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
