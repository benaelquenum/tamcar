"""Musique de la video de presentation TamCar : composee et synthetisee ici (aucun fichier externe, aucun droit a payer).

Instrumental lumineux de 100 s a 104 battements par minute : nappes, basse, batterie, arpege et petite melodie sur la grille la mineur / fa / do / sol.
Les sections suivent la video : intro douce, montee (riser) puis depart du rythme avec le smartphone, batterie complete des « Tarifs »,
melodie des « Suivi en direct », montee finale et accord tenu sur l'ecran final.

Usage : python compose_music.py [sortie.wav]
"""
import sys
import numpy as np
import wave

SR = 44100
DUREE = 100.0
BPM = 104.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
N = int((DUREE + 1.0) * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)


def hz(note):  # note MIDI -> Hz
    return 440.0 * 2 ** ((note - 69) / 12)


def place(buf, start, sig, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i < 0:
        sig = sig[-i:]
        i = 0
    if i >= buf.shape[1] or sig.shape[0] == 0:
        return
    j = min(buf.shape[1], i + sig.shape[0])
    s = sig[: j - i] * gain
    buf[0, i:j] += s * (1 - max(0.0, pan))
    buf[1, i:j] += s * (1 + min(0.0, pan))


def fft_filter(x, kind, fc, order=2):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(x.shape[0], 1 / SR)
    if kind == 'lp':
        H = 1.0 / np.sqrt(1 + (f / fc) ** (2 * order))
    else:
        H = 1.0 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * order))
    return np.fft.irfft(X * H, n=x.shape[0])


def curve(points):
    """Gain en fonction du temps : [(t, g), ...] interpole, lisse."""
    ts, gs = zip(*points)
    c = np.interp(t, ts, gs)
    k = int(0.05 * SR)
    return np.convolve(c, np.ones(k) / k, mode='same')


def adsr(n, a, d, s, r):
    e = np.ones(n)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = max(na, 1)
    e[:na] = np.linspace(0, 1, na)
    if nd > 0:
        e[na:na + nd] = np.linspace(1, s, min(nd, max(0, n - na)))[: max(0, min(nd, n - na))]
        e[na + nd:] = s
    if nr > 0:
        nr = min(nr, n)
        e[n - nr:] *= np.linspace(1, 0, nr)
    return e


# ------------------------------------------------------------------ voix
def pad_note(f, dur):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    sig = np.zeros(n)
    for det in (-0.07, 0.0, 0.07):
        ff = f * 2 ** (det / 12)
        for k in range(1, 9):
            if ff * k > 3600:
                break
            sig += np.sin(2 * np.pi * ff * k * tt + k) / k
    return sig * adsr(n, 0.45, 0.2, 0.85, 0.7) * 0.18


def bass_note(f, dur):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    sig = np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * 2 * f * tt) * np.exp(-tt * 6)
    return sig * adsr(n, 0.005, 0.08, 0.7, 0.08)


def kick(dur=0.45):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    fr = 48 + 130 * np.exp(-tt * 28)
    ph = 2 * np.pi * np.cumsum(fr) / SR
    return np.sin(ph) * np.exp(-tt * 9) + 0.25 * np.sin(2 * ph) * np.exp(-tt * 30)


def clap():
    n = int(0.28 * SR)
    tt = np.arange(n) / SR
    x = rng.standard_normal(n)
    x = fft_filter(fft_filter(x, 'hp', 900), 'lp', 5200)
    e = np.exp(-tt * 22) + 0.6 * np.exp(-np.maximum(tt - 0.014, 0) * 22) * (tt > 0.014) + 0.4 * np.exp(-np.maximum(tt - 0.03, 0) * 22) * (tt > 0.03)
    return x * e


def hat(open_=False):
    n = int((0.22 if open_ else 0.06) * SR)
    tt = np.arange(n) / SR
    x = fft_filter(rng.standard_normal(n), 'hp', 7000)
    return x * np.exp(-tt * (14 if open_ else 70))


def shaker():
    n = int(0.05 * SR)
    tt = np.arange(n) / SR
    x = fft_filter(rng.standard_normal(n), 'hp', 4500)
    return x * np.exp(-tt * 55)


def pluck(f, dur=0.5):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    sig = np.sin(2 * np.pi * f * tt) + 0.45 * np.sin(2 * np.pi * 2 * f * tt) * np.exp(-tt * 14) + 0.2 * np.sin(2 * np.pi * 3 * f * tt) * np.exp(-tt * 22)
    return sig * np.exp(-tt * 9) * adsr(n, 0.003, 0, 1, 0.05)


def bell(f, dur=1.4):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    sig = np.sin(2 * np.pi * f * tt) + 0.5 * np.sin(2 * np.pi * 2.0 * f * tt) * np.exp(-tt * 4) + 0.25 * np.sin(2 * np.pi * 3.0 * f * tt) * np.exp(-tt * 7)
    return sig * np.exp(-tt * 2.6) * adsr(n, 0.004, 0, 1, 0.1)


def riser(dur):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    fr = 250 * (14 ** (tt / dur))
    ch = np.sin(2 * np.pi * np.cumsum(fr) / SR)
    nz = fft_filter(rng.standard_normal(n), 'hp', 2500)
    amp = (tt / dur) ** 2.2
    return (0.55 * ch + 0.7 * nz) * amp


def impact(dur=1.6):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    low = np.sin(2 * np.pi * 52 * tt * (1 - 0.25 * tt)) * np.exp(-tt * 2.4)
    nz = fft_filter(rng.standard_normal(n), 'lp', 2500) * np.exp(-tt * 3.2)
    return low + 0.5 * nz


def crash(dur=3.2):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    return fft_filter(rng.standard_normal(n), 'hp', 5200) * np.exp(-tt * 1.7)


# ------------------------------------------------------------------ partition
CHORDS = [  # (basse, accord principal [MIDI], arpege [MIDI])
    (45, [57, 60, 64], [69, 72, 76, 81]),   # la mineur
    (41, [53, 57, 60], [65, 69, 72, 77]),   # fa
    (48, [60, 64, 67], [72, 76, 79, 84]),   # do
    (43, [55, 59, 62], [67, 71, 74, 79]),   # sol
]
MELO = [  # melodie par mesure : (temps, note MIDI, duree en temps)
    [(0, 76, 1.5), (1.5, 79, 0.5), (2, 81, 2)],
    [(0, 79, 1.5), (1.5, 77, 0.5), (2, 76, 2)],
    [(0, 76, 1), (1, 79, 1), (2, 84, 2)],
    [(0, 83, 1), (1, 79, 1), (2, 74, 2)],
]
OUTRO = 90.4

L = {k: np.zeros((2, N)) for k in ('pad', 'bass', 'kick', 'clap', 'hat', 'shk', 'arp', 'lead', 'fx')}

n_bars = int(DUREE / BAR) + 2
duck_times = []
for b in range(n_bars):
    tb = b * BAR
    root, chord, arp = CHORDS[b % 4]
    if tb >= OUTRO + 3 * BAR:   # accord final tenu : do majeur 9
        chord, arp, root = [60, 64, 67, 71, 74], [72, 76, 79, 83], 48
    # nappes (accords repris a chaque mesure, un peu en avance)
    for k, nt in enumerate(chord):
        place(L['pad'], tb - 0.05, pad_note(hz(nt), BAR + 0.7), 1.0, pan=(-0.25 if k % 2 else 0.25))
    # basse : rythme en croches syncopees
    for off, dur in ((0, 0.9), (1.5, 0.45), (2, 0.9), (3, 0.45), (3.5, 0.45)):
        place(L['bass'], tb + off * BEAT, bass_note(hz(root), dur * BEAT), 1.0)
    # batterie
    for bt in range(4):
        tk = tb + bt * BEAT
        place(L['kick'], tk, kick(), 1.0 if bt in (0, 2) else 0.8)
        duck_times.append(tk)
        if bt in (1, 3):
            place(L['clap'], tk, clap(), 1.0)
        place(L['hat'], tk + BEAT / 2, hat(open_=(bt == 3)), 0.9 if bt != 3 else 0.7, pan=0.2)
        for q in range(4):
            place(L['shk'], tk + q * BEAT / 4, shaker(), (0.9 if q % 2 else 0.5), pan=-0.2 if q % 2 else 0.2)
    # arpege : croches (ou doubles croches pendant les passages denses)
    dense = (36.3 <= tb < 54.3) or (71.0 <= tb < OUTRO)
    steps = 16 if dense else 8
    pattern = [0, 1, 2, 3, 2, 1, 2, 1] * (2 if dense else 1)
    for s_ in range(steps):
        ts = tb + s_ * (4 * BEAT / steps)
        place(L['arp'], ts, pluck(hz(arp[pattern[s_] % 4]), 0.4), 1.0 if s_ % 2 == 0 else 0.7, pan=(-0.35 if s_ % 2 else 0.35))
    # melodie (cloches)
    if (25.8 <= tb < 62.0) or (71.0 <= tb < OUTRO) or (OUTRO <= tb < OUTRO + 4 * BAR):
        for off, nt, dur in MELO[b % 4]:
            place(L['lead'], tb + off * BEAT, bell(hz(nt), 1.6), 1.0, pan=0.1)

# effets : montees et impacts
place(L['fx'], 5.8 - 2.6, riser(2.6), 0.55)
place(L['fx'], 5.8, impact(1.8), 0.9)
place(L['fx'], 36.3 - 0.4, riser(0.4), 0.2)
place(L['fx'], 88.0, riser(2.4), 0.6)
place(L['fx'], OUTRO, impact(2.2), 1.0)
place(L['fx'], OUTRO, crash(3.2), 0.5)

# ------------------------------------------------------------------ traitement
def duck(depth, rel):
    d = np.ones(N)
    for tk in duck_times:
        i = int(tk * SR)
        m = int(rel * 5 * SR)
        j = min(N, i + m)
        if j > i:
            d[i:j] = np.minimum(d[i:j], 1 - depth * np.exp(-np.arange(j - i) / (rel * SR)))
    return d


# automation des couches (temps, gain)
A = {
    'pad':  [(0, 0.9), (5.8, 0.95), (15.8, 0.8), (54.3, 0.75), (OUTRO, 1.0), (97, 0.8), (100, 0.0)],
    'bass': [(0, 0), (5.7, 0), (5.8, 0.9), (54.3, 0.9), (OUTRO - 0.05, 0.9), (OUTRO, 0.0), (OUTRO + 0.2, 0.7), (96, 0.5), (99, 0)],
    'kick': [(0, 0), (5.7, 0), (5.8, 1.0), (OUTRO - 0.05, 1.0), (OUTRO, 0.0), (OUTRO + 0.2, 0.0)],
    'clap': [(0, 0), (15.7, 0), (15.8, 0.9), (OUTRO - 0.05, 0.9), (OUTRO, 0.0)],
    'hat':  [(0, 0), (5.7, 0), (5.8, 0.8), (OUTRO - 0.05, 0.8), (OUTRO, 0.0)],
    'shk':  [(0, 0), (15.7, 0), (15.8, 0.8), (OUTRO - 0.05, 0.8), (OUTRO, 0.0)],
    'arp':  [(0, 0.5), (5.8, 0.8), (OUTRO - 0.05, 0.8), (OUTRO, 0.5), (96, 0.4), (99, 0)],
    'lead': [(0, 1), (OUTRO + 0.1, 1.0), (96, 0.8), (99.5, 0)],
    'fx':   [(0, 1), (100, 1)],
}
MIX = {'pad': 0.62, 'bass': 0.5, 'kick': 0.62, 'clap': 0.17, 'hat': 0.08, 'shk': 0.045, 'arp': 0.17, 'lead': 0.13, 'fx': 0.22}

d_pad, d_bass, d_arp = duck(0.45, 0.11), duck(0.35, 0.10), duck(0.2, 0.09)
out = np.zeros((2, N))
for name, sig in L.items():
    x = sig.copy()
    if name == 'pad':
        x = np.stack([fft_filter(x[0], 'lp', 2600), fft_filter(x[1], 'lp', 2600)]) * d_pad
    elif name == 'bass':
        x = np.stack([fft_filter(x[0], 'lp', 520), fft_filter(x[1], 'lp', 520)]) * d_bass
    elif name == 'arp':
        # echo en 3 croches pointees (3/8 de mesure)
        e = int(0.75 * BEAT * SR)
        y = x.copy()
        y[:, e:] += 0.38 * x[:, :-e]
        y[:, 2 * e:] += 0.18 * x[:, :-2 * e]
        x = y * d_arp
    elif name == 'lead':
        e = int(1.5 * BEAT * SR)
        y = x.copy()
        y[:, e:] += 0.3 * x[:, :-e]
        x = y
    out += x * curve(A[name]) * MIX[name]

# legere reverberation (retards courts melanges) sur l'ensemble
rev = np.zeros_like(out)
for dl, g in ((0.041, 0.22), (0.067, 0.18), (0.093, 0.14), (0.131, 0.1)):
    k = int(dl * SR)
    rev[0, k:] += g * out[1, :-k]
    rev[1, k:] += g * out[0, :-k]
out = out + 0.5 * rev

# fondu d'entree / sortie, limiteur doux, normalisation
fade = np.minimum(1, t / 0.8) * np.clip((DUREE - t) / 2.5, 0, 1)
out *= fade
out = np.tanh(out * 1.25) / np.tanh(1.25)
out = out[:, : int(DUREE * SR)]
peak = np.abs(out).max()
out = out / peak * 0.89
rms = np.sqrt((out ** 2).mean())
print(f'crete {20 * np.log10(np.abs(out).max()):.1f} dBFS, rms {20 * np.log10(rms):.1f} dBFS, duree {out.shape[1] / SR:.1f} s')

path = sys.argv[1] if len(sys.argv) > 1 else 'musique_tamcar.wav'
pcm = (np.clip(out.T, -1, 1) * 32767).astype('<i2')
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('ecrit', path)
