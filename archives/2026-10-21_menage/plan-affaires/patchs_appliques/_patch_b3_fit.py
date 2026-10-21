from _patchlib import Fichier

s = Fichier('source.html')
s.rep("""<strong>Pourquoi WhatsApp.</strong> Toute la population connectée du Bénin est sur WhatsApp.
      Commander un transport depuis une messagerie que l’on pratique déjà est hyper simple pour
      quiconque, qu’il soit ou non à l’aise avec les nouvelles applications. <strong>Tout le
      processus de commande se fera par WhatsApp.</strong>""",
      """<strong>Pourquoi WhatsApp.</strong> Toute la population connectée du Bénin y est : commander un
      transport depuis une messagerie déjà pratiquée est hyper simple pour quiconque, novice ou non.
      <strong>Tout le processus de commande se fera par WhatsApp.</strong>""")
s.ecrire()

g = Fichier('gen_partie7.py')
g.rep("""Le cas B ajoute cinq motos aux dix tricycles du cas A. Pour <strong>{n(D_INV)} FCFA</strong> d’investissement
        supplémentaire, il rapporte <strong>{mm(D_REV, 1, False)} de revenus en plus</strong> sur 36 mois, supprime les
        <strong>{A['tres_neg']} mois de trésorerie négative</strong> du cas A et ramène le seuil de trésorerie positive
        de {pct(SEUIL_A, 0)} à {pct(SEUIL_B, 0)} de l’objectif.""",
      """Le cas B ajoute cinq motos aux dix tricycles du cas A. Pour <strong>{n(D_INV)} FCFA</strong> d’investissement
        en plus, il rapporte <strong>{mm(D_REV, 1, False)} de revenus supplémentaires</strong> sur 36 mois et supprime les
        <strong>{A['tres_neg']} mois de trésorerie négative</strong> du cas A.""")
g.rep("""C’est la solution la plus rémunératrice et la plus sûre pour TamCar : chaque franc investi dans les motos
        rapporte <strong>{RENDEMENT_TXT}</strong> F de trésorerie supplémentaire à 36 mois, et le risque qu’elles portent est
        limité par un bilan à trois mois.""",
      """C’est la solution la plus rémunératrice et la plus sûre pour TamCar : chaque franc investi dans les motos
        rapporte <strong>{RENDEMENT_TXT}</strong> F de trésorerie supplémentaire à 36 mois, avec un risque limité par un bilan à trois mois.""")
g.rep("""<p>Les motos ajoutent {mm(D_REV, 1, False)} de revenus sur 36 mois, dont {mm(B['fonds'], 1, False)} de fonds de rachat encaissés à leur cession au mois 25. Après la cession, elles rapportent encore {n(fin_moto_commissions)} F de commissions par mois.</p>""",
      """<p>{mm(D_REV, 1, False)} de revenus en plus sur 36 mois, dont {mm(B['fonds'], 1, False)} de fonds de rachat encaissés à la cession (mois 25), puis {n(fin_moto_commissions)} F de commissions par mois.</p>""")
g.rep("""<p>Le cas B garde une trésorerie positive tous les mois : point bas de {mm(B['mini'])} au mois {B['mois_mini']}. Le cas A passe {A['tres_neg']} mois sous zéro, avec un point bas de {mm(A['mini'])} au mois {A['mois_mini']}.</p>""",
      """<p>Trésorerie positive tous les mois : point bas de {mm(B['mini'])} au mois {B['mois_mini']}. Le cas A passe {A['tres_neg']} mois sous zéro (point bas de {mm(A['mini'])}).</p>""")
g.rep("""<p>La trésorerie est positive dès {pct(SEUIL_B, 0)} de l’objectif, contre {pct(SEUIL_A, 0)} dans le cas A. Dans le scénario prudent, les motos réduisent le besoin de financement de {mm(D_PRU, 1, False)}.</p>""",
      """<p>Trésorerie positive dès {pct(SEUIL_B, 0)} de l’objectif, contre {pct(SEUIL_A, 0)}. Dans le scénario prudent, les motos réduisent le besoin de financement de {mm(D_PRU, 1, False)}.</p>""")
g.rep("""<p>Les motos s’adressent à la clientèle du zémidjan à Cotonou (3.4.2), avec une cession au chauffeur en 24 mois, soit plus vite que pour un tricycle (36 mois).</p>""",
      """<p>La clientèle du zémidjan à Cotonou (3.4.2) ; cession au chauffeur en 24 mois, contre 36 pour un tricycle.</p>""")
g.rep("""<strong>Le risque est borné.</strong> Si les motos ne roulent pas, le point bas atteint {mm(mi0)} (mois {mo0}) et le plan finit à {mm(fi0)}.
      Le bilan à trois mois mesure leurs recettes réelles avant tout engagement supplémentaire (8.8).""",
      """<strong>Le risque est borné.</strong> Si les motos ne roulent pas, le point bas atteint {mm(mi0)} (mois {mo0}) et le plan finit à {mm(fi0)} ; le bilan à trois mois le détecte (8.8).""")
g.rep("""<strong>Décision.</strong> Le plan retient le cas B pour la levée de 15 000 000 FCFA : 10 tricycles livrés en deux lots (Cotonou au mois 1,
      Parakou au mois 7) et 5 motos à Cotonou dès le mois 1. Si la levée est inférieure, la flotte s’adapte comme au 7.9.""",
      """<strong>Décision.</strong> Le plan retient le cas B pour la levée de 15 000 000 FCFA : 10 tricycles en deux lots (Cotonou au mois 1,
      Parakou au mois 7) et 5 motos à Cotonou dès le mois 1. Si la levée est inférieure, la flotte s’adapte (7.9).""")
g.ecrire()
