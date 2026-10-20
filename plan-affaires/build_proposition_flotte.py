"""Proposition de flotte à Afric Group Consulting : deux pages A4 aérées, avec le logo TamCar, signée Térence Quenum.

Usage :  python build_proposition_flotte.py
Sortie : ../TamCar_proposition_flotte_AfricGroup.html et .pdf (à la racine du dépôt)

Tous les chiffres viennent du modèle ci-dessous (aux planchers de recettes, 26 jours par mois) :
  - part course du propriétaire : 30 % du volume, versée chaque mois ;
  - fonds de rachat : 5 % du volume, versé à la cession du véhicule au chauffeur, sans aucun prélèvement ;
  - frais d'entrée de 30 000 F, senteurs, gadgets et forfaits internet : financés par TamCar sur sa propre part ; plus aucune avance de
    démarrage demandée (clé du plan d'affaires v6, 19/10/2026 ; la version du 11/10/2026 est archivée) ;
  - les charges du propriétaire (assurance, entretien, visite technique…) ne sont PAS modélisées : elles
    lui appartiennent ; le « coût de revient » conseillé les englobe avec le prix d'achat.
  - VIP : mêmes prévisions de recettes que le Confort (15 000 F par jour), durée de 5 ans.
"""
import base64
import io
import pathlib
import re
import subprocess

ICI = pathlib.Path(__file__).parent
RACINE = ICI.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

# ----- À ajuster ici -----------------------------------------------------------------------------
SOCIETE = "Afric Group Consulting"
DESTINATAIRE = "M. Ouedraogo"
DATE = "19 octobre 2026"
SIGNATAIRE = "Térence Quenum"
EMAIL = "terencebeniraphael@gmail.com"   # pas encore d'adresse TamCar

JOURS_AN = 312            # 26 jours actifs par mois
PART_COURSE = 0.30
RACHAT = 0.05             # fonds de rachat : 5 % du volume, versé à la cession, sans prélèvement
FRAIS_ENTREE = 30_000     # inspection 10 000 + habillage 10 000 + kit chauffeur 10 000, avancés par TamCar

# nom, nombre, plancher de recettes/jour, durée (ans), coût de revient conseillé (achat + charges du propriétaire)
CATS = [
    dict(nom="Essentiel", n=6, plancher=12_000, ans=3, budget=3_400_000),
    dict(nom="Confort", n=3, plancher=15_000, ans=4, budget=5_700_000),
    dict(nom="VIP", n=1, plancher=15_000, ans=5, budget=7_200_000),
]


# Exemples de véhicules retenus par catégorie : (fichier, légende)
MODELES = {
    "Essentiel": [("yaris", "Toyota Yaris 2008"), ("picanto", "Kia Picanto 2009"), ("swift", "Suzuki Swift"), ("elantra", "Hyundai Elantra 1.8")],
    "Confort": [("corolla", "Toyota Corolla 2015"), ("k3", "Kia K3 / Cerato 2014"), ("venza", "Toyota Venza 2010 / 2011")],
    "VIP": [("starlet", "Toyota Starlet 2021"), ("accent", "Hyundai Accent 2021")],
}
# Photos : toutes fournies détourées par TamCar (Yaris, Picanto, Elantra, Swift, Venza, Starlet, Corolla 2015, Kia K3), sauf l'Accent (Wikimedia Commons, crédit ci-dessous)
CREDITS_PHOTOS = ("Photo Accent (Hyundai Solaris) © Milhouse35 (CC BY-SA 4.0), Wikimedia Commons, détourée par TamCar.")


SURFACE_MM2 = 1000      # surface d'image identique pour toutes les voitures : poids visuel homogène (une citadine haute
LARGEUR_MAX_MM = 42     # n'a pas l'air plus petite qu'une berline longue)


def dimensions_mm(png_bytes):
    from PIL import Image
    w, h = Image.open(io.BytesIO(png_bytes)).size
    ratio = w / h
    largeur = min((SURFACE_MM2 * ratio) ** 0.5, LARGEUR_MAX_MM)
    return largeur, largeur / ratio


def voitures(cat):
    out = []
    for fichier, legende in MODELES[cat]:
        raw = (ICI / "assets" / "voitures" / f"{fichier}.png").read_bytes()
        lw, lh = dimensions_mm(raw)
        b64 = base64.b64encode(raw).decode()
        out.append(f'<figure><img src="data:image/png;base64,{b64}" style="width:{lw:.1f}mm;height:{lh:.1f}mm" alt="{legende}"><figcaption>{legende}</figcaption></figure>')
    return '<div class="voit">' + "".join(out) + "</div>"


def calc(c, facteur=1.0):
    vol_an = c["plancher"] * JOURS_AN * facteur
    cash = PART_COURSE * vol_an * c["ans"]
    rachat_net = RACHAT * vol_an * c["ans"]
    total = cash + rachat_net
    marge = total - c["budget"]
    return dict(cash_mois=PART_COURSE * c["plancher"] * facteur * 26, cash=cash, rachat_net=rachat_net, total=total,
                marge=marge, roi=marge / c["budget"], roi_an=marge / c["budget"] / c["ans"])


NBSP = "\u00a0"


def f(v):
    return f"{round(v):,}".replace(",", NBSP)


def m(v, signe=False):
    """Montant en millions : « 4,12 M »."""
    s = f"{v / 1_000_000:.2f}".replace(".", ",")
    return (("+" if signe and v >= 0 else "") + s + NBSP + "M")


def pct(v, signe=True):
    return (("+" if signe and v >= 0 else "") + f"{round(v * 100)}" + NBSP + "%")


def arrondi_k(v):
    """Arrondi aux 1 000 F (lisibilité)."""
    return round(v / 1000) * 1000


E, C, V = CATS
rE, rC, rV = calc(E), calc(C), calc(V)
rE25, rC25, rV25 = calc(E, 1.25), calc(C, 1.25), calc(V, 1.25)

cout_total = sum(c["n"] * c["budget"] for c in CATS)
marge_total = E["n"] * rE["marge"] + C["n"] * rC["marge"] + V["n"] * rV["marge"]
marge_total25 = E["n"] * rE25["marge"] + C["n"] * rC25["marge"] + V["n"] * rV25["marge"]

logo = base64.b64encode((ICI / "assets" / "logo-couleur.png").read_bytes()).decode()


def ligne_marge(r):
    return f"<b>{m(r['marge'], True)}</b><br><span>{pct(r['roi'])} · {pct(r['roi_an'], False)}/an</span>"


html = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>TamCar — Proposition de flotte — {SOCIETE}</title>
<style>
  @page {{ size: A4; margin: 0; }}
  :root {{ --bleu:#2563EB; --bleu7:#1D4ED8; --bleu9:#1E3A8A; --bleu50:#EFF6FF; --bleu100:#DBEAFE;
          --encre:#0F172A; --gris:#475569; --gris4:#94A3B8; --trait:#E2E8F0; --fond:#F8FAFC; --or:#EAB308; --cyan:#06B6D4; }}
  * {{ box-sizing:border-box; margin:0; padding:0; }}
  html, body {{ background:#fff; }}
  body {{ font-family:'Sora','Segoe UI',Arial,sans-serif; color:var(--encre); font-size:9.2pt; line-height:1.5;
         -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
  .page {{ width:210mm; height:297mm; padding:13mm 15mm 10mm; position:relative; overflow:hidden; break-after:page; page-break-after:always; }}
  .page:last-child {{ break-after:auto; page-break-after:auto; }}
  .pied {{ position:absolute; left:15mm; right:15mm; bottom:7mm; display:flex; justify-content:space-between; font-size:6.8pt; color:var(--gris4); }}
  .bande {{ position:absolute; left:0; top:0; right:0; height:3mm; background:linear-gradient(90deg,var(--bleu7),var(--bleu) 62%,var(--cyan)); }}

  header {{ display:flex; align-items:center; justify-content:space-between; gap:8mm; margin-top:1mm; }}
  header img {{ height:19mm; display:block; }}
  header.suite img {{ height:12mm; }}
  .titre {{ text-align:right; }}
  .kicker {{ font-size:7.6pt; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--bleu); }}
  h1 {{ font-size:17.5pt; font-weight:800; line-height:1.15; color:var(--bleu9); margin-top:.8mm; }}
  .dest {{ margin-top:1.6mm; font-size:8.2pt; color:var(--gris); }}
  .dest strong {{ color:var(--encre); font-weight:700; }}

  .intro {{ margin-top:5mm; font-size:9.4pt; line-height:1.6; }}
  .intro strong {{ color:var(--bleu9); }}

  h2 {{ display:flex; align-items:baseline; gap:2.4mm; font-size:11.5pt; font-weight:700; color:var(--bleu9); margin:8mm 0 3mm; }}
  h2 .num {{ display:inline-grid; place-items:center; width:5.4mm; height:5.4mm; border-radius:50%; background:var(--bleu); color:#fff; font-size:8pt; font-weight:700; align-self:center; }}
  h2 .sous {{ color:var(--gris); font-weight:500; font-size:8pt; }}

  table {{ width:100%; border-collapse:collapse; }}
  th, td {{ padding:2.2mm 2.4mm; text-align:left; vertical-align:middle; border-bottom:.2mm solid var(--trait); }}
  thead th {{ background:var(--bleu9); color:#fff; font-size:8pt; font-weight:700; letter-spacing:.03em; border-bottom:none; }}
  thead th:first-child {{ border-radius:1.4mm 0 0 0; }} thead th:last-child {{ border-radius:0 1.4mm 0 0; }}
  td.n, th.n {{ text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }}
  td.c, th.c {{ text-align:center; }}
  .cat {{ padding:3.2mm 0 2.6mm; border-bottom:.2mm solid var(--trait); }}
  .cat:first-of-type {{ border-top:.2mm solid var(--trait); }}
  .cat-tete {{ display:flex; align-items:baseline; gap:5mm; }}
  .cat-nom {{ font-size:12pt; font-weight:800; color:#fff; background:var(--bleu9); border-radius:1.4mm; padding:.8mm 3.4mm; }}
  .cat-nb, .cat-duree {{ font-size:9.2pt; color:var(--gris); }}
  .cat-nb b {{ font-size:13pt; color:var(--bleu); font-weight:800; }}
  .cat-duree b {{ color:var(--encre); }}
  .cat-profil {{ margin-top:1.6mm; font-size:9pt; color:var(--encre); }}
        .voit {{ display:flex; justify-content:flex-start; align-items:flex-end; gap:2mm; margin-top:2.4mm; }}
  .voit figure {{ flex:1 1 0; min-width:0; text-align:center; }}
  .voit img {{ display:block; margin:0 auto; max-width:none; filter:drop-shadow(0 .6mm .9mm rgba(15,23,42,.28)); }}
  .voit figcaption {{ margin-top:1.4mm; font-size:7.8pt; line-height:1.15; color:var(--gris); }}
  .commun {{ margin-top:4mm; font-size:8.6pt; color:var(--gris); }}

  .gain {{ table-layout:fixed; }}
  .gain col.l {{ width:40%; }} .gain col.e {{ width:20%; }}
  .gain tbody th {{ font-weight:500; color:var(--encre); background:#fff; font-size:9pt; }}
  .gain tbody th small {{ color:var(--gris); font-size:7.8pt; font-weight:400; }}
  .gain tbody td.n {{ font-weight:600; font-size:9.4pt; }}
  .gain td.n.s {{ font-size:10pt; line-height:1.3; }}
  .gain td.n.s span {{ font-size:7.8pt; font-weight:500; color:var(--gris); }}
  .gain tr.total th, .gain tr.total td {{ background:var(--fond); font-weight:700; }}
  .gain tr.cle th, .gain tr.cle td {{ background:var(--bleu); color:#fff; font-weight:800; border-bottom:none; }}
  .gain tr.cle th small {{ color:var(--bleu100); }}
  .gain tr.cle td.n {{ font-size:11pt; }}
  .gain tr.marge th, .gain tr.marge td {{ background:var(--bleu50); }}
  .note {{ margin-top:3.4mm; font-size:8pt; color:var(--gris); line-height:1.5; }}

  .flotte {{ margin-top:6mm; display:grid; grid-template-columns:repeat(3,1fr); gap:3mm; }}
  .carte {{ border:.25mm solid var(--bleu100); background:var(--bleu50); border-radius:2mm; padding:2.4mm 3mm; }}
  .carte .k {{ font-size:7.2pt; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--gris); }}
  .carte .v {{ font-size:13pt; font-weight:800; color:var(--bleu9); font-variant-numeric:tabular-nums; }}
  .carte .s {{ font-size:7.6pt; color:var(--gris); }}

  .deux {{ display:grid; grid-template-columns:1fr; gap:4mm; margin-top:6mm; }}
  .bloc {{ border-left:.9mm solid var(--bleu); background:var(--fond); padding:3mm 4mm; border-radius:0 1.6mm 1.6mm 0; font-size:8.8pt; line-height:1.55; }}
  .bloc.or {{ border-left-color:var(--or); }}
  .bloc b {{ color:var(--bleu9); }}

  footer {{ position:absolute; left:15mm; right:15mm; bottom:14mm; }}
  .sign {{ display:flex; align-items:flex-end; justify-content:space-between; gap:8mm; }}
  .sign .qui {{ min-width:68mm; }}
  .sign .trait {{ height:12mm; border-bottom:.25mm solid var(--gris4); width:62mm; }}
  .sign .nom {{ font-weight:800; font-size:10.6pt; color:var(--bleu9); margin-top:1mm; }}
  .sign .role {{ font-size:8.2pt; color:var(--gris); }}
  .sign .fait {{ font-size:8.2pt; color:var(--gris); text-align:right; }}
  .legal {{ margin-top:4mm; padding-top:2mm; border-top:.2mm solid var(--trait); font-size:6.6pt; color:var(--gris4); line-height:1.35; }}
</style>
</head>
<body>
<div class="page">
  <div class="bande"></div>

  <header>
    <img src="data:image/png;base64,{logo}" alt="TamCar">
    <div class="titre">
      <div class="kicker">Proposition de flotte · Confidentiel</div>
      <h1>10 véhicules pour TamCar,<br>et ce qu’ils vous rapportent</h1>
      <div class="dest">À l’attention de <strong>{DESTINATAIRE}</strong> · <strong>{SOCIETE}</strong> · Cotonou, le {DATE}</div>
    </div>
  </header>

  <p class="intro">
    Voici la flotte que nous souhaitons voir mise à disposition de TamCar, et ce qu’elle vous rapporte. Chaque véhicule roule avec un
    <strong>chauffeur vérifié</strong> ; vous en restez <strong>propriétaire</strong> (réserve de propriété) jusqu’à sa cession au chauffeur au terme du contrat.
    TamCar gère les courses, les paiements et le suivi ; vous voyez vos gains en temps réel dans votre espace partenaire.
  </p>

  <h2><span class="num">1</span>Les véhicules souhaités</h2>
  <div class="cat">
    <div class="cat-tete"><span class="cat-nom">Essentiel</span><span class="cat-nb"><b>6</b> véhicules</span><span class="cat-duree">contrat de <b>3 ans</b></span></div>
    <p class="cat-profil">Citadine ou compacte essence, 4 à 5 places, climatisée, en bon état, moins de 120 000 km.</p>
    {voitures("Essentiel")}
  </div>
  <div class="cat">
    <div class="cat-tete"><span class="cat-nom">Confort</span><span class="cat-nb"><b>3</b> véhicules</span><span class="cat-duree">contrat de <b>4 ans</b></span></div>
    <p class="cat-profil">Berline compacte ou crossover spacieux, climatisé, entretien impeccable.</p>
    {voitures("Confort")}
  </div>
  <div class="cat">
    <div class="cat-tete"><span class="cat-nom">VIP</span><span class="cat-nb"><b>1</b> véhicule</span><span class="cat-duree">contrat de <b>5 ans</b></span></div>
    <p class="cat-profil">Véhicule récent et soigné.</p>
    {voitures("VIP")}
  </div>
  <p class="commun"><strong>Pour tous :</strong> essence (ni diesel à filtre à particules, ni hybride rechargeable, ni électrique), boîte classique (pas de DSG),
    deux roues motrices, pneus standards, papiers en règle, inspection d’entrée par TamCar avant la mise en service.</p>

  <div class="deux">
    <div class="bloc"><b>Votre garantie.</b> Vous restez propriétaire légal jusqu’à la cession. Le chauffeur s’engage sur un minimum de recettes :
      s’il ne le tient pas durablement, TamCar le remplace ou vous rend le véhicule.</div>
  </div>

  <div class="pied"><span>TamCar · Proposition de flotte · {SOCIETE} · Document confidentiel</span><span>Page 1 sur 2</span></div>
</div>

<div class="page">
  <div class="bande"></div>

  <header class="suite">
    <img src="data:image/png;base64,{logo}" alt="TamCar">
    <div class="titre">
      <div class="kicker">Proposition de flotte · suite · Confidentiel</div>
      <div class="dest">{SOCIETE} · {DATE}</div>
    </div>
  </header>

  <h2><span class="num">2</span>Ce que chaque véhicule vous rapporte <span class="sous">aux recettes minimales prévues au contrat</span></h2>
  <table class="gain">
    <colgroup><col class="l"><col class="e"><col class="e"><col class="e"></colgroup>
    <thead><tr><th></th><th class="n">Essentiel</th><th class="n">Confort</th><th class="n">VIP</th></tr></thead>
    <tbody>
      <tr><th>Recettes minimales du véhicule, par jour</th><td class="n">{f(E['plancher'])}{NBSP}F</td><td class="n">{f(C['plancher'])}{NBSP}F</td><td class="n">{f(V['plancher'])}{NBSP}F</td></tr>
      <tr><th>Votre part en cash, par mois <small>30{NBSP}% du volume, 26 jours actifs</small></th>
          <td class="n">{f(rE['cash_mois'])}{NBSP}F</td><td class="n">{f(rC['cash_mois'])}{NBSP}F</td><td class="n">{f(rV['cash_mois'])}{NBSP}F</td></tr>
      <tr><th>Fonds de rachat, versé à la cession <small>5{NBSP}% du volume, sans prélèvement</small></th>
          <td class="n">{f(arrondi_k(rE['rachat_net']))}{NBSP}F</td><td class="n">{f(arrondi_k(rC['rachat_net']))}{NBSP}F</td><td class="n">{f(arrondi_k(rV['rachat_net']))}{NBSP}F</td></tr>
      <tr class="total"><th>Total encaissé sur la durée du contrat <small>avant vos propres charges</small></th>
          <td class="n">{m(rE['total'])}</td><td class="n">{m(rC['total'])}</td><td class="n">{m(rV['total'])}</td></tr>
      <tr class="cle"><th>Coût de revient conseillé <small>achat dédouané + vos charges sur la durée, pour faire de la marge</small></th>
          <td class="n">≤{NBSP}{m(E['budget'])}</td><td class="n">≤{NBSP}{m(C['budget'])}</td><td class="n">≤{NBSP}{m(V['budget'])}</td></tr>
      <tr class="marge"><th>Marge aux minimums <small>sur la durée · par an</small></th>
          <td class="n s">{ligne_marge(rE)}</td><td class="n s">{ligne_marge(rC)}</td><td class="n s">{ligne_marge(rV)}</td></tr>
      <tr class="marge"><th>Marge si le chauffeur dépasse de 25{NBSP}% les minimums <small>plus de courses, plus de gains</small></th>
          <td class="n s">{ligne_marge(rE25)}</td><td class="n s">{ligne_marge(rC25)}</td><td class="n s">{ligne_marge(rV25)}</td></tr>
    </tbody>
  </table>
  <p class="note">Le coût de revient englobe tout ce que vous payez pour le véhicule : achat, dédouanement, assurance, entretien, visite technique, traceur GPS. Au-delà du total encaissé, vous ne récupérez pas votre mise.
    Marge = total encaissé − coût de revient conseillé ; ROI = marge ÷ coût de revient. <b>Aucune avance de démarrage</b> ne vous est demandée : TamCar avance les frais d’entrée de chaque véhicule ({f(FRAIS_ENTREE)}{NBSP}F).</p>

  <div class="flotte">
    <div class="carte"><div class="k">Flotte demandée</div><div class="v">6 + 3 + 1 véhicules</div><div class="s">Essentiel + Confort + VIP</div></div>
    <div class="carte"><div class="k">Coût de revient, 10 véhicules</div><div class="v">≤{NBSP}{m(cout_total)}</div><div class="s">6 × {m(E['budget'])} + 3 × {m(C['budget'])} + {m(V['budget'])}</div></div>
    <div class="carte"><div class="k">Marge des 10 véhicules (minimums)</div><div class="v">{m(marge_total, True)}</div><div class="s">{m(marge_total25, True)} si le chauffeur dépasse de 25{NBSP}%</div></div>
  </div>

  <div class="deux">
    <div class="bloc or"><b>Aucune avance de votre part, aucun prélèvement sur votre fonds de rachat.</b>
      TamCar avance les <b>frais d’entrée</b> de chaque véhicule ({f(FRAIS_ENTREE)}{NBSP}F : inspection, habillage TamCar, kit chauffeur) et finance, toute l’année, les <b>produits de senteur</b>
      remis aux chauffeurs toutes les deux semaines, ainsi que les <b>gadgets et forfaits internet offerts aux meilleurs chauffeurs</b>, qui fidélisent les conducteurs et soignent le service.
      Ces dépenses sont prises sur la propre part de TamCar : votre part de {int(PART_COURSE * 100)}{NBSP}% et votre fonds de rachat de {int(RACHAT * 100)}{NBSP}% restent entiers.</div>
  </div>

  <footer>
    <div class="sign">
      <div class="qui">
        <div class="trait"></div>
        <div class="nom">{SIGNATAIRE}</div>
        <div class="role">Fondateur — TamCar (Tam Logistics SARL, en cours de constitution)</div>
      </div>
      <div class="fait">Fait à Cotonou, le {DATE}<br>{EMAIL}</div>
    </div>
    <p class="legal">Simulation fondée sur des hypothèses (26 jours actifs par mois, recettes aux minimums prévus au contrat, vos charges propres non incluses) : elle ne constitue ni une garantie de rendement
      ni un engagement avant la signature du contrat. Ce document est confidentiel et réservé à son destinataire : il ne doit être ni diffusé ni reproduit. Montants en FCFA ; « M » = million.<br>{CREDITS_PHOTOS}</p>
  </footer>

  <div class="pied"><span>TamCar · Proposition de flotte · {SOCIETE} · Document confidentiel</span><span>Page 2 sur 2</span></div>
</div>
</body>
</html>
"""

# ----- Typographie française : espaces insécables avant « : ; ! ? » et entre un nombre et son unité -----
corps_debut = html.index("<body>")
tete, corps = html[:corps_debut], html[corps_debut:]
corps = re.sub(r"(?<=\S) ([:;!?»])", NBSP + r"\1", corps)
corps = re.sub(r"(«) ", r"\1" + NBSP, corps)
corps = re.sub(r"(\d) (\d{3})\b", r"\1" + NBSP + r"\2", corps)
corps = re.sub(r"(\d) (F|FCFA|km|ans|an|mois|jours?|%)\b", r"\1" + NBSP + r"\2", corps)
html = tete + corps

sortie_html = RACINE / "TamCar_proposition_flotte_AfricGroup.html"
sortie_pdf = RACINE / "TamCar_proposition_flotte_AfricGroup.pdf"
sortie_html.write_text(html, encoding="utf-8")
subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                f"--print-to-pdf={sortie_pdf}", sortie_html.as_uri()], check=True, capture_output=True)
print("OK", sortie_pdf)
for nom, r in (("Essentiel", rE), ("Confort", rC), ("VIP", rV)):
    print(f"{nom:9s}: total {f(r['total'])}  marge {f(r['marge'])} ({pct(r['roi'])}, {pct(r['roi_an'], False)}/an)")
print(f"Flotte : coût de revient {f(cout_total)}  marge {f(marge_total)}  (+25 % : {f(marge_total25)})")
