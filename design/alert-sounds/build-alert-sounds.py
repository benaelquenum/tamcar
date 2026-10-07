"""Sons d'alerte « nouvelle course » du portail chauffeur (TamCar Pro).

Constat (Terence, 2026-10-07) : l'ancien son (double bip sinusoïdal à 880 / 1174 Hz) était trop discret.
Ici : tons riches en harmoniques (onde quasi carrée), registre 1 à 2,6 kHz (là où les petits haut-parleurs de
téléphone sont les plus efficaces et où l'oreille est la plus sensible), saturation douce pour monter le niveau
efficace, normalisation à -1 dBFS. Aucun asset externe : tout est synthétisé ici.

Sorties :
  apps/driver-portal/public/sounds/ride-alarm.mp3          son par défaut (variante A), boucle dans l'application
  apps/driver-portal/public/sounds/preview/alarm-{a,b,c}.mp3 + preview.html : écoute des trois variantes
  mobile-driver/native/res/raw/ride_request.wav            sonnerie de la notification native (variante A)

Usage : python design/alert-sounds/build-alert-sounds.py   (ffmpeg requis pour les MP3)
"""
import math
import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SR = 22050


def tone(freq, dur, harmonics=(1.0, 0.55, 0.3, 0.18), attack=0.004, release=0.02, sweep_to=None):
    n = int(SR * dur)
    t = np.arange(n) / SR
    if sweep_to is None:
        phase = 2 * math.pi * freq * t
    else:  # glissando linéaire freq -> sweep_to
        phase = 2 * math.pi * (freq * t + (sweep_to - freq) * t * t / (2 * dur))
    x = np.zeros(n)
    for k, a in enumerate(harmonics, start=1):
        x += a * np.sin(k * phase)
    env = np.ones(n)
    na, nr = max(1, int(SR * attack)), max(1, int(SR * release))
    env[:na] = np.linspace(0, 1, na)
    env[-nr:] = np.minimum(env[-nr:], np.linspace(1, 0, nr))
    return x * env


def silence(dur):
    return np.zeros(int(SR * dur))


def finish(x, drive=2.6):
    x = np.tanh(drive * x / np.max(np.abs(x)))  # saturation douce : plus de niveau efficace, sans écrêtage dur
    x = x / np.max(np.abs(x)) * 0.89  # -1 dBFS
    return x


def variant_a():
    """Sonnerie : trois salves « tri-ti-ti-ti-ti-ti » alternant mi6 / si5. Insistante, très reconnaissable."""
    parts = []
    for _ in range(3):
        for i in range(6):
            parts.append(tone(1319 if i % 2 == 0 else 988, 0.11))
            parts.append(silence(0.02))
        parts.append(silence(0.34))
    return finish(np.concatenate(parts))


def variant_b():
    """Sirène : quatre montées 600 -> 1500 Hz, façon véhicule d'urgence (attire l'attention de loin)."""
    parts = []
    for _ in range(4):
        parts.append(tone(600, 0.42, sweep_to=1500, release=0.05))
        parts.append(silence(0.10))
    parts.append(silence(0.30))
    return finish(np.concatenate(parts))


def variant_c():
    """Klaxon : trois coups d'accord plein (la 4 / do# 5 / mi 5) puis un bip aigu."""
    parts = []
    for _ in range(3):
        chord = tone(440, 0.30, (1, 0.5, 0.25)) + tone(554, 0.30, (1, 0.5, 0.25)) + tone(659, 0.30, (1, 0.5, 0.25))
        parts.append(chord)
        parts.append(silence(0.12))
    parts.append(tone(1760, 0.18))
    parts.append(silence(0.35))
    return finish(np.concatenate(parts))


def write_wav(path, x):
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = (x * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def to_mp3(wav, mp3):
    mp3.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-codec:a', 'libmp3lame', '-b:a', '96k', str(mp3)], check=True)


PREVIEW = """<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sons d'alerte - TamCar Pro</title>
<style>body{font-family:system-ui,sans-serif;max-width:420px;margin:24px auto;padding:0 16px;color:#0f172a}
h1{font-size:20px}button{display:block;width:100%;margin:12px 0;padding:18px;border:0;border-radius:14px;background:#2563eb;color:#fff;font-size:17px;font-weight:700}
p{color:#475569;font-size:14px}</style></head><body>
<h1>Choisir le son d'alerte</h1>
<p>Montez le volume du téléphone puis touchez chaque son. Le son actuel de l'application est le A.</p>
<button onclick="play('alarm-a.mp3')">A — Sonnerie (par défaut)</button>
<button onclick="play('alarm-b.mp3')">B — Sirène</button>
<button onclick="play('alarm-c.mp3')">C — Klaxon</button>
<script>let a;function play(f){if(a){a.pause()}a=new Audio(f);a.volume=1;a.play()}</script>
</body></html>
"""


def main():
    out_a = variant_a()
    out_b = variant_b()
    out_c = variant_c()
    tmp = ROOT / 'design' / 'alert-sounds' / '_tmp'
    web = ROOT / 'apps' / 'driver-portal' / 'public' / 'sounds'
    for name, x in (('a', out_a), ('b', out_b), ('c', out_c)):
        wav = tmp / f'alarm-{name}.wav'
        write_wav(wav, x)
        to_mp3(wav, web / 'preview' / f'alarm-{name}.mp3')
    to_mp3(tmp / 'alarm-a.wav', web / 'ride-alarm.mp3')
    (web / 'preview' / 'preview.html').write_text(PREVIEW, encoding='utf-8')
    write_wav(ROOT / 'mobile-driver' / 'native' / 'res' / 'raw' / 'ride_request.wav', out_a)
    for f in tmp.glob('*.wav'):
        f.unlink()
    tmp.rmdir()
    print('durees (s) : A=%.1f B=%.1f C=%.1f' % (len(out_a) / SR, len(out_b) / SR, len(out_c) / SR))


if __name__ == '__main__':
    main()
