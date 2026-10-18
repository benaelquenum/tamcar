"""Habillage des véhicules TamCar : planche visuelle (voitures, motos, tricycles).

Usage :  python build_habillage.py
Sortie : ../TamCar_habillage_vehicules.html et .pdf (à la racine du dépôt)

Schémas de principe en vectoriel (1 unité = 1 cm, donc les plaques sont à l'échelle des véhicules). Les teintes et
les dimensions sont à valider sur échantillon avec l'imprimeur. Le logo vient de assets/ (variante blanche officielle).
"""
import base64
import pathlib
import subprocess

ICI = pathlib.Path(__file__).parent
RACINE = ICI.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

b64 = lambda p: base64.b64encode((ICI / "assets" / p).read_bytes()).decode()
LOGO_W = b64("logo-blanc.png")
LOGO_C = b64("logo-couleur.png")
ICON_W = b64("icone-blanc.png")

BLEU, BLEU7, BLEU9, CYAN = "#2563EB", "#1D4ED8", "#1E3A8A", "#06B6D4"
NUM = "TC-0123"
FONT = "'Sora','Segoe UI',Arial,sans-serif"

# --------------------------------------------------------------------------------------------- définitions globales
DEFS = f"""
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <linearGradient id="plq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{BLEU}"/><stop offset="1" stop-color="{BLEU7}"/></linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".26"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b5272"/><stop offset=".55" stop-color="#1f2d44"/><stop offset="1" stop-color="#2a3b57"/></linearGradient>
    <linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f172a" stop-opacity=".22"/><stop offset="1" stop-color="#0f172a" stop-opacity="0"/></linearGradient>
  </defs>
  <symbol id="logo-w" viewBox="0 0 578 460"><image href="data:image/png;base64,{LOGO_W}" width="578" height="460"/></symbol>
  <symbol id="logo-wm" viewBox="0 314 578 146"><image href="data:image/png;base64,{LOGO_W}" width="578" height="460"/></symbol>
  <symbol id="icon-w" viewBox="0 0 370 295"><image href="data:image/png;base64,{ICON_W}" width="370" height="295"/></symbol>
</svg>
"""


# --------------------------------------------------------------------------------------------- pièces du kit (unités = cm)
def plaque(x, y, w=50, h=30, extra=""):
    """Plaque de porte : fond bleu, filet blanc (visible aussi sur une carrosserie bleue), logo blanc."""
    return (
        f'<g transform="translate({x} {y})"{extra}><rect width="{w}" height="{h}" rx="{h*0.12:.1f}" fill="url(#plq)" stroke="#fff" stroke-width="{h*0.05:.1f}"/>'
        f'<use href="#logo-w" x="{w*0.16}" y="{h*0.07}" width="{w*0.68}" height="{h*0.86}"/></g>'
    )


def chip(x, y, w=50, h=16, text=NUM):
    return (
        f'<g transform="translate({x} {y})"><rect width="{w}" height="{h}" rx="{h*0.25:.1f}" fill="url(#plq)" stroke="#fff" stroke-width="{h*0.07:.1f}"/>'
        f'<text x="{w/2}" y="{h*0.73:.1f}" text-anchor="middle" font-family="{FONT}" font-weight="800" font-size="{h*0.6:.1f}" fill="#fff" letter-spacing=".3">{text}</text></g>'
    )


def band(x, y, w=100, h=10):
    """Bandeau de pare-brise : bleu, filet blanc, icône + mot-symbole blancs."""
    return (
        f'<g transform="translate({x} {y})"><rect width="{w}" height="{h}" rx="1.6" fill="url(#plq)" stroke="#fff" stroke-width=".5"/>'
        f'<use href="#icon-w" x="{w/2-17}" y="{h*0.12}" width="{h*0.76*1.25:.1f}" height="{h*0.76:.1f}"/>'
        f'<use href="#logo-wm" x="{w/2-5}" y="{h*0.14}" width="{h*0.72*578/146:.1f}" height="{h*0.72:.1f}"/></g>'
    )


def sticker(x, y, w=40, h=20):
    """Autocollant arrière : logo à gauche, numéro de flotte à droite."""
    return (
        f'<g transform="translate({x} {y})"><rect width="{w}" height="{h}" rx="2.4" fill="url(#plq)" stroke="#fff" stroke-width=".9"/>'
        f'<use href="#logo-w" x="{w*0.05}" y="{h*0.08}" width="{w*0.46}" height="{h*0.84}"/>'
        f'<text x="{w*0.76}" y="{h*0.46:.1f}" text-anchor="middle" font-family="{FONT}" font-weight="800" font-size="{h*0.2:.1f}" fill="#9bd8f5">TC</text>'
        f'<text x="{w*0.76}" y="{h*0.78:.1f}" text-anchor="middle" font-family="{FONT}" font-weight="800" font-size="{h*0.3:.1f}" fill="#fff">0123</text></g>'
    )


def callout(x, y, letter, tx, ty):
    """Pastille repère (lettre) reliée à un point de la pièce."""
    return (
        f'<line x1="{x}" y1="{y}" x2="{tx}" y2="{ty}" stroke="#0F172A" stroke-width=".7"/><circle cx="{tx}" cy="{ty}" r="1.6" fill="#0F172A"/>'
        f'<circle cx="{x}" cy="{y}" r="6.2" fill="#fff" stroke="#0F172A" stroke-width="1"/>'
        f'<text x="{x}" y="{y+2.9}" text-anchor="middle" font-family="{FONT}" font-weight="800" font-size="8.5" fill="#0F172A">{letter}</text>'
    )


def wheel(cx, cy, r):
    spokes = "".join(
        f'<line x1="{cx}" y1="{cy}" x2="{cx + r*0.6*__import__("math").cos(a*1.2566):.1f}" y2="{cy + r*0.6*__import__("math").sin(a*1.2566):.1f}" stroke="#8d96a1" stroke-width="{r*0.07:.1f}"/>'
        for a in range(5)
    )
    return (
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#171c23"/><circle cx="{cx}" cy="{cy}" r="{r*0.64:.1f}" fill="#d3d8de" stroke="#98a1ab" stroke-width="{r*0.05:.1f}"/>'
        f'{spokes}<circle cx="{cx}" cy="{cy}" r="{r*0.14:.1f}" fill="#6b7480"/>'
    )


def svg(vb, inner, cls=""):
    return f'<svg viewBox="{vb}" class="{cls}" xmlns="http://www.w3.org/2000/svg">{inner}</svg>'


# --------------------------------------------------------------------------------------------- voitures : vue de côté
SEDAN = (
    "M20 124 C14 118 12 104 16 96 C18 90 22 88 30 87 L112 82 C132 81 142 80 150 77 C166 56 182 42 206 38 L296 36 "
    "C322 38 340 58 356 78 L438 90 C458 93 468 100 469 112 L468 124 Z"
)
HATCH = (
    "M44 124 C38 118 36 104 40 96 L46 86 C62 70 100 44 138 38 L252 36 C276 38 292 58 304 78 L392 90 "
    "C410 93 420 100 421 112 L420 124 Z"
)

BODIES = {
    "sedan": dict(
        path=SEDAN, wheels=[(102, 121, 31), (374, 121, 31)], arch=37,
        glass=["M160 76 C172 58 186 46 206 42 L236 41 L236 76 Z", "M244 41 L296 40 C316 42 330 58 342 76 L244 76 Z"],
        lines=["M150 79 L148 123", "M240 42 L240 124", "M346 80 L342 123"],
        handles=[(252, 86), (160, 86)], head="M440 92 L466 100 L466 106 L444 102 Z", tail="M16 92 L25 90 L25 100 L15 100 Z",
        plaque=(271, 82), chip=(178, 89), roof=(235, 3), mirror=(338, 72),
    ),
    "hatch": dict(
        path=HATCH, wheels=[(110, 121, 30), (352, 121, 30)], arch=36,
        glass=["M116 76 C120 66 128 52 142 44 L192 41 L192 76 Z", "M200 41 L250 40 C270 42 286 58 296 76 L200 76 Z"],
        lines=["M112 79 L110 123", "M196 42 L196 124", "M300 80 L296 123"],
        handles=[(208, 86), (122, 86)], head="M392 92 L418 100 L418 106 L396 102 Z", tail="M40 90 L49 88 L49 98 L39 98 Z",
        plaque=(227, 82), chip=(138, 89), roof=(191, 3), mirror=(292, 72),
    ),
}


K = 1.28                       # étirement vertical de la carrosserie (hauteur réaliste : ~31 % de la longueur)
T = f"translate(0 {124*(1-K):.2f}) scale(1 {K})"


def car_side(uid, color, kind="sedan", kit=True, option=False, notes=False, number=NUM):
    b = BODIES[kind]
    s = ['<ellipse cx="245" cy="152" rx="225" ry="6" fill="url(#road)"/>']
    s.append(f'<clipPath id="{uid}-c"><path d="{b["path"]}" transform="{T}"/></clipPath>')
    body = [f'<path d="{b["path"]}" fill="{color}"/><path d="{b["path"]}" fill="url(#shade)"/>']
    for g in b["glass"]:
        body.append(f'<path d="{g}" fill="url(#glass)"/>')
    for ln in b["lines"]:
        body.append(f'<path d="{ln}" stroke="#000" stroke-opacity=".28" stroke-width=".8" fill="none"/>')
    for (hx, hy) in b["handles"]:
        body.append(f'<rect x="{hx}" y="{hy}" width="12" height="2.2" rx="1.1" fill="#000" opacity=".35"/>')
    body.append(f'<path d="{b["head"]}" fill="#f6f1d0"/><path d="{b["tail"]}" fill="#d93025"/>')
    mx, my = b["mirror"]
    body.append(f'<rect x="{mx}" y="{my}" width="14" height="7" rx="3" fill="{color}"/><rect x="{mx}" y="{my}" width="14" height="7" rx="3" fill="url(#shade)"/>')
    s.append(f'<g transform="{T}">{"".join(body)}</g>')
    arches = "".join(f'<circle cx="{cx}" cy="{cy}" r="{b["arch"]}" fill="#10151b"/>' for (cx, cy, r) in b["wheels"])
    s.append(f'<g clip-path="url(#{uid}-c)"><rect x="20" y="114" width="460" height="12" fill="#000" opacity=".3"/>{arches}</g>')
    for (cx, cy, r) in b["wheels"]:
        s.append(wheel(cx, cy, r))
    if kit:
        px, py = b["plaque"]
        s.append(plaque(px, py))
        cx_, cy_ = b["chip"]
        s.append(chip(cx_, cy_, text=number))
    if option:
        rx, ry = b["roof"]
        s.append(f'<g opacity=".9"><rect x="{rx}" y="{ry}" width="30" height="8" rx="3" fill="url(#plq)" stroke="#fff" stroke-width=".7" stroke-dasharray="2 1.4"/>'
                 f'<text x="{rx+15}" y="{ry+6}" text-anchor="middle" font-family="{FONT}" font-weight="800" font-size="5" fill="#fff">TamCar</text></g>')
    if notes:
        px, py = b["plaque"]
        cx_, cy_ = b["chip"]
        s.append(callout(px + 18, 12, "A", px + 25, py + 15))
        s.append(callout(cx_ - 20, 12, "D", cx_ + 25, cy_ + 8))
        if option:
            rx, ry = b["roof"]
            s.append(callout(rx + 104, 10, "E", rx + 29, ry + 4))
    return svg("0 0 490 160", "".join(s), "car")


def car_front(uid, color):
    s = [f'<ellipse cx="100" cy="152" rx="90" ry="5" fill="url(#road)"/>']
    s.append('<rect x="24" y="106" width="16" height="40" rx="4" fill="#171c23"/><rect x="160" y="106" width="16" height="40" rx="4" fill="#171c23"/>')
    body = "M22 96 C22 86 30 70 38 66 L56 14 C58 10 62 9 66 9 L134 9 C138 9 142 10 144 14 L162 66 C170 70 178 86 178 96 L178 128 C178 134 174 138 168 138 L32 138 C26 138 22 134 22 128 Z"
    s.append(f'<path d="{body}" fill="{color}"/><path d="{body}" fill="url(#shade)"/>')
    s.append('<path d="M60 17 L140 17 L154 64 L46 64 Z" fill="url(#glass)"/>')
    s.append(band(49.2, 17, 101.6, 10).replace('<g transform="translate(49.2 17)">', '<g transform="translate(49.2 17)" clip-path="inset(0)">'))
    s.append('<path d="M34 72 L166 72 L172 94 L28 94 Z" fill="#fff" opacity=".12"/>')
    s.append('<path d="M30 98 L60 98 L62 110 L32 108 Z" fill="#f6f1d0"/><path d="M170 98 L140 98 L138 110 L168 108 Z" fill="#f6f1d0"/>')
    s.append('<rect x="72" y="104" width="56" height="14" rx="3" fill="#10151b"/>')
    s.append('<rect x="76" y="121" width="48" height="11" rx="2" fill="#fff" stroke="#9aa3ad" stroke-width=".6"/><text x="100" y="129.4" text-anchor="middle" font-family="Arial" font-weight="700" font-size="6.2" fill="#334155">AB 1234 RB</text>')
    s.append(f'<rect x="17" y="64" width="9" height="10" rx="3" fill="{color}"/><rect x="174" y="64" width="9" height="10" rx="3" fill="{color}"/>')
    s.append(callout(100, 152, "B", 100, 22).replace('y1="152"', 'y1="146"').replace('cy="152" r="6.2"', 'cy="150" r="6.2"') if False else "")
    return svg("0 0 200 160", "".join(s), "car")


def car_rear(uid, color):
    s = [f'<ellipse cx="100" cy="152" rx="90" ry="5" fill="url(#road)"/>']
    s.append('<rect x="24" y="106" width="16" height="40" rx="4" fill="#171c23"/><rect x="160" y="106" width="16" height="40" rx="4" fill="#171c23"/>')
    body = "M22 100 C22 84 28 66 36 60 L54 16 C56 11 61 10 66 10 L134 10 C139 10 144 11 146 16 L164 60 C172 66 178 84 178 100 L178 128 C178 134 174 138 168 138 L32 138 C26 138 22 134 22 128 Z"
    s.append(f'<path d="{body}" fill="{color}"/><path d="{body}" fill="url(#shade)"/>')
    s.append('<path d="M60 19 L140 19 L152 54 L48 54 Z" fill="url(#glass)"/>')
    s.append('<path d="M24 70 L52 66 L52 82 L24 84 Z" fill="#d93025"/><path d="M176 70 L148 66 L148 82 L176 84 Z" fill="#d93025"/>')
    s.append(sticker(80, 62, 40, 20))
    s.append('<rect x="76" y="100" width="48" height="11" rx="2" fill="#fff" stroke="#9aa3ad" stroke-width=".6"/><text x="100" y="108.4" text-anchor="middle" font-family="Arial" font-weight="700" font-size="6.2" fill="#334155">AB 1234 RB</text>')
    s.append('<rect x="30" y="122" width="140" height="12" rx="4" fill="#000" opacity=".25"/>')
    return svg("0 0 200 160", "".join(s), "car")


# --------------------------------------------------------------------------------------------- moto
def moto_side(uid):
    s = ['<ellipse cx="130" cy="144" rx="118" ry="5" fill="url(#road)"/>']
    s.append(wheel(62, 113, 29) + wheel(196, 113, 29))
    s.append('<path d="M38 92 Q62 76 86 92" stroke="#171c23" stroke-width="4" fill="none"/>')
    s.append('<line x1="190" y1="58" x2="196" y2="113" stroke="#8a94a0" stroke-width="4" stroke-linecap="round"/>')
    s.append('<path d="M174 92 Q196 78 222 92 L219 97 Q196 87 178 98 Z" fill="url(#plq)"/>')
    s.append('<line x1="182" y1="58" x2="118" y2="92" stroke="#2b3441" stroke-width="5" stroke-linecap="round"/>')
    s.append('<rect x="112" y="88" width="40" height="26" rx="5" fill="#5b6573"/><path d="M150 108 L58 118" stroke="#9aa3ad" stroke-width="6" stroke-linecap="round"/>')
    s.append('<path d="M56 66 Q82 58 118 62 L113 73 Q84 73 51 77 Z" fill="#1c2430"/>')
    s.append('<path d="M70 76 L126 74 L121 96 L77 98 Z" fill="url(#plq)" stroke="#fff" stroke-width="1"/><use href="#icon-w" x="84" y="80" width="26" height="20"/>')
    s.append('<path d="M104 58 Q130 44 168 52 L172 66 Q140 76 108 76 Z" fill="url(#plq)" stroke="#fff" stroke-width="1"/><use href="#icon-w" x="126" y="51" width="24" height="18"/>')
    s.append('<path d="M186 48 L212 44 L220 62 L194 66 Z" fill="url(#plq)" stroke="#fff" stroke-width="1"/><circle cx="214" cy="53" r="6" fill="#f6f1d0"/>')
    s.append('<path d="M186 46 L166 38" stroke="#2b3441" stroke-width="3.2" stroke-linecap="round"/><rect x="160" y="34" width="12" height="4" rx="2" fill="#171c23"/>')
    s.append('<line x1="40" y1="68" x2="92" y2="72" stroke="#2b3441" stroke-width="3"/>')
    s.append('<g><rect x="16" y="34" width="52" height="34" rx="6" fill="url(#plq)" stroke="#fff" stroke-width="1.4"/><use href="#logo-w" x="22" y="37" width="40" height="24"/>'
             f'<text x="42" y="65" text-anchor="middle" font-family="{FONT}" font-weight="800" font-size="6.2" fill="#fff">{NUM}</text></g>')
    s.append('<rect x="12" y="66" width="8" height="5" rx="2" fill="#d93025"/>')
    return svg("0 0 260 150", "".join(s), "moto")


def moto_rear(uid):
    s = ['<ellipse cx="60" cy="144" rx="50" ry="5" fill="url(#road)"/>']
    s.append('<rect x="52" y="86" width="16" height="58" rx="6" fill="#171c23"/>')
    s.append('<path d="M34 78 Q60 70 86 78 L84 92 Q60 98 36 92 Z" fill="#1c2430"/><rect x="48" y="82" width="24" height="5" rx="2.5" fill="#d93025"/>')
    s.append('<path d="M40 78 L36 66 M80 78 L84 66" stroke="#2b3441" stroke-width="3"/>')
    s.append('<g><rect x="22" y="20" width="76" height="52" rx="8" fill="url(#plq)" stroke="#fff" stroke-width="1.8"/><use href="#logo-w" x="32" y="24" width="56" height="34"/>'
             f'<text x="60" y="67" text-anchor="middle" font-family="{FONT}" font-weight="800" font-size="8.2" fill="#fff">{NUM}</text></g>')
    s.append('<rect x="52" y="94" width="16" height="9" rx="1.5" fill="#fff" stroke="#9aa3ad" stroke-width=".5"/>')
    return svg("0 0 120 150", "".join(s), "moto")


def helmet():
    return svg("0 0 100 90",
               '<path d="M10 56 C8 24 38 8 62 14 C84 19 92 38 90 58 L88 66 L18 66 Z" fill="url(#plq)" stroke="#fff" stroke-width="1.6"/>'
               '<path d="M60 30 C78 30 88 40 88 52 L58 52 Z" fill="#0f172a" opacity=".85"/>'
               '<use href="#icon-w" x="22" y="30" width="30" height="24"/>'
               '<path d="M18 66 L24 78 L52 78 L58 66" fill="none" stroke="#0F172A" stroke-width="2.4"/>', "kit")


def vest():
    return svg("0 0 100 100",
               '<path d="M22 6 L40 6 L50 22 L60 6 L78 6 L94 38 L86 96 L14 96 L6 38 Z" fill="url(#plq)" stroke="#fff" stroke-width="1.6"/>'
               '<rect x="12" y="62" width="76" height="7" fill="#e5f0ff" opacity=".95"/><rect x="14" y="78" width="72" height="5" fill="#e5f0ff" opacity=".95"/>'
               '<use href="#logo-w" x="32" y="26" width="36" height="30"/>', "kit")


# --------------------------------------------------------------------------------------------- tricycle
def tricycle_side(uid):
    s = ['<ellipse cx="180" cy="186" rx="160" ry="6" fill="url(#road)"/>']
    low = "M36 108 L226 108 C262 110 290 126 296 150 L296 158 L36 158 Z"
    s.append(f'<clipPath id="{uid}-c"><path d="{low}"/></clipPath>')
    s.append('<path d="M34 58 L254 58 L256 108 L34 108 Z" fill="#25344b"/><rect x="48" y="66" width="182" height="24" rx="6" fill="#34455f"/><rect x="52" y="92" width="176" height="9" rx="3" fill="#3f5273"/>')
    s.append('<rect x="34" y="58" width="7" height="50" fill="#1E3A8A"/><rect x="134" y="58" width="6" height="50" fill="#1E3A8A"/>')
    s.append('<path d="M248 58 L266 58 L292 108 L270 110 Z" fill="#1E3A8A"/><path d="M252 62 L264 62 L286 104 L264 106 Z" fill="url(#glass)"/>')
    s.append(f'<path d="{low}" fill="url(#plq)"/><path d="{low}" fill="url(#shade)"/>')
    s.append(f'<g clip-path="url(#{uid}-c)"><circle cx="84" cy="160" r="29" fill="#10151b"/><circle cx="284" cy="160" r="27" fill="#10151b"/>'
             f'<path d="M36 146 C100 134 190 164 296 138" stroke="{CYAN}" stroke-width="6" fill="none" stroke-linecap="round"/>'
             '<path d="M36 151 C100 139 190 169 296 143" stroke="#fff" stroke-width="1.6" fill="none"/></g>')
    s.append('<path d="M26 56 C26 40 46 34 80 33 L210 32 C240 33 254 42 258 58 L26 58 Z" fill="url(#plq)" stroke="#fff" stroke-width="1.4"/>'
             '<path d="M26 56 C26 40 46 34 80 33 L210 32 C240 33 254 42 258 58 L26 58 Z" fill="url(#shade)"/>')
    s.append('<use href="#logo-wm" x="96" y="38" width="72" height="18"/><use href="#icon-w" x="176" y="36" width="24" height="19"/>')
    s.append('<use href="#logo-w" x="148" y="112" width="52" height="41"/>')
    s.append(f'<text x="52" y="134" font-family="{FONT}" font-weight="800" font-size="14" fill="#fff" letter-spacing=".5">{NUM}</text>')
    s.append('<path d="M262 132 Q286 118 306 140 L302 144 Q286 134 266 142 Z" fill="#1E3A8A"/><circle cx="293" cy="124" r="5.5" fill="#f6f1d0"/>')
    s.append(wheel(84, 160, 24) + wheel(284, 160, 22))
    return svg("0 0 330 195", "".join(s), "tri")


def tricycle_front(uid):
    s = ['<ellipse cx="100" cy="186" rx="80" ry="5" fill="url(#road)"/>']
    s.append('<rect x="38" y="140" width="14" height="44" rx="4" fill="#171c23"/><rect x="148" y="140" width="14" height="44" rx="4" fill="#171c23"/>')
    s.append('<path d="M40 30 C40 20 60 16 100 16 C140 16 160 20 160 30 L166 52 L34 52 Z" fill="url(#plq)" stroke="#fff" stroke-width="1.4"/>'
             '<use href="#logo-wm" x="62" y="26" width="76" height="19"/>')
    s.append('<path d="M52 52 L148 52 L158 112 L42 112 Z" fill="url(#glass)"/><path d="M52 52 L66 52 L56 112 L44 112 Z" fill="#1E3A8A"/><path d="M148 52 L134 52 L144 112 L156 112 Z" fill="#1E3A8A"/>')
    s.append('<path d="M40 112 L160 112 L156 154 C150 158 50 158 44 154 Z" fill="url(#plq)" stroke="#fff" stroke-width="1.2"/><path d="M40 112 L160 112 L156 154 C150 158 50 158 44 154 Z" fill="url(#shade)"/>')
    s.append('<circle cx="62" cy="128" r="6.5" fill="#f6f1d0"/><circle cx="138" cy="128" r="6.5" fill="#f6f1d0"/><use href="#logo-w" x="80" y="116" width="40" height="32"/>')
    s.append(f'<path d="M44 150 C80 144 120 144 156 150" stroke="{CYAN}" stroke-width="4" fill="none" stroke-linecap="round"/>')
    s.append('<rect x="90" y="150" width="20" height="38" rx="5" fill="#171c23"/><path d="M84 142 L116 142 L112 158 L88 158 Z" fill="#1E3A8A"/>')
    return svg("0 0 200 195", "".join(s), "tri")


# --------------------------------------------------------------------------------------------- mise en page
CSS = """
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; }
body { font-family: 'Sora','Segoe UI',Arial,sans-serif; color: #0F172A; font-size: 9.6pt; line-height: 1.42;
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 297mm; height: 210mm; padding: 11mm 13mm 9mm; position: relative; overflow: hidden; break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; }
.bande { position: absolute; left: 0; top: 0; right: 0; height: 3mm; background: linear-gradient(90deg, #1D4ED8, #2563EB 62%, #06B6D4); }
header { display: flex; align-items: center; justify-content: space-between; gap: 8mm; margin-top: 1mm; }
header img { height: 15mm; display: block; }
.titre { text-align: right; }
.kicker { font-size: 7.4pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #2563EB; }
h1 { font-size: 17pt; font-weight: 800; line-height: 1.15; color: #1E3A8A; margin-top: .6mm; }
.sub { font-size: 8.6pt; color: #475569; margin-top: .8mm; }
h2 { font-size: 10.6pt; font-weight: 800; color: #1E3A8A; margin: 0 0 1.6mm; }
.cap { font-size: 7.6pt; color: #475569; }
.cap b { color: #0F172A; }
.pied { position: absolute; left: 13mm; right: 13mm; bottom: 5mm; display: flex; justify-content: space-between; font-size: 6.8pt; color: #94A3B8; }
svg.car { width: 100%; height: auto; display: block; }
svg.moto, svg.tri, svg.kit { width: 100%; height: auto; display: block; }
.card { border: .25mm solid #DBEAFE; background: #F8FAFC; border-radius: 3mm; padding: 3mm 3.4mm; }
.lettre { display: inline-grid; place-items: center; width: 5.2mm; height: 5.2mm; border-radius: 50%; border: .3mm solid #0F172A; background: #fff; font-weight: 800; font-size: 7.4pt; margin-right: 1.8mm; vertical-align: middle; }
.note { font-size: 7.4pt; color: #64748B; }
.clr { text-align: center; font-size: 6.8pt; color: #475569; margin-top: .4mm; }
"""


def lettre(l):
    return f'<span class="lettre">{l}</span>'


def piece_card(letter, titre, dims, texte, visuel, vw):
    return (
        f'<div class="card" style="display:flex;gap:3mm;align-items:center;"><div style="width:{vw}mm;flex:none">{visuel}</div>'
        f'<div><div style="font-weight:800;color:#1E3A8A">{lettre(letter)}{titre}</div><div class="cap" style="margin-top:.6mm"><b>{dims}</b> · {texte}</div></div></div>'
    )


def piece_svg(inner, w, h):
    return svg(f"0 0 {w} {h}", inner, "kit")


COULEURS = [("Blanc", "#F4F6F8"), ("Argent", "#B6BDC6"), ("Noir", "#1E2329"), ("Rouge", "#C62828"), ("Bleu", "#1F4FD0"), ("Jaune", "#E8B923")]

page1 = f"""
<div class="page"><div class="bande"></div>
<header><img src="data:image/png;base64,{LOGO_C}" alt="TamCar"><div class="titre"><div class="kicker">Habillage des véhicules · 1 sur 3</div>
<h1>Voitures de partenaires : un kit minimal et amovible</h1><div class="sub">Quatre pièces de vinyle, posées sur la carrosserie sans la repeindre, retirées à la sortie de flotte.</div></div></header>

<div style="display:grid;grid-template-columns:1.55fr 1fr;gap:6mm;margin-top:3.4mm">
  <div>
    <div class="card" style="padding:2mm 3mm 1mm">{car_side("p1", "#F4F6F8", "sedan", True, True, True)}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:3mm">
      <div class="card" style="padding:2mm 3mm 1.4mm"><div class="cap" style="font-weight:700;color:#1E3A8A">Vue de face {lettre("B")}</div>{car_front("p1f", "#F4F6F8")}</div>
      <div class="card" style="padding:2mm 3mm 1.4mm"><div class="cap" style="font-weight:700;color:#1E3A8A">Vue arrière {lettre("C")} {lettre("D")}</div>{car_rear("p1r", "#F4F6F8")}</div>
    </div>
  </div>
  <div style="display:flex;flex-direction:column;gap:2.6mm">
    <h2 style="margin-bottom:0">Le kit : 4 pièces</h2>
    {piece_card("A", "Plaques de portes avant ×2", "50 × 30 cm", "logo blanc sur plaque bleue cerclée de blanc : lisible sur toutes les couleurs, même le bleu.", piece_svg(plaque(0, 0), 50, 30), 30)}
    {piece_card("B", "Bandeau de pare-brise ×1", "100 × 10 cm", "haut du pare-brise, sous le pare-soleil. Règle ANATT à vérifier.", piece_svg(band(0, 0), 100, 10), 34)}
    {piece_card("C", "Autocollant arrière ×1", "40 × 20 cm", "capot de coffre, au-dessus de la plaque : logo et numéro de flotte.", piece_svg(sticker(0, 0), 40, 20), 26)}
    {piece_card("D", "Numéros de flotte ×2", "50 × 16 cm", "portes arrière, chiffres de 7 cm : le client reconnaît sa voiture, l'équipe la retrouve.", piece_svg(chip(0, 0), 50, 16), 34)}
    <div class="card" style="border-style:dashed;background:#fff"><div style="font-weight:800;color:#64748B">{lettre("E")}Option : lampe de toit magnétique</div><div class="cap" style="margin-top:.6mm"><b>30 × 8 cm</b> · identifie la voiture de loin ; à décider.</div></div>
    <div class="note" style="margin-top:.6mm">Vinyle cast amovible, laminé anti-UV · posé à l'inspection d'entrée, avec photos de la peinture avant et après · propriété de TamCar · retiré à la sortie de flotte. Schémas de principe : teintes et dimensions à valider sur échantillon.</div>
  </div>
</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-top:4mm">
  <div class="card"><b style="color:#1E3A8A">1 · Entrée en flotte</b><div class="cap" style="margin-top:.6mm">Photos de la peinture, pose du kit à l'inspection d'entrée, constat signé du propriétaire.</div></div>
  <div class="card"><b style="color:#1E3A8A">2 · Pendant le contrat</b><div class="cap" style="margin-top:.6mm">Pièce abîmée ou décollée : remplacée par TamCar. À trancher : à la charge de qui, selon la cause.</div></div>
  <div class="card"><b style="color:#1E3A8A">3 · Sortie de flotte</b><div class="cap" style="margin-top:.6mm">Retrait du vinyle par TamCar, nouveau constat de la peinture. Le kit reste la propriété de TamCar.</div></div>
</div>
<div class="pied"><span>TamCar · Habillage des véhicules</span><span>Page 1 sur 3</span></div></div>
"""

cats = [
    ("Essentiel", "hatch", "#C62828", "Yaris, Picanto, Swift, Elantra"),
    ("Confort", "sedan", "#B6BDC6", "Corolla, Kia K3, Venza"),
    ("VIP", "hatch", "#1E2329", "Starlet, Accent"),
]
cards_cat = "".join(
    f'<div class="card" style="padding:2.4mm 3mm 1.6mm"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="color:#1E3A8A;font-size:10.4pt">{n}</b><span class="cap">{ex}</span></div>{car_side("cat" + str(i), col, kind, True)}</div>'
    for i, (n, kind, col, ex) in enumerate(cats)
)
strip = "".join(
    f'<div class="card" style="padding:1.6mm 2.4mm .8mm"><b style="color:#1E3A8A;font-size:8.6pt">{n}</b>{car_side("col" + str(i), col, "sedan" if i % 2 == 0 else "hatch", True)}</div>'
    for i, (n, col) in enumerate(COULEURS)
)
page2 = f"""
<div class="page"><div class="bande"></div>
<header><img src="data:image/png;base64,{LOGO_C}" alt="TamCar"><div class="titre"><div class="kicker">Habillage des véhicules · 2 sur 3</div>
<h1>Les trois catégories de voitures : même kit, mêmes emplacements</h1><div class="sub">Plaque de porte avant, numéro de flotte sur la porte arrière : les repères ne changent pas d'une voiture à l'autre.</div></div></header>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4mm;margin-top:3.6mm">{cards_cat}</div>
<h2 style="margin-top:3.6mm">Sur toutes les couleurs <span class="cap" style="font-weight:500">· la plaque bleue cerclée de blanc reste lisible, y compris sur une voiture bleue</span></h2>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3mm 4mm">{strip}</div>
<div class="note" style="margin-top:2.4mm">Pose identique sur chaque véhicule, côté conducteur symétrique ; le bandeau de pare-brise et l'autocollant arrière (page 1) ne se voient pas de côté. Les exemples de modèles sont ceux retenus pour la proposition de flotte.</div>
<div class="pied"><span>TamCar · Habillage des véhicules</span><span>Page 2 sur 3</span></div></div>
"""

page3 = f"""
<div class="page"><div class="bande"></div>
<header><img src="data:image/png;base64,{LOGO_C}" alt="TamCar"><div class="titre"><div class="kicker">Habillage des véhicules · 3 sur 3</div>
<h1>Motos et tricycles : nos engins, habillage complet</h1><div class="sub">Ces véhicules nous appartiennent : on peut aller plus loin que le kit minimal.</div></div></header>
<div style="display:grid;grid-template-columns:1.25fr 1fr;gap:6mm;margin-top:3.4mm">
  <div class="card" style="padding:3mm 3.6mm">
    <h2>Moto</h2>
    <div style="display:grid;grid-template-columns:2.1fr .8fr;gap:3mm;align-items:end"><div>{moto_side("m1")}</div><div>{moto_rear("m2")}</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1.9fr;gap:3mm;align-items:center;margin-top:2mm">
      <div style="width:24mm;margin:0 auto">{helmet()}</div><div style="width:22mm;margin:0 auto">{vest()}</div>
      <div class="cap"><b>Kit chauffeur</b> : casque et gilet bleus avec logo blanc (déjà prévus à l'avance de démarrage).<br><b>Sur la moto</b> : top-case bleu (logo + numéro de flotte), panneaux de réservoir et de selle, garde-boue et carénage avant bleus.</div>
    </div>
  </div>
  <div class="card" style="padding:3mm 3.6mm">
    <h2>Tricycle</h2>
    <div>{tricycle_side("t1")}</div>
    <div style="display:grid;grid-template-columns:.62fr 1.5fr;gap:4mm;align-items:center;margin-top:1.4mm"><div>{tricycle_front("t2")}</div>
    <div class="cap"><b>Habillage intégral</b> : toit bleu avec mot-symbole TamCar, caisse bleue, grand logo blanc sur les côtés, ruban cyan, numéro de flotte à l'arrière, face avant bleue avec logo.</div></div>
  </div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:4mm">
  <div class="card"><b style="color:#1E3A8A">Voitures de partenaires</b><div class="cap" style="margin-top:.8mm">Kit amovible (page 1) · propriété de TamCar · retiré à la sortie de flotte · état initial de la peinture constaté à l'inspection d'entrée.</div></div>
  <div class="card"><b style="color:#1E3A8A">Motos et tricycles (à TamCar)</b><div class="cap" style="margin-top:.8mm">Habillage permanent pendant le contrat (12 et 24 mois) · reste en place si le chauffeur, devenu propriétaire, continue sur TamCar.</div></div>
</div>
<div class="pied"><span>TamCar · Habillage des véhicules · schémas de principe, non contractuels</span><span>Page 3 sur 3</span></div></div>
"""

html = f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>TamCar — Habillage des véhicules</title><style>{CSS}</style></head>
<body>{DEFS}{page1}{page2}{page3}</body></html>"""

sortie_html = RACINE / "TamCar_habillage_vehicules.html"
sortie_pdf = RACINE / "TamCar_habillage_vehicules.pdf"
sortie_html.write_text(html, encoding="utf-8")
subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={sortie_pdf}", sortie_html.as_uri()], check=True, capture_output=True)
print("OK", sortie_pdf)
