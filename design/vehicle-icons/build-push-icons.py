"""Icônes des notifications Web Push de course : ride-<type>.png (192 x 192, pastille bleue, véhicule blanc) et
badge-<type>.png (96 x 96, véhicule blanc sur fond transparent, pour la barre d'état Android).

Usage : python design/vehicle-icons/build-push-icons.py   (Chrome requis : rendu SVG -> PNG)
Source des tracés : design/vehicle-icons/icons.json
"""
import json
import pathlib
import subprocess
import tempfile

ICI = pathlib.Path(__file__).parent
RACINE = ICI.parent.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SORTIE = RACINE / "apps" / "client" / "public" / "icons"
icones = json.loads((ICI / "icons.json").read_text(encoding="utf-8"))
SOUS = {"car": "car", "moto": "moto", "tricycle": "tricycle"}


def svg(nom, taille, trait, avec_pastille):
    chemins = "".join(f'<path d="{d}"/>' for d in icones[nom])
    fond = (
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563EB"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient></defs>'
        f'<circle cx="12" cy="12" r="12" fill="url(#g)"/>' if avec_pastille else ""
    )
    # la pastille : le véhicule occupe 70 % du disque ; le badge : 100 % de la zone utile
    g = '<g transform="translate(3.6 3.6) scale(0.7)">' if avec_pastille else '<g>'
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="{taille}" height="{taille}">{fond}{g}'
        f'<g fill="none" stroke="{trait}" stroke-width="{1.9 if avec_pastille else 2.2}" stroke-linecap="round" stroke-linejoin="round">{chemins}</g></g></svg>'
    )


def rendre(contenu_svg, taille, destination):
    with tempfile.TemporaryDirectory() as tmp:
        page = pathlib.Path(tmp) / "i.html"
        page.write_text(f'<html><body style="margin:0;background:transparent">{contenu_svg}</body></html>', encoding="utf-8")
        subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
             f"--window-size={taille},{taille}", f"--screenshot={destination}", page.as_uri()],
            check=True, capture_output=True,
        )


for nom in SOUS:
    rendre(svg(nom, 192, "#FFFFFF", True), 192, SORTIE / f"ride-{nom}.png")
    rendre(svg(nom, 96, "#FFFFFF", False), 96, SORTIE / f"badge-{nom}.png")
    print("OK", nom)
