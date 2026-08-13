"""Prépare les visuels de catégorie pour les cartes de commande.

Deux cas dans la livraison de Terence :
  • voiture-essentiel / confort / vip : déjà détourées (canal alpha réel) ;
  • moto / tricycle : AUCUNE transparence — le damier visible est peint
    dans l'image, pixel par pixel. C'est l'erreur d'export classique.
    On l'efface par remplissage depuis les bords : le damier est blanc et
    gris très clair (#FFFFFF / #F4F4F4), loin des bleus et des noirs du
    sujet, et seul le fond CONNECTÉ au bord est effacé — un reflet clair
    à l'intérieur du véhicule est donc préservé.

Sortie : PNG détourés, recadrés sur le sujet, redimensionnés pour un
affichage jusqu'à 160 px de large en écran 3x.
"""
import pathlib

from PIL import Image, ImageDraw

SRC = pathlib.Path(r"D:\TERENCE\TamCar\App\assets")
OUT = SRC / "categories"
DESTS = [
    pathlib.Path(r"D:\TERENCE\TamCar\App\apps\client\public\categories"),
    pathlib.Path(r"D:\TERENCE\TamCar\App\apps\driver-portal\public\categories"),
]

# fichier source -> nom de catégorie (celui du type vehicle_category)
FICHIERS = {
    "moto": "moto",
    "tricycle": "tricycle",
    "voiture-essentiel": "essentiel",
    "voiture-confort": "confort",
    "voiture-vip": "premium",
}

# Pillow ADDITIONNE les écarts des trois canaux : blanc ↔ #F4F4F4 vaut 32,
# pas 11. Le sujet le plus clair (semelle grise) est à ~105, le bleu TamCar
# à ~390 : 90 franchit le damier sans mordre sur le véhicule.
TOL = 90
SENTINEL = (255, 0, 255)
MAX_W = 480       # 160 px affichés en 3x
PAD = 4


def detoure(im: Image.Image) -> Image.Image:
    """Rend transparent le fond clair connecté aux bords."""
    rgb = im.convert("RGB")
    work = rgb.copy()
    w, h = work.size
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(work, corner, SENTINEL, thresh=TOL)

    # Les vitres sont encloses par la carrosserie : le remplissage par les
    # bords ne les atteint pas, et le damier y resterait visible. On amorce
    # donc un remplissage depuis chaque poche de damier restante. Seuil plus
    # serré (45) pour ne pas emporter un phare ou un reflet chaud.
    pw = work.load()
    for y in range(0, h, 3):
        for x in range(0, w, 3):
            r, g, b = pw[x, y][:3]
            if (r, g, b) == SENTINEL:
                continue
            if abs(255 - r) + abs(255 - g) + abs(255 - b) <= 45:
                ImageDraw.floodfill(work, (x, y), SENTINEL, thresh=45)

    out = rgb.convert("RGBA")
    po = work.load(), out.load()
    pw, po = po
    for y in range(h):
        for x in range(w):
            if pw[x, y] == SENTINEL:
                po[x, y] = (0, 0, 0, 0)
    return out


OUT.mkdir(exist_ok=True)
for d in DESTS:
    d.mkdir(parents=True, exist_ok=True)

for fichier, categorie in FICHIERS.items():
    im = Image.open(SRC / f"{fichier}.png").convert("RGBA")

    # Déjà détourée ? Le canal alpha contient alors des pixels transparents.
    if im.getchannel("A").getextrema()[0] == 255:
        im = detoure(im)
        etat = "détourée"
    else:
        etat = "alpha fourni"

    bbox = im.getbbox()
    if bbox:
        x0, y0, x1, y1 = bbox
        im = im.crop((
            max(0, x0 - PAD), max(0, y0 - PAD),
            min(im.width, x1 + PAD), min(im.height, y1 + PAD),
        ))

    if im.width > MAX_W:
        ratio = MAX_W / im.width
        im = im.resize((MAX_W, max(1, round(im.height * ratio))), Image.LANCZOS)

    # PNG conservé dans assets/ (archive), WebP livré aux applications :
    # une photo détourée pèse 3 à 5 fois moins en WebP, et c'est le forfait
    # data du client béninois qui paie la différence à chaque ouverture.
    png = OUT / f"{categorie}.png"
    im.save(png, optimize=True)
    webp = OUT / f"{categorie}.webp"
    im.save(webp, format="WEBP", quality=85, method=6)
    for d in DESTS:
        im.save(d / f"{categorie}.webp", format="WEBP", quality=85, method=6)
    print(f"{categorie:11s} {etat:14s} {str(im.size):11s} "
          f"png {png.stat().st_size // 1024:3d} Ko -> webp {webp.stat().st_size // 1024:3d} Ko")
