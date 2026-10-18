"""Aides de patch : remplacement tolérant aux retours à la ligne et aux indentations."""
import pathlib
import re

ICI = pathlib.Path(__file__).parent


def _motif(texte):
    jetons = re.split(r'\s+', texte.strip())
    return re.compile(r'\s+'.join(re.escape(j) for j in jetons))


class Fichier:
    def __init__(self, nom):
        self.chemin = ICI / nom
        self.s = self.chemin.read_text(encoding='utf-8')
        self.nom = nom

    def rep(self, ancien, nouveau, tous=False):
        rx = _motif(ancien)
        n = len(rx.findall(self.s))
        assert n >= 1, (self.nom, 'introuvable', ancien[:90])
        assert tous or n == 1, (self.nom, f'{n} occurrences', ancien[:90])
        self.s = rx.sub(lambda m: nouveau, self.s)

    def span(self, debut, fin, nouveau):
        """Remplace de `debut` jusqu'à `fin` inclus (première occurrence de fin après debut)."""
        d = _motif(debut).search(self.s)
        assert d, (self.nom, 'début introuvable', debut[:90])
        f = _motif(fin).search(self.s, d.end())
        assert f, (self.nom, 'fin introuvable', fin[:90])
        self.s = self.s[:d.start()] + nouveau + self.s[f.end():]

    def supprimer(self, texte):
        self.rep(texte, '')

    def ecrire(self):
        self.chemin.write_text(self.s, encoding='utf-8')
        print(self.nom, 'ok')
