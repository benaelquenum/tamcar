import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runDriveSync } from '@/lib/driveSync';

// Appelée chaque nuit à 05h20 (heure du Bénin) par pg_cron (fonction _run_drive_sync), avec la clé de
// service en « Bearer ». Envoie sur Drive les archives mensuelles manquantes et les fichiers non copiés.
// Sans Drive configuré (variables Vercel), répond « non configuré » et ne fait rien.

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
    const result = await runDriveSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'erreur' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
