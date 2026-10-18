import pathlib


def patch(nom, paires):
    p = pathlib.Path(nom)
    s = p.read_text(encoding='utf-8')
    for old, new in paires:
        assert old in s, (nom, old[:80])
        s = s.replace(old, new, 1)
    p.write_text(s, encoding='utf-8')


patch('partie3.html', [
    ("un accompagnement opérationnel et le dispositif d’épargne envisagé avec\n        NSIA Assurances.",
     "un accompagnement opérationnel et <strong>TamAssur</strong>, le dispositif d’épargne envisagé avec\n        NSIA Assurances."),
    ('Dispositif d’épargne · NSIA Assurances</span>', 'TamAssur · NSIA Assurances</span>'),
    ("un\n        dispositif d’épargne associé à des conditions d’éligibilité précises.",
     "un\n        dispositif d’épargne, <strong>TamAssur</strong>, associé à des conditions d’éligibilité précises."),
    ("associés au dispositif d’épargne des conducteurs.", "associés à TamAssur, le dispositif d’épargne des conducteurs."),
    ("conducteurs pour le dispositif d’épargne, sans considérer", "conducteurs pour TamAssur, le dispositif d’épargne, sans considérer"),
])
patch('partie4.html', [
    ("TamPass (courses récurrentes) et épargne chauffeur côté application, à formaliser avec NSIA.",
     "TamPass (courses récurrentes) et TamAssur (épargne chauffeur) côté application, à formaliser avec NSIA."),
    ("<td>Épargne chauffeur (côté application) et bonus de volume", "<td>TamAssur, l’épargne chauffeur (côté application), et bonus de volume"),
    ('<span class="pill">Mécanisme d’épargne · NSIA Assurances</span>', '<span class="pill">TamAssur · NSIA Assurances</span>'),
    ("TamCar envisage également un mécanisme d’épargne destiné aux chauffeurs partenaires.",
     "TamCar envisage également un mécanisme d’épargne, <strong>TamAssur</strong>, destiné aux chauffeurs partenaires."),
    ("TamPass et le mécanisme d’épargne envisagé pour les chauffeurs pourront", "TamPass et TamAssur, le mécanisme d’épargne envisagé pour les chauffeurs, pourront"),
])
patch('partie6.html', [
    ("De même, les dispositifs d’épargne ou les partenariats financiers envisagés", "De même, TamAssur et les partenariats financiers envisagés"),
])
print('ok')
