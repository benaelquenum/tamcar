"""BENAEL, société mère, remplace « la structure du fondateur » dans le plan et le résumé (2026-10-23).

BENAEL (SARL à associé unique, RCCM du 08/10/2026) apporte la plateforme à la société d'exploitation ; le fondateur lui cède ses droits.
"""
import re

from _patchlib import Fichier

PAIRES = [
    # (ancien, nouveau) — tolérant aux retours à la ligne grâce à _patchlib
    ("par la structure unipersonnelle du fondateur, qui détient les droits correspondants. Cette structure apportera la plateforme",
     "par BENAEL, société unipersonnelle du fondateur, qui détient les droits correspondants. BENAEL apportera la plateforme"),
    ("conçu et financé par la structure du fondateur", "conçu et financé par BENAEL, société du fondateur"),
    ("La structure unipersonnelle du fondateur sera associée de la nouvelle société",
     "BENAEL, société unipersonnelle du fondateur, sera associée de la nouvelle société"),
    ("par l’intermédiaire de sa structure", "par l’intermédiaire de BENAEL"),
    ("<span>structure du fondateur</span><span>investisseur</span>", "<span>BENAEL</span><span>investisseur</span>"),
    ("répartition de 60 % pour la structure du fondateur", "répartition de 60 % pour BENAEL"),
    ("rémunération de la structure du fondateur pour la plateforme", "rémunération de BENAEL pour la plateforme"),
    ("conçue et financée par la structure unipersonnelle du fondateur, qui détient les droits correspondants. Son apport",
     "conçue et financée par BENAEL, société unipersonnelle du fondateur, qui détient les droits correspondants. Son apport"),
]

# ------------------------------------------------------------------ source.html
src = Fichier('source.html')
for a, b in PAIRES:
    if re.search(r'\s+'.join(re.escape(j) for j in a.split()), src.s):
        src.rep(a, b)
src.ecrire()

# ------------------------------------------------------------------ page 2.10
g2 = Fichier('gen_partie2b.py')
g2.rep("<strong>60 % pour la structure du fondateur</strong>", "<strong>60 % pour BENAEL, société du fondateur</strong>")
g2.rep("<th>Part du fondateur si retenue</th>", "<th>Part de BENAEL si retenue</th>")
g2.rep("<strong>Lecture.</strong> Part du fondateur = valeur", "<strong>Lecture.</strong> Part de BENAEL = valeur")
g2.rep("elles font la valeur de l’apport, avec la marque et le savoir-faire.",
       "elles font la valeur de l’apport, avec la marque et le savoir-faire. Le fondateur les cède à BENAEL, qui apporte la plateforme (liste fermée en annexe du dossier d’évaluation).")
g2.ecrire()

# ------------------------------------------------------------------ résumé
rb = Fichier('resume_base_v5.html')
rb.rep("par la structure du fondateur, qui en détient les droits ; elle est apportée en nature à la société d’exploitation.",
       "par BENAEL, société du fondateur, qui en détient les droits ; elle l’apporte en nature à la société d’exploitation.")
rb.rep("la structure du fondateur détient <strong>60 %</strong> par l’apport en nature de la plateforme.",
       "BENAEL, société du fondateur, détient <strong>60 %</strong> par l’apport en nature de la plateforme.")
rb.ecrire()
gr = Fichier('gen_resume.py')
gr.rep("la structure du fondateur détient <strong>60 %</strong> par l’apport en nature de la plateforme.",
       "BENAEL, société du fondateur, détient <strong>60 %</strong> par l’apport en nature de la plateforme.")
gr.ecrire()
