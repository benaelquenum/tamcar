import { getCurrentProfile } from '@/lib/session';
import { GUIDE_PDF_BASE64 } from '../guidePdf';

// Le PDF est servi par cette route et non depuis /public : il décrit le fonctionnement interne du back-office, il est donc
// réservé aux administrateurs connectés. Fichier généré par scripts/build-admin-guide.mjs.
export const dynamic = 'force-dynamic';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'admin') {
    // Même discrétion que le reste du back-office : on ne dévoile pas son existence.
    return new Response('Not found', { status: 404 });
  }
  const bytes = Buffer.from(GUIDE_PDF_BASE64, 'base64');
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="Guide-back-office-TamCar.pdf"',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
    },
  });
}
