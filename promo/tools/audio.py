"""Synthesise the 15 s soundtrack: 120 BPM electro-pop + SFX synced to animation events.

usage: python3 audio.py events.json out.wav
Everything is generated procedurally with numpy/scipy (no samples).
"""
import json
import sys

import numpy as np
from scipy import signal

SR = 48000
DUR = 15.0
N = int(SR * DUR)
BPM = 120.0
BEAT = 60.0 / BPM
STEP = BEAT / 4  # 16th note
rng = np.random.default_rng(7)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12.0)


class Bus:
    def __init__(self):
        self.L = np.zeros(N + SR * 4)
        self.R = np.zeros(N + SR * 4)

    def add(self, t, x, gain=1.0, pan=0.0):
        """x mono or (2, n) stereo; pan -1..1 (equal power)."""
        i = int(round(t * SR))
        if i < 0:
            x = x[..., -i:] if x.ndim == 1 else x[:, -i:]
            i = 0
        if x.ndim == 1:
            a = (pan + 1) * np.pi / 4
            l, r = x * np.cos(a) * gain, x * np.sin(a) * gain
        else:
            l, r = x[0] * gain, x[1] * gain
        n = min(len(l), len(self.L) - i)
        if n <= 0:
            return
        self.L[i:i + n] += l[:n]
        self.R[i:i + n] += r[:n]

    def stereo(self):
        return np.vstack([self.L[:N], self.R[:N]])


def S(*xs):
    """Sum mono arrays of different lengths (zero-padded)."""
    n = max(len(x) for x in xs)
    out = np.zeros(n)
    for x in xs:
        out[:len(x)] += x
    return out


def env_exp(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def adsr(n, a, d, s, r_start, r):
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = np.clip(1 - (t - r_start) / max(r, 1e-4), 0, 1)
    return e * np.where(t > r_start, rel, 1.0)


def lp(x, fc, order=2):
    fc = min(fc, SR * 0.45)
    sos = signal.butter(order, fc, 'low', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def hp(x, fc, order=2):
    sos = signal.butter(order, fc, 'high', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def bp(x, f1, f2, order=2):
    sos = signal.butter(order, [f1, min(f2, SR * 0.45)], 'band', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def saw(f, n, phase=0.0):
    t = np.arange(n) / SR
    p = (f * t + phase) % 1.0
    # polyBLEP-lite: soften with a tiny lowpass later
    return 2 * p - 1


def sq(f, n, duty=0.5):
    t = np.arange(n) / SR
    return np.where((f * t) % 1.0 < duty, 1.0, -1.0)


def sine(f, n, phase=0.0):
    return np.sin(2 * np.pi * (f * np.arange(n) / SR + phase))


def noise(n):
    return rng.standard_normal(n)


# ---------------------------------------------------------------- instruments
def kick(gain=1.0):
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    f = 48 + 120 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.15)
    click = hp(noise(n), 2500) * np.exp(-t / 0.004) * 0.35
    return np.tanh((body + click) * 1.6) * gain


def clap():
    n = int(0.35 * SR)
    x = np.zeros(n)
    nz = bp(noise(n), 900, 3800)
    for k, off in enumerate([0, 0.011, 0.022, 0.031]):
        i = int(off * SR)
        e = np.exp(-np.arange(n - i) / (0.0045 * SR if k < 3 else 0.11 * SR))
        x[i:] += nz[i:] * e * (0.8 if k < 3 else 1.0)
    return x * 0.55


def hat(open_=False):
    n = int((0.26 if open_ else 0.06) * SR)
    x = hp(noise(n), 7500, 4)
    x += hp(sq(4120, n) * sq(6150, n), 7000) * 0.3
    return x * env_exp(n, 0.09 if open_ else 0.014) * (0.35 if open_ else 0.3)


def snare(gain=1.0):
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05) * 0.5
    nz = bp(noise(n), 1500, 9000) * np.exp(-t / 0.07)
    return (tone + nz) * 0.5 * gain


def crash(dur=2.2):
    n = int(dur * SR)
    x = hp(noise(n), 4500, 2) * env_exp(n, 0.6)
    x += hp(sq(3870, n) * sq(5530, n) * sq(7190, n), 5000) * env_exp(n, 0.4) * 0.25
    return x * 0.35


def bass_note(f, dur, bright=1.0):
    n = int(dur * SR)
    x = saw(f, n) * 0.6 + sq(f * 0.5, n) * 0.35 + sine(f, n) * 0.5
    a = lp(x, 500 + 1600 * bright)
    b = lp(x, 320)
    e = np.exp(-np.arange(n) / (0.06 * SR))
    y = a * e + b * (1 - e)
    y = hp(y, 45)
    return np.tanh(y * 1.8) * adsr(n, 0.004, 0.12, 0.65, dur - 0.03, 0.03) * 0.5


def pluck(f, dur=0.32, bright=1.0):
    n = int(dur * SR)
    x = saw(f, n) * 0.5 + saw(f * 1.006, n, 0.3) * 0.5 + sq(f * 2, n, 0.3) * 0.18
    hi = lp(x, 2200 + 5000 * bright, 2)
    lo = lp(x, 900, 2)
    e = np.exp(-np.arange(n) / (0.045 * SR))
    y = hi * e + lo * (1 - e)
    return y * adsr(n, 0.002, 0.09, 0.0, dur, 0.01) * 0.42


def stab(freqs, dur=0.22, bright=1.0):
    n = int(dur * SR)
    x = sum(saw(f, n) + saw(f * 1.008, n, 0.21) for f in freqs) / len(freqs)
    y = lp(x, 1800 + 4000 * bright)
    return y * adsr(n, 0.003, 0.08, 0.25, dur - 0.04, 0.04) * 0.35


def pad(freqs, dur, cutoff=1400, attack=0.4):
    n = int(dur * SR)
    x = np.zeros(n)
    for f in freqs:
        for det in (-0.006, 0.0, 0.007):
            x += saw(f * (1 + det), n, rng.random())
    x = lp(x / (3 * len(freqs)), cutoff, 2)
    return x * adsr(n, attack, 0.5, 0.85, dur - 0.35, 0.35) * 0.5


def bell(f, dur=2.4, ratio=3.5, index=2.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    I = index * np.exp(-t / 0.5)
    mod = np.sin(2 * np.pi * f * ratio * t) * I
    car = np.sin(2 * np.pi * f * t + mod)
    return car * np.exp(-t / (dur * 0.38)) * 0.4


def click(pitch=1.0, body=0.0, bright=1.0):
    """Crisp ABS plastic snap: damped high modes + tick, optional low body thump."""
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f, a, d in ((2900, 1.0, 0.006), (4700, 0.6, 0.004), (7300 * bright, 0.35, 0.0025), (1650, 0.5, 0.009)):
        x += a * np.sin(2 * np.pi * f * pitch * t + rng.random() * 6) * np.exp(-t / d)
    x += hp(noise(n), 3000) * np.exp(-t / 0.0015) * 0.6
    if body > 0:
        x += body * np.sin(2 * np.pi * 240 * pitch * t) * np.exp(-t / 0.018)
    return x * 0.45


def whoosh(dur=0.4, f0=300, f1=4000, pan0=-0.6, pan1=0.6):
    n = int(dur * SR)
    x = noise(n)
    out = np.zeros(n)
    blk = 256
    zi = None
    for i in range(0, n, blk):
        u = i / n
        fc = f0 * (f1 / f0) ** (np.sin(u * np.pi) if u < 0.5 else np.sin(u * np.pi))
        sos = signal.butter(2, [max(fc * 0.6, 40), min(fc * 1.6, SR * 0.45)], 'band', fs=SR, output='sos')
        if zi is None:
            zi = signal.sosfilt_zi(sos) * 0
        seg_, zi = signal.sosfilt(sos, x[i:i + blk], zi=zi)
        out[i:i + blk] = seg_
    e = np.sin(np.linspace(0, np.pi, n)) ** 1.5
    out *= e
    pans = np.linspace(pan0, pan1, n)
    a = (pans + 1) * np.pi / 4
    return np.vstack([out * np.cos(a), out * np.sin(a)]) * 0.5


def riser(dur=1.0):
    n = int(dur * SR)
    x = noise(n)
    out = np.zeros(n)
    blk = 256
    zi = None
    for i in range(0, n, blk):
        u = i / n
        fc = 300 * (9000 / 300) ** (u ** 1.6)
        sos = signal.butter(2, [fc * 0.7, min(fc * 1.4, SR * 0.45)], 'band', fs=SR, output='sos')
        if zi is None:
            zi = signal.sosfilt_zi(sos) * 0
        seg_, zi = signal.sosfilt(sos, x[i:i + blk], zi=zi)
        out[i:i + blk] = seg_
    t = np.arange(n) / SR
    f = 180 * 2 ** (2.5 * (t / dur) ** 1.4)
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = np.sin(ph) * 0.25 + np.sign(np.sin(ph)) * 0.08
    e = (t / dur) ** 2.2
    return (out * 0.9 + tone) * e * 0.55


def applause(dur=1.9):
    n = int(dur * SR)
    out = np.zeros((2, n))
    nclaps = int(dur * 70)
    for _ in range(nclaps):
        i = int(rng.random() * (n - 2000))
        c = bp(noise(1800), 700 + rng.random() * 1500, 4500) * env_exp(1800, 0.006)
        p = rng.random() * 2 - 1
        a = (p + 1) * np.pi / 4
        out[0, i:i + 1800] += c * np.cos(a)
        out[1, i:i + 1800] += c * np.sin(a)
    t = np.arange(n) / SR
    env = np.clip(t / 0.25, 0, 1) * np.clip((dur - t) / 0.5, 0, 1)
    return out * env * 0.32


def sparkle(dur=0.6, base=2400):
    n = int(dur * SR)
    x = np.zeros(n)
    for k in range(7):
        i = int(k * 0.045 * SR)
        f = base * (1.12 ** k) * (1 + 0.02 * rng.random())
        m = n - i
        x[i:] += np.sin(2 * np.pi * f * np.arange(m) / SR) * np.exp(-np.arange(m) / (0.08 * SR)) * 0.35
    return x


# ---------------------------------------------------------------- arrangement
CHORDS = [  # (start, end, root midi for bass, chord tones)
    (0.0, 2.0, 38, [62, 66, 69]),    # D
    (2.0, 4.0, 45, [61, 64, 69]),    # A
    (4.0, 6.0, 47, [59, 62, 66]),    # Bm
    (6.0, 8.0, 43, [59, 62, 67]),    # G
    (8.0, 10.0, 38, [62, 66, 69]),   # D
    (10.0, 12.0, 45, [61, 64, 69]),  # A
    (12.0, 13.5, 43, [59, 62, 67]),  # G (build)
    (13.5, 15.0, 38, [62, 66, 69]),  # D (resolution)
]
HOOK = {  # 16-step patterns per chord colour: step -> midi
    'D': {0: 81, 2: 78, 3: 81, 4: 83, 6: 81, 8: 78, 10: 76, 12: 74, 14: 76},
    'A': {0: 76, 2: 73, 3: 76, 4: 78, 6: 76, 8: 73, 10: 71, 12: 69, 14: 71},
    'Bm': {0: 78, 2: 74, 3: 78, 4: 81, 6: 78, 8: 74, 10: 73, 12: 71, 14: 73},
    'G': {0: 74, 2: 71, 3: 74, 4: 79, 6: 78, 8: 76, 10: 74, 12: 71, 14: 74},
}
CH_NAME = ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'D']


def chord_at(t):
    for k, c in enumerate(CHORDS):
        if c[0] <= t < c[1]:
            return k, c
    return len(CHORDS) - 1, CHORDS[-1]


def build_music(drums, bass, keys, fx):
    # --- intro (0-1.5): filtered pluck arpeggio rising + pad ---
    keys.add(0.0, pad([50, 57, 62, 66], 1.6, cutoff=900, attack=0.25), 0.55)
    arp = [62, 66, 69, 74, 78, 81]
    for k in range(12):
        t = 0.25 + k * STEP
        if t >= 1.5:
            break
        keys.add(t, pluck(midi(arp[k % len(arp)]), 0.25, bright=0.2 + 0.6 * k / 12), 0.55, pan=(-0.4 if k % 2 else 0.4))
    # --- main groove 1.5 .. 12.5 and 13.5 .. 15 ---
    t = 1.5
    while t < 15.0 - 1e-6:
        beat_i = int(round(t / BEAT))
        in_build = 12.5 <= t < 13.5
        in_outro = t >= 13.5
        if not in_build:
            drums.add(t, kick(), 0.95)
            if beat_i % 2 == 1 and not (in_outro and t > 14.4):
                drums.add(t, clap(), 1.15, pan=0.05)
        t += BEAT
    # hats: 16ths with accents, offbeat opens
    for s in range(int(1.5 / STEP), int(15.0 / STEP)):
        t = s * STEP
        if 12.5 <= t < 13.5 or t > 14.45:
            continue
        acc = 1.0 if s % 2 == 0 else 0.55
        drums.add(t + (0.008 if s % 2 else 0), hat(), 0.95 * acc, pan=0.35 if s % 4 < 2 else -0.15)
        if s % 4 == 2:
            drums.add(t, hat(True), 0.6, pan=-0.35)
    # bass: 8ths with octave jumps, sidechained by the kick
    pat = [0, 0, 12, 0, 0, 12, 7, 12]
    for e in range(int(1.5 / (BEAT / 2)), int(15.0 / (BEAT / 2))):
        t = e * BEAT / 2
        if 12.5 <= t < 13.5 or t >= 14.5:
            continue
        _, c = chord_at(t)
        n = c[2] + pat[e % 8]
        bass.add(t, bass_note(midi(n), BEAT / 2 * 0.92, bright=0.6 + 0.4 * (e % 2)), 0.9)
    # pluck hook
    for s in range(int(1.5 / STEP), int(12.5 / STEP)):
        t = s * STEP
        k, c = chord_at(t)
        name = CH_NAME[k]
        st = s % 16
        if st in HOOK[name]:
            n = HOOK[name][st]
            chorus = 10.5 <= t < 12.5
            if chorus:
                n += 12
            keys.add(t, pluck(midi(n), 0.3, bright=1.0 if chorus else 0.8), 0.75 if chorus else 0.65,
                     pan=0.3 if st % 4 else -0.3)
    # chord stabs on offbeats in the chorus + after switch-on
    for s in range(int(10.5 / STEP), int(14.5 / STEP)):
        t = s * STEP
        if 12.5 <= t < 13.5:
            continue
        if s % 4 == 2:
            _, c = chord_at(t)
            keys.add(t, stab([midi(n) for n in c[3]], 0.2), 0.62, pan=-0.25 if s % 8 == 2 else 0.25)
    # time-lapse arp: 16ths, rising register for speed
    for s in range(int(7.6 / STEP), int(10.0 / STEP)):
        t = s * STEP
        _, c = chord_at(t)
        tones = c[3] + [x + 12 for x in c[3]]
        n = tones[s % len(tones)] + 12
        keys.add(t, pluck(midi(n), 0.14, bright=1.0) * 0.6, 0.5, pan=0.5 if s % 2 else -0.5)
    # build 12.5-13.5: pad with rising filter, snare roll accelerating
    keys.add(12.45, pad([43, 55, 59, 62, 67], 1.1, cutoff=2600, attack=0.8), 0.55)
    tt = 12.5
    step = 0.125
    while tt < 13.47:
        u = (tt - 12.5) / 1.0
        drums.add(tt, snare(0.5 + 0.6 * u), 0.7, pan=0.1)
        step = 0.125 if u < 0.5 else 0.0625 if u < 0.8 else 0.03125
        tt += step
    # outro pad under the hold
    keys.add(13.5, pad([38, 50, 57, 62, 66, 69], 1.5, cutoff=2200, attack=0.05), 0.6)


def build_sfx(events, sfx, drums, keys):
    clicks = []
    for e in events:
        ty, t = e['type'], e['t']
        if ty == 'snap':
            clicks.append((t, 0.55 if e.get('soft') else 0.75 if e.get('fast') else 1.0, e.get('id', '')))
        elif ty == 'land':
            sfx.add(t, click(0.8, body=1.6 if e.get('heavy') else 1.0), 0.95 if e.get('heavy') else 0.7, pan=rng.uniform(-0.3, 0.3))
        elif ty == 'hatHit':
            s = e.get('strength', 1.0)
            n = int(0.25 * SR)
            tt = np.arange(n) / SR
            bonk = (np.sin(2 * np.pi * 760 * tt) * 0.8 + np.sin(2 * np.pi * 1580 * tt) * 0.4) * np.exp(-tt / 0.05)
            thud = np.sin(2 * np.pi * 120 * tt) * np.exp(-tt / 0.06) * 0.9
            sfx.add(t, S(bonk, thud, click(0.9)) * s, 0.9)
        elif ty == 'burst':
            n = int(1.2 * SR)
            tt = np.arange(n) / SR
            boom = np.sin(2 * np.pi * (40 + 80 * np.exp(-tt / 0.08)) * tt) * np.exp(-tt / 0.35)
            sfx.add(t, np.tanh(boom * 2) * 0.9, 1.0)
            sfx.add(t, hp(noise(n), 3000) * env_exp(n, 0.4) * 0.12, 1.0)
            sfx.add(t + 0.02, sparkle(0.9, 1800), 0.5, pan=0.2)
        elif ty == 'fall':
            n = int(0.26 * SR)
            tt = np.arange(n) / SR
            f = 1800 * np.exp(-tt / 0.35)
            sfx.add(t, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.clip(tt / 0.05, 0, 1) * 0.12, 1.0)
        elif ty == 'punch':
            sfx.add(t, kick(0.7), 0.6)
        elif ty in ('whoosh', 'swish', 'swoosh'):
            d = e.get('dur', 0.4)
            sfx.add(t, whoosh(d, 250 if ty == 'whoosh' else 600, 5200 if ty == 'whoosh' else 7000), 0.9 if ty == 'whoosh' else 0.5)
        elif ty == 'pop':
            sfx.add(t, click(0.7, body=0.6), 0.5)
        elif ty == 'grab':
            sfx.add(t, click(0.6, body=1.2), 0.8, pan=-0.2)
        elif ty == 'servo':
            d = e.get('dur', 0.3)
            n = int(d * SR)
            tt = np.arange(n) / SR
            f = 320 + 260 * np.sin(np.pi * tt / d)
            x = lp(np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)), 1800) * np.sin(np.pi * tt / d) * 0.1
            sfx.add(t, x, 0.8, pan=-0.3)
        elif ty == 'ding':
            sfx.add(t, S(bell(midi(93), 0.9, 2.0, 1.5), bell(midi(98), 0.9, 2.0, 1.0) * 0.6), 0.55, pan=0.35)
            sfx.add(t + 0.03, sparkle(0.5, 3200), 0.35, pan=0.4)
        elif ty == 'ting':
            sfx.add(t, bell(midi(100), 0.7, 3.0, 1.2), 0.38, pan=rng.uniform(-0.3, 0.3))
        elif ty == 'tick':
            sfx.add(t, click(1.25), 0.35, pan=rng.uniform(-0.6, 0.6))
        elif ty == 'pump':
            sfx.add(t, S(kick(0.5) * 0.4, click(0.7, body=0.8) * 0.6), 0.55, pan=0.3)
        elif ty == 'lid':
            sfx.add(t, whoosh(0.28, 900, 3000, -0.2, -0.1), 0.35)
        elif ty == 'powerOn':
            n = int(0.35 * SR)
            tt = np.arange(n) / SR
            f = 500 * 2 ** (tt / 0.35 * 2)
            x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.2) * 0.3
            sfx.add(t, S(x, bell(midi(88), 0.6, 2.0, 1.0) * 0.5), 0.55, pan=-0.2)
        elif ty == 'blip':
            n = int(0.05 * SR)
            f = midi(88 + [0, 4, 7, 12][e.get('pitch', 0)])
            sfx.add(t, sine(f, n) * env_exp(n, 0.012) * 0.25, 0.5, pan=0.35)
        elif ty == 'data':
            d = e.get('dur', 0.9)
            for k in range(int(d / 0.035)):
                tt = t + k * 0.035 + rng.random() * 0.01
                f = midi(84 + int(rng.random() * 14))
                n = int(0.025 * SR)
                sfx.add(tt, sine(f, n) * env_exp(n, 0.008) * 0.12, 0.6, pan=rng.uniform(-0.8, 0.8))
        elif ty == 'rampUp':
            sfx.add(t, whoosh(0.45, 200, 6000, 0.6, -0.6), 0.5)
        elif ty == 'rampDown':
            sfx.add(t, whoosh(0.35, 3000, 200, -0.6, 0.6), 0.4)
        elif ty == 'lightUp':
            for k, n in enumerate([74, 78, 81, 86]):
                sfx.add(t + k * 0.03, bell(midi(n), 1.2, 3.5, 1.6), 0.35, pan=-0.3 + 0.2 * k)
            sfx.add(t, sparkle(0.6, 2600), 0.4)
        elif ty == 'cheer':
            sfx.add(t, applause(1.1), 0.7)
        elif ty == 'flashIn':
            sfx.add(t, sparkle(0.5, 3000), 0.35)
            sfx.add(t, crash(1.4), 0.5)
        elif ty == 'confetti':
            d = e.get('dur', 1.8)
            n = int(d * SR)
            x = hp(noise(n), 6000) * (0.5 + 0.5 * np.abs(np.sin(np.arange(n) / SR * 2 * np.pi * 8)))
            x *= np.clip(np.arange(n) / (0.2 * SR), 0, 1) * np.clip((n - np.arange(n)) / (0.5 * SR), 0, 1)
            sfx.add(t, x * 0.06, 1.0, pan=0.2)
            for k in range(14):
                sfx.add(t + rng.random() * d, sine(midi(96 + int(rng.random() * 8)), int(0.08 * SR)) * env_exp(int(0.08 * SR), 0.02) * 0.1, 1.0, pan=rng.uniform(-0.9, 0.9))
        elif ty == 'applause':
            sfx.add(t, applause(e.get('dur', 1.9)), 0.85)
        elif ty == 'riser':
            sfx.add(t, riser(e.get('dur', 1.0)), 0.9)
        elif ty == 'switchOn':
            sfx.add(t, kick(1.0), 1.0)
            sfx.add(t, crash(2.0), 0.7)
            n = int(0.5 * SR)
            tt = np.arange(n) / SR
            sfx.add(t, np.sin(2 * np.pi * 55 * tt) * np.exp(-tt / 0.3) * 0.7, 1.0)
        elif ty == 'chime':
            for k, n in enumerate([62, 66, 69, 74, 78]):
                sfx.add(t + k * 0.018, bell(midi(n + 12), 2.4, 3.5, 2.0), 0.4, pan=-0.4 + 0.2 * k)
        elif ty == 'swell':
            d = e.get('dur', 1.4)
            x = pad([50, 57, 62, 66, 69, 74], d, cutoff=3000, attack=0.5)
            keys.add(t, x, 0.65)
        elif ty == 'stinger':
            keys.add(t, stab([midi(n) for n in [62, 66, 69, 74, 76, 81]], 0.5, bright=1.0), 1.1)
            for k, n in enumerate([74, 81, 86, 90, 93]):
                sfx.add(t + k * 0.012, bell(midi(n), 0.5, 3.5, 1.8), 0.45, pan=-0.5 + 0.25 * k)
            sfx.add(t, crash(0.5), 0.6)
            sfx.add(t, kick(1.0), 0.9)
            sfx.add(t + 0.02, sparkle(0.48, 3400), 0.45, pan=0.2)
    # plastic clicks: thin dense clusters so each audible click stays crisp
    clicks.sort()
    last = -1.0
    for t, g, cid in clicks:
        gap = 0.016 if cid in ('wipe', 'bulb') else 0.012
        if t - last < gap:
            continue
        last = t
        p = 0.85 + rng.random() * 0.35
        sfx.add(t, click(p, body=0.25 if cid != 'wipe' else 0.1), 0.62 * g, pan=rng.uniform(-0.55, 0.55))


def pingpong(x, delay=0.375, fb=0.38, n_taps=4):
    """Stereo ping-pong delay on a stereo signal; returns the wet signal."""
    d = int(delay * SR)
    out = np.zeros_like(x)
    src = (x[0] + x[1]) * 0.5
    src = hp(lp(src, 6000), 300)
    g = 1.0
    for k in range(1, n_taps + 1):
        g *= fb
        ch = (k + 1) % 2
        shift = d * k
        if shift >= x.shape[1]:
            break
        out[ch, shift:] += src[:-shift] * g
    return out


def reverb(x, seconds=1.1, mix=0.18):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    irL = noise(n) * np.exp(-t / (seconds / 5))
    irR = noise(n) * np.exp(-t / (seconds / 5))
    irL, irR = lp(irL, 5000), lp(irR, 5000)
    irL /= np.sqrt(np.sum(irL ** 2))
    irR /= np.sqrt(np.sum(irR ** 2))
    wl = signal.fftconvolve(x[0], irL)[:x.shape[1]]
    wr = signal.fftconvolve(x[1], irR)[:x.shape[1]]
    return np.vstack([wl, wr]) * mix


def limiter(x, ceiling_db=-1.0, lookahead=0.002, release=0.08):
    """Look-ahead peak limiter: instant attack (via look-ahead hold), exponential release."""
    from scipy.ndimage import maximum_filter1d
    ceil = 10 ** (ceiling_db / 20)
    la = int(lookahead * SR)
    a = np.max(np.abs(x), axis=0)
    # peak hold over the look-ahead window, shifted so gain drops before the peak arrives
    env = maximum_filter1d(a, size=2 * la + 1, origin=0)
    want = np.minimum(1.0, ceil / np.maximum(env, 1e-9))
    g = np.empty_like(want)
    rel = np.exp(-1.0 / (release * SR))
    cur = 1.0
    for i, w in enumerate(want.tolist()):
        cur = w if w < cur else w + (cur - w) * rel
        g[i] = cur
    # smooth the attack corners slightly
    k = np.ones(la) / la
    g = np.minimum(g, np.convolve(g, k, mode='same'))
    y = x * g
    return np.clip(y, -ceil, ceil)


def sidechain(t_kicks):
    g = np.ones(N)
    for tk in t_kicks:
        i = int(tk * SR)
        n = int(0.22 * SR)
        e = 1 - 0.55 * np.exp(-np.arange(n) / (0.07 * SR))
        g[i:i + n] = np.minimum(g[i:i + n], e[:max(0, min(n, N - i))])
    return g


def main():
    events = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    drums, bass, keys, sfx = Bus(), Bus(), Bus(), Bus()
    build_music(drums, bass, keys, sfx)
    build_sfx(events, sfx, drums, keys)
    kicks = [t * BEAT for t in range(int(1.5 / BEAT), int(15 / BEAT))
             if not (12.5 <= t * BEAT < 13.5)]
    sc = sidechain(kicks)
    K = keys.stereo()
    K = K + pingpong(K, 0.375, 0.42, 4) * 0.8
    music = drums.stereo() * 0.72 + bass.stereo() * sc * 0.62 + K * (0.55 + 0.45 * sc) * 1.75
    fx = sfx.stereo()
    wet = hp(reverb(keys.stereo() * 0.8 + fx * 0.5 + drums.stereo() * 0.12, 1.3, 0.26), 250)
    mix = music + fx * 0.95 + wet
    # gentle glue + limiter; low-shelf (-3 dB below ~110 Hz) keeps the bright pop balance
    mix = hp(mix, 25)
    low = lp(mix, 110, 2)
    mix = mix - 0.4 * low
    rms = np.sqrt(np.mean(mix ** 2))
    mix *= 10 ** (-14.5 / 20) / rms
    mix = limiter(mix, ceiling_db=-1.0)
    # fade the very end to avoid a click at 15.0s, short fade-in at 0
    fade_n = int(0.08 * SR)
    mix[:, -fade_n:] *= np.linspace(1, 0, fade_n) ** 1.5
    mix[:, :64] *= np.linspace(0, 1, 64)
    from scipy.io import wavfile
    wavfile.write(out, SR, (mix.T * 32767).astype(np.int16))
    print('wrote', out, 'peak', np.max(np.abs(mix)))


if __name__ == '__main__':
    main()
