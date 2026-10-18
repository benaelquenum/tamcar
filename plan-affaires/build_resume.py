"""Fabrique le résumé du plan d'affaires (10 pages) : resume.html -> resume.pdf.

Même chaîne que build.py : icônes, typographie française, césure, numérotation
des pages (la couverture ne compte pas), rendu PDF par Chrome sans en-tête.
resume.html est généré par gen_resume.py (pages 4 à 10 recalculées depuis modele_v6, comme le plan complet).
Livrables : TamCar_resume_plan_affaires_v6.html et .pdf ; les versions précédentes sont dans ../archives/.

Usage :  python build_resume.py
"""
import pathlib
import re
import subprocess
import sys

ICI = pathlib.Path(__file__).parent
sys.path.insert(0, str(ICI))
import build                      # icônes, typographie, césure, chemin de Chrome
import modele_v6


def main() -> None:
    subprocess.run([sys.executable, str(ICI / "gen_resume.py")], check=True, cwd=str(ICI))
    html = (ICI / "resume.html").read_text(encoding="utf-8")

    html = html.replace("{{chart:tresorerie}}", modele_v6.svg_tresorerie_plan())

    def icone(m: re.Match) -> str:
        nom = m.group(1)
        if nom not in build.ICONES:
            raise SystemExit(f"Icône inconnue : {nom}")
        return build.ICONES[nom]
    html = re.sub(r"\{\{ico:([\w-]+)\}\}", icone, html)

    html = build.appliquer_typographie(html)
    html = build.cesure(html)

    total = html.count("<!--PN-->")
    for n in range(1, total + 1):
        html = html.replace("<!--PN-->", str(n), 1)
    html = html.replace("<!--TOTAL-->", str(total))

    sortie_html = ICI / "resume-plan-affaires.html"
    sortie_html.write_text(html, encoding="utf-8")

    sortie_pdf = ICI / "resume-plan-affaires.pdf"
    if sortie_pdf.exists():
        sortie_pdf.unlink()
    cmd = [build.CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
           f"--print-to-pdf={sortie_pdf}", sortie_html.as_uri()]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if not sortie_pdf.exists():
        raise SystemExit("Échec du rendu PDF :\n" + (r.stderr or r.stdout))
    print(f"HTML : {sortie_html.name} ({total} pages numérotées + couverture)")
    print(f"PDF  : {sortie_pdf.name} ({sortie_pdf.stat().st_size // 1024} Ko)")
    import shutil
    shutil.copyfile(sortie_pdf, ICI / f"TamCar_resume_plan_affaires_{build.VERSION}.pdf")
    autonome = build.version_autonome(html, f"TamCar_resume_plan_affaires_{build.VERSION}.html")
    print(f"Livrés : TamCar_resume_plan_affaires_{build.VERSION}.pdf, {autonome.name}")


if __name__ == "__main__":
    main()
