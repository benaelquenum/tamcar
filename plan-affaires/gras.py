"""Met en gras (une seule fois par fichier) des termes et des idées marquantes dans les textes des parties 2 à 6.
Idempotent : une expression déjà en gras est ignorée. Affiche les expressions introuvables."""
import pathlib
import re

ICI = pathlib.Path(__file__).parent

LISTES = {
    'source.html': [
        "plateforme numérique de transport urbain de personnes",
        "politique tarifaire transparente",
        "société à responsabilité\n        limitée (SARL) à constituer",
        "apport en nature de la plateforme et des droits de propriété\n        intellectuelle concernés",
        "participation majoritaire au\n        capital",
        "l’accessibilité du transport pour les\n        passagers, la viabilité économique de l’activité des conducteurs et la pérennité de\n        l’entreprise",
        "tarification transparente",
        "finaliser la structuration juridique et financière du projet",
        "constituer un réseau de conducteurs partenaires",
        "d’étendre progressivement sa présence à d’autres villes béninoises",
        "communique ses tarifs à l’avance",
        "Cotonou et le Grand Nokoué constituent le premier marché",
        "Parakou constitue le second marché",
        "la transparence\n      tarifaire, la prévisibilité de la relation entre passagers et conducteurs et\n      l’intégration de mécanismes de fidélisation économique",
        "ne fonde donc pas son positionnement uniquement sur le prix",
    ],
    'partie3.html': [
        "enjeu économique et social important",
        "demande de mobilité diversifiée",
        "financement de 200 millions de dollars",
        "disponibilité des\n        conducteurs, prévisibilité des prix, réservation à l’avance, traçabilité des courses et\n        fidélisation de la clientèle",
        "un tarif annoncé avant\n        la confirmation de la course",
        "réduire l’incertitude liée aux\n        déplacements quotidiens",
        "autant sur sa capacité à attirer des passagers que sur sa\n        capacité à recruter et fidéliser des conducteurs",
        "de l’ordre de 10 000 F par jour, six jours sur sept, indépendamment de ses\n        recettes",
        "aucune assurance\n        individuelle",
        "de l’ordre de 40 % sur les voitures et de 13 % sur les motos",
        "entre 2 000 et\n      6 000 F",
        "ne cherche pas à être le moins cher",
        "sans coefficient dynamique",
        "mais du recrutement",
        "Aucune plateforme de\n        VTC n’y opère à ce jour",
        "en montant de courses réalisées par véhicule et\n    par jour, et non en nombre de courses",
    ],
    'partie4.html': [
        "créer\n        simultanément une offre de transport disponible, une demande suffisante et un niveau de\n        confiance",
        "validation\n        de son modèle opérationnel sur une zone géographique maîtrisable",
        "toute commande hors zone est refusée par la plateforme",
        "la\n        contrainte à lever en premier est donc l’offre de chauffeurs",
        "évitera de promettre un revenu minimum ou un volume de courses garanti",
        "Un chauffeur sans véhicule peut rejoindre TamCar, et TamCar n’en finance pas l’achat",
        "1 000 FCFA par jour travaillé",
        "permettre de\n        commander un déplacement urbain dans des conditions de prix compréhensibles et avec un\n        niveau de service prévisible",
        "ne signifie pas que TamCar appliquera systématiquement les tarifs les\n        plus bas du marché",
        "Le budget promotionnel sera plafonné et les résultats mesurés",
        "Le lancement sera organisé en quatre étapes",
    ],
    'partie5.html': [
        "maîtriser une partie de son offre de\n        transport",
        "volontairement légère au démarrage",
        "plateforme numérique\n    propriétaire",
        "cession échelonnée prévu sur\n    36 mois",
        "relais de TamCar sur le terrain",
        "Le fondateur ne percevra pas de salaire pendant la première\n        phase d’exploitation",
    ],
    'partie6.html': [
        "l’intermédiation numérique, la\n        perception de commissions sur les courses et l’exploitation progressive d’une flotte de\n        véhicules",
        "prix fixe annoncé avant la course",
        "cession progressive des véhicules aux\n        chauffeurs",
        "accession à la propriété",
        "quote-part de gestion",
        "tolérance de découvert de 5 000 FCFA",
        "double fonction",
        "le chauffeur peut accéder à la\n        propriété du véhicule",
        "ne constituent pas, en totalité, des revenus disponibles\n        pour TamCar",
        "le\n        parrainage est une dépense d’acquisition",
        "La part de TamCar reste donc de\n        20 % dans les deux cas",
    ],
}


def motif(phrase: str) -> re.Pattern:
    jetons = re.split(r'\s+', phrase.strip())
    return re.compile(r'\s+'.join(re.escape(j) for j in jetons))


def appliquer(fichier: str, phrases) -> list:
    chemin = ICI / fichier
    html = chemin.read_text(encoding='utf-8')
    morceaux = re.split(r'(<[^>]+>)', html)
    profondeur_strong = 0
    profondeur_exclue = 0          # titres, scripts, styles : on n'y met rien en gras
    introuvables = []
    restantes = [(p, motif(p)) for p in phrases]
    for i, m in enumerate(morceaux):
        if m.startswith('<'):
            t = m.lower()
            if re.match(r'<(strong|b)\b', t):
                profondeur_strong += 1
            elif re.match(r'</(strong|b)\b', t):
                profondeur_strong = max(0, profondeur_strong - 1)
            elif re.match(r'<(h[1-6]|style|script|th|button)\b', t):
                profondeur_exclue += 1
            elif re.match(r'</(h[1-6]|style|script|th|button)\b', t):
                profondeur_exclue = max(0, profondeur_exclue - 1)
            continue
        if profondeur_strong or profondeur_exclue or not m.strip():
            continue
        for p, rx in list(restantes):
            mm = rx.search(m)
            if mm:
                m = m[:mm.start()] + '<strong>' + m[mm.start():mm.end()] + '</strong>' + m[mm.end():]
                restantes.remove((p, rx))
        morceaux[i] = m
    # expressions déjà en gras avant : comptées comme faites
    for p, rx in restantes:
        deja = re.search(r'<strong>\s*' + rx.pattern + r'\s*</strong>', html)
        if not deja:
            introuvables.append(p)
    chemin.write_text(''.join(morceaux), encoding='utf-8')
    return introuvables


# Parties générées (7 à 11) : régénérées à chaque build, donc mises en gras après les générateurs
LISTES_GEN = {
    'partie7.html': [
        "financer l’acquisition progressive de la flotte, couvrir les charges d’exploitation et dégager une trésorerie suffisante",
        "trois scénarios d’activité",
        "Le scénario de base constitue l’hypothèse centrale du business plan",
        "un volume journalier de 9 000 FCFA par tricycle",
        "une avance de 30 % à la commande, puis le règlement du solde sur dix-huit mois",
        "suivre séparément les sommes revenant aux différents acteurs",
    ],
    'partie8.html': [
        "ce que TamCar devra payer pour fonctionner",
        "comment ces dépenses évolueront sur 36 mois",
        "comment les ressources initiales seront mobilisées",
        "structure légère",
    ],
    'partie9.html': [
        "plusieurs facteurs interdépendants",
        "anticiper les difficultés, à limiter leurs conséquences et à préserver la continuité de l’activité",
        "plancher contractuel de 9 000 FCFA de volume de courses par jour",
        "le débit automatique de la commission",
        "La réserve de propriété",
        "Aucune exonération ou facilité fiscale n’est comptée dans le plan avant sa confirmation",
        "Un tableau de bord mensuel",
    ],
    'partie10.html': [
        "montée en puissance par étapes",
        "Le lancement est fixé à janvier 2027",
        "début décembre 2026",
        "Le passage à chaque phase est conditionné par l’atteinte de critères vérifiables",
        "cession progressive",
    ],
    'partie11.html': [
        "une seule instruction SQL conditionnelle",
        "aucun verrou n’est géré par l’application",
        "La sécurité repose d’abord sur la base",
    ],
}


if __name__ == '__main__':
    for f, ph in LISTES.items():
        manq = appliquer(f, ph)
        print(f, 'introuvables :', manq)
