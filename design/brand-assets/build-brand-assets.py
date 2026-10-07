"""Actifs de marque dérivés des logos existants (revue du 2026-10-07).

Constats de la revue :
  - icône PWA du client : logo + nom trop petits dans un grand carré blanc (illisible sur un écran d'accueil) ;
  - aucune icône iOS (apple-touch-icon) pour le client, aucune pour le site ;
  - favicon du site : logo + nom à 16 px = illisible ; pas d'image de partage (Open Graph) ;
  - écrans de démarrage des deux apps Android : logo minuscule (≈ 12 % de la largeur) ;
  - aucune icône de notification dédiée (Android : icône générique ; Web Push : icône de Chrome).

Sorties (toutes régénérables : python design/brand-assets/build-brand-assets.py) :
  apps/client/public/icons/{icon-192,icon-512,icon-maskable-512,badge-tamcar}.png, apps/client/public/apple-touch-icon.png
  apps/driver-portal/public/icons/badge-tamcar.png
  apps/site/public/{favicon.ico,icon.png,apple-touch-icon.png,og-image.png}, apps/back-office/public/favicon.ico
  mobile-client/assets/{splash,splash-dark}.png, mobile-driver/assets/{splash,splash-dark}.png
  mobile-{client,driver}/native/res/drawable-*dpi/ic_stat_tamcar.png (icône de notification, silhouette blanche)
  mobile-{client,driver}/native/res/drawable-nodpi/ic_splash_mark.png + values/tamcar_splash.xml (démarrage système Android 12+)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
BLUE = (37, 99, 235, 255)       # primary/500 #2563EB
ROYAL = (2, 85, 252, 255)       # fond des icônes chauffeur #0255FC
WHITE = (255, 255, 255, 255)


def trim(im):
    bb = im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
    return im.crop(bb)


def fit_width(im, width):
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def on_canvas(size, bg, im, frac, dy=0.0):
    canvas = Image.new('RGBA', (size, size), bg)
    m = fit_width(im, round(size * frac))
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2 + round(size * dy)))
    return canvas


def silhouette(im, color=(255, 255, 255)):
    a = im.getchannel('A')
    out = Image.new('RGBA', im.size, color + (0,))
    out.putalpha(a)
    return out


MARK = trim(Image.open(ROOT / 'apps/client/public/logo-mark.png').convert('RGBA'))             # symbole bleu / cyan
WORD = trim(Image.open(ROOT / 'apps/client/public/logo.png').convert('RGBA'))                 # symbole + « TamCar »
WORD_WHITE = trim(Image.open(ROOT / 'apps/client/public/logo-white.png').convert('RGBA'))     # idem en blanc
DRIVER_MARK_WHITE = trim(Image.open(ROOT / 'mobile-driver/assets/icon-foreground.png').convert('RGBA'))  # symbole blanc avec volant

# ---------------------------------------------------------------- client : PWA
icons = ROOT / 'apps/client/public/icons'
for size, name, frac in ((192, 'icon-192.png', 0.64), (512, 'icon-512.png', 0.64), (512, 'icon-maskable-512.png', 0.50)):
    on_canvas(size, WHITE, MARK, frac).convert('RGB').save(icons / name, optimize=True)
on_canvas(180, WHITE, MARK, 0.68).convert('RGB').save(ROOT / 'apps/client/public/apple-touch-icon.png', optimize=True)

# icône de badge Web Push (barre d'état Android) : silhouette blanche sur fond transparent
badge = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
m = fit_width(silhouette(MARK), 84)
badge.alpha_composite(m, ((96 - m.width) // 2, (96 - m.height) // 2))
badge.save(icons / 'badge-tamcar.png', optimize=True)
badge.save(ROOT / 'apps/driver-portal/public/icons/badge-tamcar.png', optimize=True)

# ---------------------------------------------------------------- site + back-office : favicon, iOS, partage
def favicon(path):
    base = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    m = fit_width(MARK, 244)
    base.alpha_composite(m, ((256 - m.width) // 2, (256 - m.height) // 2))
    base.save(path, sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])


favicon(ROOT / 'apps/site/public/favicon.ico')
favicon(ROOT / 'apps/back-office/public/favicon.ico')
on_canvas(512, WHITE, MARK, 0.64).convert('RGB').save(ROOT / 'apps/site/public/icon.png', optimize=True)
on_canvas(180, WHITE, MARK, 0.68).convert('RGB').save(ROOT / 'apps/site/public/apple-touch-icon.png', optimize=True)

FONT_BOLD = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 54)
FONT_REG = ImageFont.truetype(r'C:\Windows\Fonts\segoeui.ttf', 34)
og = Image.new('RGBA', (1200, 630), BLUE)
px = og.load()
for y in range(630):                       # dégradé diagonal discret : bleu roi -> bleu profond, touche cyan en bas à droite
    for x in range(1200):
        t = (x / 1200 * 0.55 + y / 630 * 0.45)
        r = round(37 + (29 - 37) * t); g = round(99 + (78 - 99) * t); b = round(235 + (216 - 235) * t)
        px[x, y] = (r, g, b, 255)
glow = Image.new('RGBA', (1200, 630), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse((820, 330, 1400, 910), fill=(6, 182, 212, 70))
og.alpha_composite(glow)
logo = fit_width(WORD_WHITE, 360)
og.alpha_composite(logo, ((1200 - logo.width) // 2, 70))
d = ImageDraw.Draw(og)
for text, font, y in (('Ta course est claire, ta course éclair.', FONT_BOLD, 400), ('Le VTC du Bénin · prix fixe garanti · jamais de surge', FONT_REG, 490)):
    w = d.textlength(text, font=font)
    d.text(((1200 - w) / 2, y), text, font=font, fill=WHITE)
og.convert('RGB').save(ROOT / 'apps/site/public/og-image.png', optimize=True)

# ---------------------------------------------------------------- écrans de démarrage (sources 2732 x 2732 pour @capacitor/assets)
def splash(path, bg, content, frac, label=None):
    s = 2732
    canvas = Image.new('RGBA', (s, s), bg)
    c = fit_width(content, round(s * frac))
    y = (s - c.height) // 2 - (60 if label else 0)
    canvas.alpha_composite(c, ((s - c.width) // 2, y))
    if label:
        f = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 150)
        d2 = ImageDraw.Draw(canvas)
        w = d2.textlength(label, font=f)
        d2.text(((s - w) / 2, y + c.height + 90), label, font=f, fill=(255, 255, 255, 235))
    canvas.convert('RGB').save(path, optimize=True)


# client : fond blanc, symbole + nom en couleurs, 36 % de la largeur
for name in ('splash.png', 'splash-dark.png'):
    splash(ROOT / 'mobile-client/assets' / name, WHITE, WORD, 0.36)
# chauffeur : fond bleu roi de l'icône, symbole blanc avec volant + « TamCar Pro »
for name in ('splash.png', 'splash-dark.png'):
    splash(ROOT / 'mobile-driver/assets' / name, ROYAL, DRIVER_MARK_WHITE, 0.30, label='TamCar Pro')

# ---------------------------------------------------------------- icône de notification Android (silhouette blanche)
sil = silhouette(MARK)
for density, px_size in (('mdpi', 24), ('hdpi', 36), ('xhdpi', 48), ('xxhdpi', 72), ('xxxhdpi', 96)):
    for app in ('mobile-client', 'mobile-driver'):
        d3 = ROOT / app / 'native' / 'res' / f'drawable-{density}'
        d3.mkdir(parents=True, exist_ok=True)
        icon = Image.new('RGBA', (px_size, px_size), (0, 0, 0, 0))
        m2 = fit_width(sil, round(px_size * 0.92))
        icon.alpha_composite(m2, ((px_size - m2.width) // 2, (px_size - m2.height) // 2))
        icon.save(d3 / 'ic_stat_tamcar.png', optimize=True)

# ---------------------------------------------------------------- démarrage système Android 12+ (icône + fond du SplashScreen API)
for app, content, bg_hex in (('mobile-client', MARK, '#FFFFFF'), ('mobile-driver', DRIVER_MARK_WHITE, '#0255FC')):
    d4 = ROOT / app / 'native' / 'res' / 'drawable-nodpi'
    d4.mkdir(parents=True, exist_ok=True)
    canvas = Image.new('RGBA', (1152, 1152), (0, 0, 0, 0))   # 288 dp à xxxhdpi ; le cercle visible fait 2/3 de la zone
    m3 = fit_width(content, 560)
    canvas.alpha_composite(m3, ((1152 - m3.width) // 2, (1152 - m3.height) // 2))
    canvas.save(d4 / 'ic_splash_mark.png', optimize=True)
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<!-- Fond du démarrage système (Android 12+) : couleur de l'application. -->\n"
        '<resources>\n'
        f'    <color name="tamcar_splash_bg">{bg_hex}</color>\n'
        '</resources>\n'
    )
    (ROOT / app / 'native' / 'res' / 'values' / 'tamcar_splash.xml').write_text(xml, encoding='utf-8')

print('actifs de marque générés')
