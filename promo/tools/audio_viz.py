"""Spectrogram + short-term loudness plot of a WAV with event markers (QA aid)."""
import json
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from scipy import signal
from scipy.io import wavfile

sr, x = wavfile.read(sys.argv[1])
x = x.astype(np.float32) / 32768
mono = x.mean(axis=1)
ev = json.load(open(sys.argv[2])) if len(sys.argv) > 3 else []
f, t, S = signal.spectrogram(mono, sr, nperseg=2048, noverlap=1536)
fig, ax = plt.subplots(2, 1, figsize=(16, 7), sharex=True, gridspec_kw={'height_ratios': [3, 1]})
ax[0].pcolormesh(t, f, 10 * np.log10(S + 1e-12), shading='auto', vmin=-110, vmax=-30, cmap='magma')
ax[0].set_yscale('symlog', linthresh=200)
ax[0].set_ylim(30, 20000)
win = int(0.05 * sr)
rms = np.sqrt(np.convolve(mono ** 2, np.ones(win) / win, mode='same'))
tt = np.arange(len(mono)) / sr
ax[1].plot(tt[::100], 20 * np.log10(rms[::100] + 1e-9), lw=0.8)
ax[1].set_ylim(-50, 0)
ax[1].set_ylabel('RMS dBFS (50ms)')
for e in ev:
    if e['type'] in ('snap', 'tick', 'blip', 'jump'):
        continue
    for a in ax:
        a.axvline(e['t'], color='cyan', lw=0.5, alpha=0.5)
    ax[0].text(e['t'], 15000, e['type'], rotation=90, fontsize=6, color='white')
plt.tight_layout()
plt.savefig(sys.argv[3] if len(sys.argv) > 3 else sys.argv[2], dpi=90)
print('peak', np.abs(x).max(), 'rms', 20 * np.log10(np.sqrt((mono ** 2).mean())), 'dc', mono.mean())
