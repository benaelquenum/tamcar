"""Fabrique plan-affaires.html puis plan-affaires.pdf à partir de source.html.

Ce que le script ajoute au texte rédigé à la main :
  1. la typographie française — espaces insécables avant « : ; ! ? » et
     à l'intérieur des « guillemets », espaces fines dans les nombres
     (« 15 000 000 »), insécables entre un nombre et son unité ;
  2. les icônes, référencées par {{ico:nom}} dans la source ;
  3. la numérotation « n sur N » des pages de contenu (la couverture est
     exclue, comme dans la plaquette Juvora) ;
  4. le rendu PDF par Chrome sans en-tête ni pied de page.

Usage :  python build.py                → HTML + PDF (version propre)
         python build.py --revision     → version de travail : ajouts et
                                          modifications balisés, notes de revue
         python build.py --html         → HTML seulement
"""
import pathlib
import re
import subprocess
import sys

ICI = pathlib.Path(__file__).parent
VERSION = "v6"          # fichiers livrés : TamCar_plan_affaires_<VERSION>*.html / .pdf ; les versions précédentes sont dans ../archives/
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

def svg(path: str) -> str:
    return (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
        f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{path}</svg>'
    )

ICONES = {
    "map-pin": svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
    "users": svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    "wallet": svg('<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>'),
    "shield": svg('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'),
    "flag": svg('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>'),
    "alert": svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
    "eye": svg('<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>'),
    "coins": svg('<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>'),
    "calendar": svg('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>'),
    "target": svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
    "landmark": svg('<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>'),
    "chart": svg('<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>'),
    "clipboard": svg('<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>'),
    "car": svg('<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>'),
    "route": svg('<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>'),
    "search": svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
    "clock": svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
    "briefcase": svg('<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>'),
    "check": svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
    "database": svg('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>'),
    "server": svg('<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>'),
    "smartphone": svg('<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>'),
    "lock": svg('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    "cloud": svg('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'),
    "code": svg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
    "bell": svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
    "map": svg('<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/>'),
    "credit-card": svg('<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>'),
    "layers": svg('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'),
    "zap": svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
    "git-branch": svg('<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>'),
    "message": svg('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'),
    "cpu": svg('<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>'),
}

NNBSP = "&#8239;"   # espace fine insécable : milliers et « % »
NBSP = "&nbsp;"


def typographie(texte: str) -> str:
    """Typographie française sur un fragment de TEXTE (jamais sur une balise)."""
    # Ponctuation double : espace insécable AVANT.
    texte = re.sub(r"\s+([;:!?»])", NBSP + r"\1", texte)
    # Guillemets français : insécable APRÈS l'ouvrant.
    texte = re.sub(r"«\s+", "«" + NBSP, texte)
    # Milliers : 15 000 000 → espaces fines insécables (lookahead : gère les chaînes).
    texte = re.sub(r"(?<=\d) (?=\d{3}(?!\d))", NNBSP, texte)
    # Pourcentage et unités collés au nombre qui les précède.
    texte = re.sub(r"(\d) %", r"\1" + NNBSP + "%", texte)
    texte = re.sub(r"(\d) (FCFA|F\b|M\b|km\b|j\b|ans?\b)", r"\1" + NBSP + r"\2", texte)
    # Numéros de sous-section : « 2.1 · Le projet » ne se coupe pas.
    texte = re.sub(r"(\d\.\d) ·", r"\1" + NBSP + "·", texte)
    return texte


def appliquer_typographie(html: str) -> str:
    morceaux = re.split(r"(<[^>]+>)", html)
    hors_style = True
    for i, m in enumerate(morceaux):
        if m.startswith("<"):
            tag = m.lower()
            if tag.startswith("<style") or tag.startswith("<script"):
                hors_style = False
            elif tag.startswith("</style") or tag.startswith("</script"):
                hors_style = True
            continue
        if hors_style and m.strip():
            morceaux[i] = typographie(m)
    return "".join(morceaux)


def cesure(html: str) -> str:
    """Césure française (traits d'union conditionnels) dans les paragraphes, listes et encadrés : le texte
    justifié ne se troue plus dans les colonnes étroites. Les titres, tableaux et schémas ne sont pas touchés."""
    try:
        import pyphen
    except ImportError:
        return html
    dic = pyphen.Pyphen(lang="fr", left=3, right=3)
    mots = re.compile(r"[a-zàâäçéèêëîïôöùûüœ]{7,}")
    morceaux = re.split(r"(<[^>]+>)", html)
    texte = 0                  # profondeur de contexte « texte courant » (p, li, encadré)
    exclu = 0                  # style, script, svg
    divs: list = []            # pour chaque <div> ouvert : est-ce un encadré de texte ?
    for i, m in enumerate(morceaux):
        if m.startswith("<"):
            t = m.lower()
            if re.match(r"<(p|li)\b", t):
                texte += 1
            elif re.match(r"</(p|li)\b", t):
                texte = max(0, texte - 1)
            elif t.startswith("<div"):
                est = bool(re.search(r'class="[^"]*\b(callout|lecture|intro)\b', t))
                divs.append(est)
                texte += 1 if est else 0
            elif t.startswith("</div"):
                if divs and divs.pop():
                    texte = max(0, texte - 1)
            elif re.match(r"<(style|script|svg)\b", t):
                exclu += 1
            elif re.match(r"</(style|script|svg)\b", t):
                exclu = max(0, exclu - 1)
            continue
        if texte and not exclu and m.strip():
            morceaux[i] = mots.sub(lambda w: dic.inserted(w.group(0), "­"), m)
    return "".join(morceaux)


GENERATEURS = ["gen_partie2b.py", "gen_partie6.py", "gen_partie7.py", "gen_partie8.py", "gen_partie9.py", "gen_partie10.py", "gen_partie11.py"]   # pages numériques : recalculées depuis le modèle à chaque build


def construire_sommaire(html: str) -> tuple[str, int]:
    """Sommaire généré à partir des titres réels : parties (sec-head) et sections « N.M · titre ».
    Renvoie le HTML des pages du sommaire et leur nombre ; les numéros de page tiennent compte de ces pages."""
    import html as H
    sections = re.findall(r'<section class="page[^"]*"[^>]*>.*?</section>', html, re.S)[1:]   # sans la couverture
    parties, subs = [], {}
    for i, s in enumerate(sections, 1):
        m = re.search(r'<div class="sec-head"><span class="num">(\d+)</span><h1>(.*?)</h1>', s, re.S)
        if m and "(suite)" not in m.group(2):
            parties.append([m.group(1), re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", "", m.group(2)))).strip(), i, []])
        for mm_ in re.finditer(r'class="[^"]*\b(?:h-serif|pill)\b[^"]*"[^>]*>(.*?)</', s, re.S):
            txt = re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", "", mm_.group(1)))).strip()
            k = re.match(r"^(\d{1,2})\.(\d{1,2})\s*·\s*(.+?)(?:\s*\(suite\))?$", txt)
            if k:
                subs.setdefault((int(k.group(1)), int(k.group(2))), (k.group(3), i))
    for p in parties:
        p[3] = [(f"{int(p[0])}.{mn}", tit, pg) for (mj, mn), (tit, pg) in sorted(subs.items()) if mj == int(p[0])]
    # pagination du sommaire : ~48 lignes par page, on ne coupe pas une partie
    lignes = lambda p: 1 + len(p[3])
    pages_toc, cur, n = [], [], 0
    for p in parties:
        if cur and n + lignes(p) > 52:
            pages_toc.append(cur); cur, n = [], 0
        cur.append(p); n += lignes(p)
    pages_toc.append(cur)
    T = len(pages_toc)
    out = ""
    for idx, groupe in enumerate(pages_toc):
        corps = ""
        for num, titre, pg, sub in groupe:
            corps += (f'<a class="toc-part" href="#p{pg + T}"><span class="n">{num}</span><span class="t">{titre}</span>'
                      f'<span class="dots"></span><span class="p">{pg + T}</span></a>')
            for ref, tit, pgs in sub:
                corps += (f'<a class="toc-sub" href="#p{pgs + T}"><span class="n">{ref}</span><span class="t">{tit}</span>'
                          f'<span class="dots"></span><span class="p">{pgs + T}</span></a>')
        suite = ' <small>(suite)</small>' if idx else ''
        out += ('<section class="page" data-filigrane="TamCar">\n'
                f'  <div class="sec-head"><h1>Sommaire{suite}</h1></div>\n'
                f'  <div class="toc">{corps}</div>\n'
                '  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>\n</section>\n')
    return out, T


def ajouter_ancres(html: str) -> str:
    """Un identifiant p<N> sur chaque page numérotée, pour que le sommaire soit cliquable dans le PDF."""
    compteur = {"n": 0, "couverture": True}
    def rempl(m: re.Match) -> str:
        if 'cover' in m.group(0):
            return m.group(0)
        compteur["n"] += 1
        return m.group(0).replace("<section class=\"page\"", f'<section id="p{compteur["n"]}" class="page"', 1)
    return re.sub(r'<section class="page[^"]*"[^>]*>', rempl, html)


def version_autonome(html: str, nom: str) -> pathlib.Path:
    """HTML en un seul fichier : feuille de style intégrée, images en base64, mise en page « écran »
    (pages centrées sur fond gris, réduites automatiquement sur les petits écrans). L'impression reste en A4."""
    import base64
    css = (ICI / "plan.css").read_text(encoding="utf-8")
    ecran = """
@media screen {
  html { scroll-behavior: smooth; }
  body { background: #E6EAF4; padding: 20px 0 8px; }
  .page { margin: 0 auto 22px; box-shadow: 0 6px 28px rgba(11, 33, 71, .16); }
}
@media print { body { zoom: 1 !important; } }
"""
    html = html.replace('<link rel="stylesheet" href="plan.css">', "<style>\n" + css + ecran + "</style>", 1)
    html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">', 1)

    def image(m: re.Match) -> str:
        donnees = (ICI / m.group(1)).read_bytes()
        mime = "image/jpeg" if m.group(1).lower().endswith((".jpg", ".jpeg")) else "image/png"
        return 'src="data:' + mime + ';base64,' + base64.b64encode(donnees).decode("ascii") + '"'
    html = re.sub(r'src="(assets/[\w.\-]+\.(?:png|jpe?g))"', image, html)
    script = ("<script>(function(){function fit(){var w=document.documentElement.clientWidth,p=818;"
              "document.body.style.zoom=w<p?(w/p):1;}fit();window.addEventListener('resize',fit);})();</script>")
    html = html.replace("</body>", script + "\n</body>", 1)
    sortie = ICI / nom
    sortie.write_text(html, encoding="utf-8")
    return sortie


def main() -> None:
    for gen in GENERATEURS:
        if (ICI / gen).exists():
            r = subprocess.run([sys.executable, str(ICI / gen)], capture_output=True, text=True, encoding="utf-8", cwd=str(ICI))
            if r.returncode != 0:
                raise SystemExit(f"Échec du générateur {gen} :\n{r.stderr}")
    sys.path.insert(0, str(ICI))
    import gras
    for fichier, phrases in gras.LISTES_GEN.items():       # gras sur les parties générées
        gras.appliquer(fichier, phrases)
    revision = "--revision" in sys.argv
    html = (ICI / "source.html").read_text(encoding="utf-8")

    # 0. inclusions : <!--@include partie3.html-->
    html = re.sub(
        r"<!--@include ([\w.\-]+)-->",
        lambda m: (ICI / m.group(1)).read_text(encoding="utf-8"),
        html,
    )
    if revision:
        html = html.replace("<body>", '<body class="revision">', 1)
    else:
        # version définitive : les notes de révision et la légende de couverture sont retirées du fichier, pas seulement masquées
        html = re.sub(r'\s*<div class="rnote">.*?</div>', "", html, flags=re.S)
        html = re.sub(r'\s*<div class="legende revision-only">.*?</div>', "", html, flags=re.S)

    # 0b. graphiques générés par le modèle de trésorerie
    if "{{chart:tresorerie" in html:
        sys.path.insert(0, str(ICI))
        import modele_v6
        html = html.replace("{{chart:tresorerie}}", modele_v6.svg_tresorerie_plan())
        html = html.replace("{{chart:tresorerie_sans_tiers}}", modele_v6.svg_tresorerie_sans_tiers())

    # 0c. sommaire : généré après l'assemblage, avant la numérotation
    if "<!--@toc-->" in html:
        toc, _ = construire_sommaire(html)
        html = html.replace("<!--@toc-->", toc, 1)
        html = ajouter_ancres(html)

    # 1. icônes
    def remplacer_icone(m: re.Match) -> str:
        nom = m.group(1)
        if nom not in ICONES:
            raise SystemExit(f"Icône inconnue : {nom}")
        return ICONES[nom]
    html = re.sub(r"\{\{ico:([\w-]+)\}\}", remplacer_icone, html)

    # 2. typographie
    html = appliquer_typographie(html)
    html = cesure(html)

    # 3. numérotation : la couverture ne compte pas
    total = html.count("<!--PN-->")
    for n in range(1, total + 1):
        html = html.replace("<!--PN-->", str(n), 1)
    html = html.replace("<!--TOTAL-->", str(total))

    suffixe = "-revision" if revision else ""
    sortie_html = ICI / f"plan-affaires{suffixe}.html"
    sortie_html.write_text(html, encoding="utf-8")
    print(f"HTML : {sortie_html.name} ({total} pages de contenu + couverture)")
    autonome = version_autonome(html, f"TamCar_plan_affaires_{VERSION}{suffixe.replace('-', '_')}.html")
    print(f"HTML autonome : {autonome.name} ({autonome.stat().st_size // 1024} Ko)")

    if "--html" in sys.argv:
        return

    # 4. PDF par Chrome
    sortie_pdf = ICI / f"plan-affaires{suffixe}.pdf"
    cmd = [
        CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
        f"--print-to-pdf={sortie_pdf}", sortie_html.as_uri(),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if not sortie_pdf.exists():
        raise SystemExit("Échec du rendu PDF :\n" + (r.stderr or r.stdout))
    print(f"PDF  : {sortie_pdf.name} ({sortie_pdf.stat().st_size // 1024} Ko)")
    import shutil
    definitif = ICI / f"TamCar_plan_affaires_{VERSION}{suffixe.replace('-', '_')}.pdf"
    shutil.copyfile(sortie_pdf, definitif)
    print(f"PDF livré : {definitif.name}")


if __name__ == "__main__":
    main()
