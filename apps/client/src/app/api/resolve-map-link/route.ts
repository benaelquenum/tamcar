import { NextResponse } from 'next/server';
import {
  RESOLVABLE_HOSTS,
  parseMapHtml,
  parseMapLink,
  type MapLinkResult,
} from '@/lib/map-links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Déroule un lien de carte raccourci (maps.app.goo.gl…) et en extrait la
 * destination. Le navigateur ne peut pas le faire lui-même : ces domaines
 * n'autorisent pas les requêtes croisées.
 *
 * Sécurité : seuls les hôtes de cartographie connus sont appelés (liste
 * RESOLVABLE_HOSTS), en HTTPS uniquement. Sans ce filtre, la route
 * deviendrait un relais permettant de faire émettre des requêtes
 * arbitraires par le serveur.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('u');
  if (!raw) {
    return NextResponse.json({ error: 'Paramètre u manquant' }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: 'Lien invalide' }, { status: 400 });
  }

  if (target.protocol !== 'https:') {
    return NextResponse.json({ error: 'HTTPS requis' }, { status: 400 });
  }

  const host = target.hostname.toLowerCase().replace(/^www\./, '');
  const allowed = RESOLVABLE_HOSTS.some((h) => {
    const clean = h.replace(/^www\./, '');
    return host === clean || host.endsWith('.' + clean);
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Domaine non pris en charge' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(target.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Un agent « navigateur mobile » : Google renvoie sinon une page
        // de consentement dépourvue de coordonnées.
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
    });

    // 1. L'URL finale porte le plus souvent les coordonnées.
    let result: MapLinkResult = parseMapLink(res.url);

    // 2. Sinon, on cherche dans le corps de la page.
    if (result.kind !== 'coords') {
      const html = (await res.text()).slice(0, 400_000);
      const fromHtml = parseMapHtml(html);
      if (fromHtml.kind === 'coords') {
        result = fromHtml;
      } else if (result.kind === 'none') {
        const title = html.match(/<title>([^<]{3,120})<\/title>/i);
        if (title) {
          result = {
            kind: 'query',
            query: title[1].replace(/\s*[-–|]\s*Google\s*Maps.*$/i, '').trim(),
          };
        }
      }
    }

    return NextResponse.json({ resolved: res.url, result });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json(
      { error: aborted ? 'Délai dépassé' : 'Lien impossible à ouvrir' },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
