import pathlib


def patch(nom, paires):
    p = pathlib.Path(nom)
    s = p.read_text(encoding='utf-8')
    for old, new in paires:
        assert old in s, (nom, old[:80])
        s = s.replace(old, new, 1)
    p.write_text(s, encoding='utf-8')


patch('partie5.html', [
    ("    Paiement négocié avec le fournisseur : 30 % à la commande de chaque lot (2 250 000 F), solde sur\n    18 mois (en cours de négociation). Détail au 6.4.",
     "    Paiement convenu avec le fournisseur : 30 % à la commande de chaque lot (2 250 000 F), solde sur\n    18 mois, sans intérêts. Détail au 6.4."),
])
patch('partie6.html', [
    ("Paiement en cours de négociation avec le fournisseur, sans intérêts dans ce calcul. Chaque lot",
     "Paiement convenu avec le fournisseur, sans intérêts. Chaque lot"),
])
patch('gen_partie8.py', [
    ("TamCar négocie avec le fournisseur un paiement de 30 % à la commande de chaque lot, le solde sur 18 mois, sans intérêts dans ce calcul.",
     "Le fournisseur accorde à TamCar un paiement de <strong>30 % à la commande</strong> de chaque lot et le <strong>solde sur 18 mois</strong>, sans intérêts."),
])
print('ok')
