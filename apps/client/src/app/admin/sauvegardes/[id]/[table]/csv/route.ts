import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/session';
import { loadRun, loadTableRows, toCsv, MAX_EXPLORE_BYTES } from '@/lib/backupRead';

// Export CSV d'une table d'une sauvegarde de secours. Équipe TamCar uniquement.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: { id: string; table: string } }) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const run = await loadRun(params.id);
  const meta = run?.tables.find((t) => t.name === params.table);
  if (!run || !meta) return NextResponse.json({ error: 'introuvable' }, { status: 404 });
  if (meta.bytes > MAX_EXPLORE_BYTES) return NextResponse.json({ error: 'table trop volumineuse' }, { status: 413 });

  const rows = await loadTableRows(run, params.table);
  if (!rows) return NextResponse.json({ error: 'fichier introuvable' }, { status: 404 });

  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${params.table}-${run.folder}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
