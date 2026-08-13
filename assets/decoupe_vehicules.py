"""Découpe la planche 5x2 des véhicules en 10 marqueurs PNG détourés.

La planche est un rendu photoréaliste sur fond blanc opaque, avec ombre
portée douce. Trois étapes, toutes à pleine résolution avant réduction :

  1. Remplissage depuis les bords : seul le blanc CONNECTÉ au bord devient
     transparent. La carrosserie de la berline blanche est préservée.
  2. Érosion du masque : l'ombre portée est trop claire pour le seuil du
     remplissage et laissait un halo irrégulier. On rogne la silhouette.
  3. Contour blanc uniforme de 3 px : traitement habituel des marqueurs
     photoréalistes, il détache le véhicule de n'importe quel fond de
     carte. L'ombre, elle, est laissée au CSS (drop-shadow).
"""
import os
from PIL import Image, ImageDraw, ImageFilter

SRC = r"D:\TERENCE\TamCar\App\assets\icones-vehicules.png"
OUT = r"D:\TERENCE\TamCar\App\assets\vehicules"
COLS, ROWS = 5, 2
TOL = 32          # tolérance du remplissage
SENTINEL = (255, 0, 255)
ERODE = 15        # rognage du halo, en pixels source (~3x la sortie)
STROKE = 9        # épaisseur du contour blanc, en pixels source
TARGET_H = 160    # hauteur d'export (marqueur ~40 px sur écran 3x)

# Colonne -> catégorie ; rangée 0 = véhicule seul, rangée 1 = avec chauffeur
NAMES = ["essentiel", "confort", "premium", "moto", "tricycle"]

os.makedirs(OUT, exist_ok=True)
sheet = Image.open(SRC).convert("RGB")
W, H = sheet.size

# 1. Détourage global depuis les quatre coins.
work = sheet.copy()
for corner in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)]:
    ImageDraw.floodfill(work, corner, SENTINEL, thresh=TOL)

mask = Image.new("L", (W, H), 0)
px_work, px_mask = work.load(), mask.load()
for y in range(H):
    for x in range(W):
        if px_work[x, y] != SENTINEL:
            px_mask[x, y] = 255

report = []
for row in range(ROWS):
    for col in range(COLS):
        box = (
            round(col * W / COLS), round(row * H / ROWS),
            round((col + 1) * W / COLS), round((row + 1) * H / ROWS),
        )
        rgb_cell = sheet.crop(box)
        m = mask.crop(box)

        # 2. Érosion : MinFilter sur une taille impaire = rognage.
        k = ERODE if ERODE % 2 else ERODE + 1
        core = m.filter(ImageFilter.MinFilter(k))

        # 3. Contour : dilatation du noyau, en blanc, sous le véhicule.
        ks = STROKE if STROKE % 2 else STROKE + 1
        outline = core.filter(ImageFilter.MaxFilter(ks))

        sprite = Image.new("RGBA", rgb_cell.size, (0, 0, 0, 0))
        sprite.paste(Image.new("RGBA", rgb_cell.size, (255, 255, 255, 255)),
                     (0, 0), outline)
        sprite.paste(rgb_cell.convert("RGBA"), (0, 0), core)

        bbox = sprite.getbbox()
        if bbox is None:
            report.append((row, col, "VIDE"))
            continue
        sub = sprite.crop(bbox)

        scale = TARGET_H / sub.height
        sub = sub.resize(
            (max(1, round(sub.width * scale)), TARGET_H), Image.LANCZOS
        )

        name = NAMES[col] + ("" if row == 0 else "-chauffeur")
        path = os.path.join(OUT, name + ".png")
        sub.save(path, optimize=True)
        report.append((name, sub.size, os.path.getsize(path)))

for r in report:
    print(r)
