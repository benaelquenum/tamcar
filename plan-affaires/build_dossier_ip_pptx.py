"""Dossier d'évaluation IP, version 2.0 : présentation PowerPoint (même contenu que build_dossier_ip.py).

Palette de la version 1.0 (archivée dans archives/2026-10-23_dossier_IP_v1/) : bleu nuit 1E3A8A, bleu 2563EB, encre 0F172A, or EAB308, Calibri.
Sortie : ../TamCar_dossier_evaluation_IP.pptx
"""
import pathlib

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

SORTIE = pathlib.Path(__file__).parent.parent / 'TamCar_dossier_evaluation_IP.pptx'
NUIT, BLEU, ENCRE, OR = RGBColor(0x1E, 0x3A, 0x8A), RGBColor(0x25, 0x63, 0xEB), RGBColor(0x0F, 0x17, 0x2A), RGBColor(0xEA, 0xB3, 0x08)
GRIS, CLAIR, PALE, PERVENCHE, BLANC = RGBColor(0x64, 0x74, 0x8B), RGBColor(0xE2, 0xE8, 0xF0), RGBColor(0xF8, 0xFA, 0xFC), RGBColor(0xDB, 0xEA, 0xFE), RGBColor(255, 255, 255)
AMBRE = RGBColor(0xFE, 0xF3, 0xC7)
TOTAL = 15

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
VIDE = prs.slide_layouts[6]


def rect(sl, x, y, w, h, fill, forme=MSO_SHAPE.RECTANGLE, ligne=None):
    s = sl.shapes.add_shape(forme, Inches(x), Inches(y), Inches(w), Inches(h))
    s.fill.solid(); s.fill.fore_color.rgb = fill
    if ligne is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = ligne; s.line.width = Pt(0.75)
    s.shadow.inherit = False
    return s


def texte(sl, x, y, w, h, runs, taille=11, couleur=ENCRE, gras=False, align=None, ancre=None, interligne=None):
    """runs : str, ou liste de paragraphes ; un paragraphe = str ou liste de (texte, gras)."""
    tb = sl.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame; tf.word_wrap = True
    tf.margin_left = tf.margin_right = Inches(0.04); tf.margin_top = tf.margin_bottom = Inches(0.02)
    if ancre:
        tf.vertical_anchor = ancre
    paras = runs if isinstance(runs, list) else [runs]
    for i, par in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        if align:
            p.alignment = align
        if interligne:
            p.line_spacing = interligne
        p.space_after = Pt(3)
        segs = par if isinstance(par, list) else [(par, gras)]
        for t, g in segs:
            r = p.add_run(); r.text = t; r.font.name = 'Calibri'; r.font.size = Pt(taille); r.font.bold = g; r.font.color.rgb = couleur
    return tb


def puces(sl, x, y, w, items, taille=11, pas=0.5, h=0.5):
    """items : liste de (gras, reste) ; une puce bleue par ligne."""
    for i, (g, reste) in enumerate(items):
        rect(sl, x, y + i * pas + 0.09, 0.09, 0.09, BLEU)
        texte(sl, x + 0.2, y + i * pas, w - 0.2, h, [[(g, True), (reste, False)]], taille=taille)


def tableau(sl, x, y, w, largeurs, lignes, taille=9.5, haut=0.3, entete=True, surligne=None, droite=()):
    nl, nc = len(lignes), len(lignes[0])
    gf = sl.shapes.add_table(nl, nc, Inches(x), Inches(y), Inches(w), Inches(haut * nl))
    t = gf.table
    tot = sum(largeurs)
    for i, lw in enumerate(largeurs):
        t.columns[i].width = Inches(w * lw / tot)
    for r in range(nl):
        t.rows[r].height = Inches(haut)
        for c in range(nc):
            cell = t.cell(r, c); cell.margin_left = cell.margin_right = Inches(0.07); cell.margin_top = cell.margin_bottom = Inches(0.03)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            tf = cell.text_frame; tf.word_wrap = True
            p = tf.paragraphs[0]; p.text = ''
            run = p.add_run(); run.text = str(lignes[r][c]); run.font.name = 'Calibri'; run.font.size = Pt(taille)
            en = entete and r == 0; fort = surligne is not None and r == surligne
            run.font.bold = en or fort
            run.font.color.rgb = BLANC if en else ENCRE
            if c in droite:
                p.alignment = PP_ALIGN.RIGHT
            cell.fill.solid()
            cell.fill.fore_color.rgb = NUIT if en else (PERVENCHE if fort else (PALE if r % 2 == 0 else BLANC))
    return gf


def carte(sl, x, y, w, h, titre, corps, fond=PERVENCHE, taille=10):
    rect(sl, x, y, w, h, fond, MSO_SHAPE.ROUNDED_RECTANGLE).adjustments[0] = 0.06
    texte(sl, x + 0.15, y + 0.08, w - 0.3, 0.3, titre, taille=taille + 1, couleur=NUIT, gras=True)
    texte(sl, x + 0.15, y + 0.42, w - 0.3, h - 0.5, corps, taille=taille)


def resultat(sl, x, y, w, h, etiquette, valeur, note):
    rect(sl, x, y, w, h, NUIT, MSO_SHAPE.ROUNDED_RECTANGLE).adjustments[0] = 0.08
    texte(sl, x + 0.25, y + 0.12, w - 0.5, 0.3, etiquette, taille=11, couleur=RGBColor(0xC7, 0xD2, 0xFE), gras=True)
    texte(sl, x + 0.25, y + 0.42, w - 0.5, 0.7, valeur, taille=30, couleur=OR, gras=True)
    texte(sl, x + 0.25, y + 1.12, w - 0.5, h - 1.15, note, taille=10, couleur=BLANC)


def nouvelle(num, titre, sous, n):
    sl = prs.slides.add_slide(VIDE)
    rect(sl, 0, 0, 13.333, 7.5, BLANC)
    texte(sl, 0.7, 0.35, 1.0, 0.7, num, taille=30, couleur=BLEU, gras=True)
    texte(sl, 1.55, 0.38, 10.5, 0.45, titre, taille=22, couleur=NUIT, gras=True)
    texte(sl, 1.55, 0.82, 10.5, 0.3, sous, taille=11, couleur=GRIS)
    rect(sl, 0.7, 1.2, 11.93, 0.04, BLEU)
    rect(sl, 0.7, 7.05, 11.93, 0.01, CLAIR)
    texte(sl, 0.7, 7.08, 6, 0.28, "TamCar — Dossier d'évaluation IP (V2.0)", taille=8, couleur=GRIS)
    texte(sl, 8.6, 7.08, 4.03, 0.28, f'Confidentiel · {n} / {TOTAL}', taille=8, couleur=GRIS, align=PP_ALIGN.RIGHT)
    return sl


# ------------------------------------------------------------------ 1 · couverture
sl = prs.slides.add_slide(VIDE)
rect(sl, 0, 0, 13.333, 7.5, NUIT)
rect(sl, 0.7, 0.8, 5.5, 0.4, BLEU)
texte(sl, 0.85, 0.85, 5.3, 0.3, "DOSSIER CONFIDENTIEL · APPORT EN NATURE", taille=10, couleur=BLANC, gras=True)
texte(sl, 0.7, 1.5, 11.5, 1.0, 'Plateforme TamCar', taille=48, couleur=BLANC, gras=True)
texte(sl, 0.7, 2.6, 11.5, 0.9, "Dossier de justification à l'attention du Commissaire aux Apports, en vue de la constitution de Tam Logistics SARL, marque TamCar (droit OHADA)", taille=15, couleur=RGBColor(0xC7, 0xD2, 0xFE))
rect(sl, 0.7, 3.9, 11.9, 1.7, RGBColor(0x2B, 0x4A, 0x9B), MSO_SHAPE.ROUNDED_RECTANGLE).adjustments[0] = 0.06
rect(sl, 0.7, 3.9, 0.15, 1.7, OR)
texte(sl, 1.05, 4.0, 11, 0.3, "VALEUR D'APPORT EN NATURE PROPOSÉE", taille=11, couleur=RGBColor(0xC7, 0xD2, 0xFE), gras=True)
texte(sl, 1.05, 4.3, 11, 0.8, '22 500 000 FCFA', taille=40, couleur=OR, gras=True)
texte(sl, 1.05, 5.1, 11, 0.4, 'Entre le coût de reproduction (20 M) et la valeur d\'usage (25,5 M) · 45 % du coût historique (50 M)', taille=12, couleur=BLANC)
meta = [('APPORTEUR', 'BENAEL, SARL à associé unique (RCCM RB/COT/26 B 44404)'), ('REPRÉSENTÉE PAR SON GÉRANT', 'Terence Beni Raphaël QUENUM'),
        ('SOCIÉTÉ BÉNÉFICIAIRE', 'Tam Logistics SARL (en formation), marque TamCar'), ('NATURE · CADRE', 'Propriété intellectuelle · Art. 312 AUSCGIE · V2.0, octobre 2026')]
for i, (k, v) in enumerate(meta):
    x, y = 0.7 + (i % 2) * 6.1, 5.95 + (i // 2) * 0.6
    texte(sl, x, y, 5.9, 0.25, k, taille=8, couleur=RGBColor(0xC7, 0xD2, 0xFE), gras=True)
    texte(sl, x, y + 0.2, 5.9, 0.3, v, taille=11, couleur=BLANC)

# ------------------------------------------------------------------ 2 · résumé
sl = nouvelle('01', 'Résumé exécutif', 'Ce dossier en une page', 2)
texte(sl, 0.7, 1.4, 6.0, 1.3, [[("Ce document justifie la valorisation de l'apport en nature de ", False), ('BENAEL', True), (" à Tam Logistics SARL (marque TamCar), société en formation. Il assiste le Commissaire aux Apports dans sa mission (", False), ("art. 312 AUSCGIE", True), (').', False)]], taille=11.5, couleur=GRIS)
puces(sl, 0.7, 2.75, 6.0, [
    ('Plateforme en production — ', 'actif fonctionnel testable en temps réel.'),
    ('Périmètre au 20 octobre 2026 — ', '4 applications web et 2 coques Android, 107 écrans, 90 tables, 349 fonctions métier.'),
    ("Origine de la valeur — ", "celle qui permet la répartition convenue avec l'investisseur (15 M en numéraire pour 40 %)."),
    ('Titularité — ', 'travaux du fondateur cédés à BENAEL en apport, puis apport à la société.'),
], taille=10.5, pas=0.78, h=0.75)
tableau(sl, 7.0, 1.45, 5.63, [3.6, 1.6], [
    ('Méthode', 'Valeur'), ('A · Coût historique\n2 000 h × 25 000 F/h', '50 000 000 F'),
    ('B · Coût de reproduction\n800 h × 25 000 F/h', '20 000 000 F'), ("C · Valeur d'usage\nRevenus 36 mois, actualisés à 20 %", '25 500 000 F'),
    ('Valeur proposée', '22 500 000 F')], taille=10.5, haut=0.62, surligne=4, droite=(1,))
texte(sl, 7.0, 4.7, 5.63, 0.6, '+ 12,5 % sur B · − 11,8 % sur C · 45 % de A', taille=10, couleur=GRIS)

# ------------------------------------------------------------------ 3 · description
sl = nouvelle('02', "Description de l'apport", 'Nature et périmètre du bien apporté', 3)
texte(sl, 0.7, 1.38, 7.4, 0.8, [[("L'apport consiste en la ", False), ('totalité des droits patrimoniaux', True), (" attachés à la plateforme « TamCar », dans les limites de la liste fermée de l'annexe 1 :", False)]], taille=11, couleur=GRIS)
puces(sl, 0.7, 2.1, 7.4, [
    ('Code source — ', 'passagers, chauffeurs (TamCar Pro), TamCar Office, site vitrine, coques Android.'),
    ('Base de données — ', 'schéma, sécurité, fonctions, tâches planifiées, fonctions serveur.'),
    ('Documentation — ', 'spécifications, guides, roadmap, plan d\'affaires.'),
    ('Marque — ', 'nom, logo, slogan, charte, sous-marques, droit de dépôt.'),
    ('Savoir-faire — ', 'tarifs, partage des revenus, cession échelonnée, TamAssur, matching.'),
    ('Documents types — ', 'contrat de partenariat, conditions générales, reçus, plaquettes.'),
    ('Noms de domaine — ', 'liés à TamCar.'),
], taille=10.5, pas=0.62, h=0.6)
kp = [('4 + 2', 'Applications web + coques Android'), ('107', 'Écrans'), ('349', 'Fonctions métier'), ('90 + 9', 'Tables et vues SQL'), ('~132 k', 'Lignes (TypeScript et SQL)'), ('450+', 'Commits Git depuis le 13/07/2026')]
for i, (v, l) in enumerate(kp):
    x, y = 8.5 + (i % 2) * 2.12, 1.55 + (i // 2) * 1.6
    rect(sl, x, y, 2.0, 1.45, PERVENCHE, MSO_SHAPE.ROUNDED_RECTANGLE).adjustments[0] = 0.08
    texte(sl, x, y + 0.2, 2.0, 0.6, v, taille=26, couleur=BLEU, gras=True, align=PP_ALIGN.CENTER)
    texte(sl, x + 0.1, y + 0.85, 1.8, 0.5, l, taille=10, couleur=GRIS, align=PP_ALIGN.CENTER)

# ------------------------------------------------------------------ 4 · fonctionnalités
sl = nouvelle('02', 'Catégories de fonctionnalités livrées', 'Périmètre fonctionnel au 20 octobre 2026', 4)
tableau(sl, 0.7, 1.5, 11.93, [1.6, 8.4], [
    ('Domaine', 'Fonctionnalités clés'),
    ('Passagers', "Commande immédiate et à l'avance, catégories Moto, Tricycle, Essentiel, Confort et VIP, suivi du chauffeur en direct (y compris écran verrouillé), chat et appel audio, portefeuille, paiement Mobile Money et carte, facture, notation, TamPass, courses programmées, favoris, suivi de nuit par un proche"),
    ('Chauffeurs (TamCar Pro)', 'Mise en ligne, matching par cercles de proximité, navigation, alertes de course, objectif du jour, versement quotidien, TamAssur (épargne), portefeuille et retraits automatiques, litiges et points'),
    ('Administration', 'Candidatures et rendez-vous, partenaires et véhicules, contrats et suspension automatique, fonds de rachat, alertes SOS, litiges automatiques, classements semestriels, guide d\'utilisation'),
    ('TamCar Office', 'Comptabilité SYSCOHADA, trésorerie, paie, courrier, lecture de justificatifs par intelligence artificielle'),
    ('Transverse', 'Authentification, notifications push, bot WhatsApp Tamy, site vitrine et espace partenaire, multi-langue, installation PWA et coques Android'),
], taille=10.5, haut=0.85)

# ------------------------------------------------------------------ 5 · méthodologie
sl = nouvelle('03', "Méthodologie d'évaluation", 'Trois approches convergentes conformes aux standards', 5)
texte(sl, 0.7, 1.4, 11.9, 0.6, [[("L'évaluation d'un actif immatériel logiciel s'appuie sur trois familles de méthodes. La valeur proposée se situe ", False), ('entre le coût de reproduction et la valeur d\'usage', True), ('.', False)]], taille=11.5, couleur=GRIS)
for i, (t, c) in enumerate([
    ('A. Coût historique', "Coût des ressources humaines investies : temps de travail × tarif horaire du marché local. Approche rétrospective."),
    ('B. Coût de reproduction', "Coût de reconstitution aujourd'hui, à périmètre connu : les itérations et découvertes métier n'ont plus à être refaites. Approche de remplacement."),
    ("C. Valeur d'usage", "Valeur actuelle des revenus de TamCar sur 36 mois, flotte de départ du plan, actualisés à 20 %. Approche prospective.")]):
    carte(sl, 0.7 + i * 4.05, 2.1, 3.85, 1.9, t, c, taille=10.5)
tableau(sl, 0.7, 4.3, 11.93, [3, 1.6, 6.3], [
    ('Méthode', 'Valeur', 'Fiabilité'),
    ('A · Coût historique', '50 000 000 F', 'Moyenne — heures déclarées, à justifier par un relevé de temps'),
    ('B · Coût de reproduction', '20 000 000 F', 'Haute — fondée sur un périmètre connu et mesuré'),
    ("C · Valeur d'usage", '25 500 000 F', "Moyenne — dépend des hypothèses du plan d'affaires")], taille=10.5, haut=0.45, droite=(1,))

# ------------------------------------------------------------------ 6 · méthode A
sl = nouvelle('04', 'Méthode A — Coût historique', 'Temps × tarif horaire senior local', 6)
tableau(sl, 0.7, 1.45, 6.6, [3, 3.4], [
    ('Élément', 'Valeur'), ('Période de travail', 'nov. 2025 → 20 oct. 2026 (≈ 11 mois)'), ('Volume de travail du fondateur', '≈ 2 000 heures (≈ 175 h par mois)'),
    ('Rémunération versée', 'aucune : heures non payées'), ('Dépenses en numéraire engagées', '4 000 000 F')], taille=10, haut=0.4)
carte(sl, 0.7, 3.65, 6.6, 1.75, 'Justification des heures', "Le dépôt Git privé commence le 13 juillet 2026 : il atteste juillet-octobre 2026. Les travaux de novembre 2025 à juillet 2026 sont justifiés par des pièces datées. Un relevé de temps ventilé par domaine sera établi et remis (pièce 3).", fond=AMBRE, taille=10)
tableau(sl, 7.6, 1.45, 5.03, [3, 2], [
    ("Niveau d'expertise", 'Tarif (FCFA/h)'), ('Junior (0-2 ans)', '8 000 - 12 000'), ('Confirmé (2-5 ans)', '15 000 - 20 000'),
    ('Senior full-stack (5-10 ans)', '20 000 - 30 000'), ('Expert / Lead (10+ ans)', '35 000 - 50 000')], taille=10, haut=0.4, surligne=3, droite=(1,))
texte(sl, 7.6, 3.5, 5.03, 0.7, "Consultations d'agences Cotonou / Lomé et missions freelance 2024-2026. Tarif retenu : 25 000 F, milieu de la fourchette senior.", taille=9, couleur=GRIS)
resultat(sl, 7.6, 4.35, 5.03, 1.7, 'Résultat Méthode A', '50 000 000 FCFA', '2 000 heures × 25 000 FCFA/heure : coût du travail du fondateur au tarif médian senior local.')

# ------------------------------------------------------------------ 7 · méthode B
sl = nouvelle('05', 'Méthode B — Coût de reproduction', 'Reconstruire à périmètre connu', 7)
tableau(sl, 0.7, 1.45, 6.6, [4, 2.4], [
    ('Poste', 'Valeur'), ('Temps historique (méthode A)', '2 000 heures'), ('Part nécessaire pour reconstruire à périmètre connu', '40 %'),
    ('Heures de reconstruction', '800 heures'), ('Tarif horaire senior local', '25 000 F'), ('Coût de reproduction', '20 000 000 F')], taille=10.5, haut=0.45, surligne=5, droite=(1,))
puces(sl, 0.7, 4.4, 6.6, [
    ('Heures de développement seulement — ', "aucun poste de coordination, de design ou de marge d'agence."),
    ('Périmètre arrêté — ', "liste fermée de l'annexe 1 au 20 octobre 2026."),
    ("Devis d'agence régionale — ", 'remis au Commissaire pour contrôle.'),
], taille=10.5, pas=0.62, h=0.6)
resultat(sl, 7.6, 1.45, 5.03, 2.0, 'Résultat Méthode B', '20 000 000 FCFA', "Valeur la plus directement observable : c'est le plancher défendable de la valeur proposée.")

# ------------------------------------------------------------------ 8 · méthode C
sl = nouvelle('06', "Méthode C — Valeur d'usage", 'Revenus de TamCar actualisés', 8)
puces(sl, 0.7, 1.5, 6.6, [
    ('Flotte — ', "flotte de départ du plan d'affaires v6 ; voitures de tiers et Parakou hors projection."),
    ('Revenus — ', 'part de TamCar sur les recettes des véhicules, aux planchers de recettes prévus aux contrats (100 %).'),
    ('Horizon — ', '36 mois à compter du lancement (janvier 2027).'),
    ("Actualisation — ", '20 % par an (prime de risque startup Bénin conservatrice).'),
], taille=10.5, pas=0.75, h=0.7)
rect(sl, 0.7, 4.6, 6.6, 0.75, PALE, MSO_SHAPE.ROUNDED_RECTANGLE, ligne=CLAIR)
texte(sl, 0.85, 4.7, 6.3, 0.6, "Valeur d'usage = Σ (revenus du mois ÷ 1,20^(mois / 12)), mois 1 à 36 = 25 500 000 FCFA", taille=10.5, couleur=NUIT, gras=True)
carte(sl, 7.6, 1.45, 5.03, 2.15, 'Note critique de méthode', "Appliquée à un actif jeune, sans historique de revenus, la valeur d'usage est incertaine : elle dépend des planchers de recettes atteints. À 70 % des planchers, le plan ne dégage plus d'excédent d'exploitation. Elle sert de confirmation et de borne haute.", fond=AMBRE, taille=10)
resultat(sl, 7.6, 3.85, 5.03, 1.7, 'Résultat Méthode C', '25 500 000 FCFA', "Borne haute : la valeur proposée (22,5 M) lui est inférieure de 11,8 %.")

# ------------------------------------------------------------------ 9 · synthèse
sl = nouvelle('07', 'Synthèse des méthodes', 'Convergence et position finale du dossier', 9)
tableau(sl, 0.7, 1.45, 6.9, [2.4, 3, 1.8], [
    ('Méthode', 'Base', 'Valeur'), ('A. Coût historique', '2 000 h × 25 000 F', '50 000 000'), ('B. Coût de reproduction', '800 h × 25 000 F', '20 000 000'),
    ("C. Valeur d'usage", 'Revenus 36 mois à 20 %', '25 500 000'), ('VALEUR PROPOSÉE', '', '22 500 000 FCFA')], taille=10.5, haut=0.5, surligne=4, droite=(2,))
texte(sl, 0.7, 4.2, 6.9, 1.2, [[("La valeur proposée est ", False), ('supérieure au coût de reproduction', True), (' (+ 12,5 %), ', False), ("inférieure à la valeur d'usage", True), (" (− 11,8 %) et égale à ", False), ('45 % du coût historique', True), (". Elle correspond à la valeur nécessaire pour la répartition convenue avec l'investisseur (15 000 000 F en numéraire pour 40 %).", False)]], taille=10.5, couleur=GRIS)
carte(sl, 8.0, 1.45, 4.63, 3.9, 'Position finale du dossier', "• 22 500 000 FCFA, entre B (20 M) et C (25,5 M)\n• 45 % du coût historique (50 M)\n• Fraction infime des comparables sectoriels africains\n• Responsabilité solidaire des associés à un niveau maîtrisable (art. 312 AUSCGIE)", taille=11)

# ------------------------------------------------------------------ 10 · comparables
sl = nouvelle('07', 'Comparables de marché', 'Valorisations d’acteurs comparables ou concurrents', 10)
tableau(sl, 0.7, 1.45, 11.93, [3.2, 3.2, 2.8, 2.4], [
    ('Acteur', 'Zone', 'Valorisation dernière levée', 'Équiv. FCFA'),
    ('Yango (filiale Yandex)', 'Global — présent Bénin', '~500 M USD', '~300 milliards'),
    ('Gozem', 'Afrique Ouest / Centre', '~30 M USD (Série B 2022)', '~18 milliards'),
    ('SafeBoda', 'Afrique Est', '~15 M USD (Série A)', '~9 milliards'),
    ('Bolt', 'Global — Sénégal, Ghana', '~8 milliards USD', '~5 000 milliards'),
    ('INAS Travel (Masters Services Formation)', 'Locale — Cotonou et destinations du Bénin', 'Non communiquée', '—'),
    ('inDrive (international)', 'Global — présent à Cotonou en moto', 'Non relevée', '—'),
    ('4U / For You (CIL&ASSOCIÉS)', 'Locale — Cotonou, Abomey-Calavi', 'Non communiquée', '—')], taille=10, haut=0.42, droite=(2, 3))
texte(sl, 0.7, 5.05, 11.93, 1.5, "Trois acteurs récents sont présents à Cotonou. INAS Travel (application publiée en juin 2026) et 4U (For You) n'ont communiqué aucune valorisation : INAS pratique, en course courte, des prix supérieurs de 85 % à ceux de TamCar en voiture ordinaire (925 F contre 500 F, relevé d'octobre 2026) ; 4U, dont l'audience reste modeste (plus de 1 000 installations par application, 12 avis), est de 8 à 71 % plus chère que TamCar sur 5,6 km (relevé en application du 21 octobre 2026). inDrive n'est présente qu'en moto à Cotonou.", taille=10, couleur=GRIS)

# ------------------------------------------------------------------ 11 · propriété intellectuelle
sl = nouvelle('08', 'Propriété intellectuelle', 'Chaîne de titularité et attestations', 11)
tableau(sl, 0.7, 1.45, 7.2, [1.6, 5.6], [
    ('Étape', 'Fait'),
    ('1 · Création', 'T. B. R. QUENUM, personne physique, conçoit et développe la plateforme de novembre 2025 au 7 octobre 2026.'),
    ('2 · Cession en apport', "Par acte, il cède à BENAEL, en apport en nature, ses droits patrimoniaux sur ces travaux (pièce 8)."),
    ('3 · Poursuite', 'BENAEL (RCCM du 8 octobre 2026) poursuit le développement sous sa responsabilité.'),
    ('4 · Apport', "BENAEL apporte à Tam Logistics SARL les droits de l'annexe 1, en échange de 60 % du capital.")], taille=10, haut=0.78)
carte(sl, 8.2, 1.45, 4.43, 4.7, "Déclarations de l'apporteur", "• Pleine propriété des droits sur l'annexe 1\n• Aucun engagement de sous-traitance, cession ou licence exclusive\n• Aucun composant « copyleft » ; données de lieux issues d'OpenStreetMap (ODbL)\n• Conception, direction et relecture par le gérant, avec outils d'IA pour la rédaction du code\n• Garantie d'éviction et d'usage paisible", taille=10.5)
texte(sl, 0.7, 5.55, 7.2, 0.8, "Dépôt Git privé : historique horodaté depuis le 13 juillet 2026 (plus de 450 commits). Travaux antérieurs justifiés par les pièces 4 et 5.", taille=10, couleur=GRIS)

# ------------------------------------------------------------------ 12 · documents
sl = nouvelle('08', 'Documents mis à disposition', 'Pièces remises au Commissaire aux Apports', 12)
tableau(sl, 0.7, 1.45, 11.93, [0.5, 8.2, 3.2], [
    ('#', 'Document', 'Forme'),
    ('1', 'Archive du code source et historique Git détaillé', 'Fichier .zip et export texte'), ('2', 'Accès démonstration aux applications déployées', 'URLs et comptes de test'),
    ('3', 'Relevé de temps ventilé par domaine technique', 'Tableau signé'), ('4', 'Pièces des travaux de novembre 2025 à juillet 2026 (prototypes, maquettes, cadrage)', 'Fichiers datés'),
    ('5', 'Brief de marque, charte graphique, documentation technique, roadmap', 'PDF et .docx'), ("6", "Plan d'affaires v6 et classeur de projections", 'PDF et .xlsx'),
    ('7', 'Statuts de BENAEL et extrait RCCM', 'PDF'), ('8', 'Acte de cession en apport (fondateur → BENAEL)', 'Acte signé'),
    ('9', "Attestation sur l'honneur de propriété intellectuelle de BENAEL", 'Document signé'), ('10', 'Inventaire des intégrations tierces et des licences', 'Tableau')], taille=10.5, haut=0.43)

# ------------------------------------------------------------------ 13 · annexe 1 (apportés)
sl = nouvelle('09', 'Annexe 1 — Périmètre arrêté', 'Éléments apportés : droits patrimoniaux en pleine propriété', 13)
tableau(sl, 0.7, 1.45, 11.93, [0.5, 2.5, 8.9], [
    ('#', 'Élément', 'Contenu'),
    ('A1', 'Code source', 'Passagers, chauffeurs (TamCar Pro), TamCar Office, site vitrine et espace partenaire, coques Android, bibliothèque partagée, scripts'),
    ('A2', 'Base de données et logique métier', 'Migrations SQL (90 tables, 9 vues, 349 fonctions), sécurité, tâches planifiées, fonctions serveur, tests'),
    ('A3', 'Documentation', 'Spécifications, guides (back-office, TamCar Office), roadmap, plan d\'affaires, classeur de projections'),
    ('A4', 'Marque et signes distinctifs', 'TamCar, logo, palette, slogan, charte ; TamAssur, TamPass, Tamy, TamCar Pro, TamCar Office, TamCar Connect ; visuels ; droit de déposer et d\'enregistrer'),
    ('A5', 'Savoir-faire', 'Tarifs, partage des revenus, cession échelonnée, versement quotidien, TamAssur, fonds de rachat, matching, procédures'),
    ('A6', 'Documents types', 'Contrat de partenariat, conditions générales, confidentialité, reçus, plaquettes, propositions'),
    ('A7', 'Noms de domaine', 'tamcar.app et domaines liés : titularité du compte chez le registraire')], taille=10.5, haut=0.6)
texte(sl, 0.7, 6.4, 11.93, 0.5, "Liste arrêtée au 23 octobre 2026. Tout élément qui n'y figure pas est exclu ; les développements postérieurs à l'apport ne sont pas compris.", taille=10, couleur=GRIS)

# ------------------------------------------------------------------ 14 · annexe 1 (transférés, exclus)
sl = nouvelle('09', 'Annexe 1 — Transférés et exclus', 'Contrats et comptes, éléments restant chez BENAEL', 14)
texte(sl, 0.7, 1.4, 11.9, 0.3, 'Transférés — contrats et comptes, sans valeur d\'apport', taille=13, couleur=NUIT, gras=True)
tableau(sl, 0.7, 1.8, 11.93, [0.5, 6, 5.4], [
    ('#', 'Élément', 'Traitement'),
    ('T1', 'Comptes techniques : Supabase, Vercel, dépôt Git, Cloudflare, Firebase', 'Transfert ou ressouscription au nom de Tam Logistics ; BENAEL assure la transition'),
    ('T2', 'Contrats de paiement et de messagerie : FeexPay, WhatsApp Business', "Conclus au nom de la société d'exploitation"),
    ('T3', "Comptes de développeur des boutiques d'applications", "Ouverts au nom de la société d'exploitation")], taille=10.5, haut=0.48)
texte(sl, 0.7, 3.9, 11.9, 0.3, 'Exclus — restent chez BENAEL', taille=13, couleur=NUIT, gras=True)
tableau(sl, 0.7, 4.3, 11.93, [0.5, 6, 5.4], [
    ('#', 'Élément', 'Traitement'),
    ('E1', 'Plateforme de gestion du groupe BENAEL, Juvora, CleanCompta, site de BENAEL', 'Hors périmètre'),
    ('E2', 'Composants génériques de BENAEL réutilisés dans plusieurs projets (s\'il en existe)', "Licence non exclusive et gratuite pour l'usage de TamCar"),
    ('E3', 'Logiciels et données de tiers (open source, OpenStreetMap)', 'Conservent leur licence ; attribution maintenue')], taille=10.5, haut=0.48)

# ------------------------------------------------------------------ 15 · contact et suite
sl = nouvelle('10', 'Contact et suite du dossier', 'Coordonnées et modalités de restitution', 15)
tableau(sl, 0.7, 1.45, 5.9, [1.6, 4.3], [
    ('Interlocuteur', 'Terence Beni Raphaël QUENUM, gérant de BENAEL et futur gérant de Tam Logistics SARL'),
    ('Email', 'terencebeniraphael@gmail.com'), ('Téléphone', '+229 [à compléter]'),
    ('Adresse', 'BENAEL — Cotonou, 9e arrondissement, Mènontin'), ('Rendez-vous', 'À votre convenance, Cotonou ou Porto-Novo')], taille=10, haut=0.62, entete=False)
texte(sl, 0.7, 4.8, 5.9, 1.7, [[('Rapport attendu : ', True), ("nature de l'apport (par référence à l'annexe 1), méthodes retenues, valeur définitive arrêtée (qui peut différer de la valeur proposée), observations et réserves, signature et date.", False)]], taille=10.5, couleur=GRIS)
tableau(sl, 7.0, 1.45, 5.63, [3.4, 2.2], [
    ('Étape', 'Délai estimé'), ('Remise du dossier et des annexes', 'Immédiate'), ('Étude par le Commissaire', '2 à 4 semaines'),
    ("Compléments d'information", 'Sous 48 h'), ('Rapport officiel', '4 à 6 semaines'), ('Assemblée constitutive de Tam Logistics SARL', 'Suite immédiate')], taille=10, haut=0.5, droite=(1,))
carte(sl, 7.0, 4.75, 5.63, 1.55, 'Rappel important', "La valeur définitive retenue par le Commissaire s'impose aux associés dans les statuts. Toute retenue d'une valeur différente entraînerait leur responsabilité solidaire pendant cinq ans (art. 312 AUSCGIE).", fond=AMBRE, taille=10)

assert len(prs.slides) == TOTAL, len(prs.slides)
prs.save(SORTIE)
print('écrit :', SORTIE.name, len(prs.slides), 'diapositives')
