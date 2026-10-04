"""Scan every frame of a video for key-green pixels (green-screen leaks).

usage: python3 qa_green.py video.mp4
Flags saturated bright greens close to the sheet's key colour (1,249,1); the
dark-green circuit boards (G < ~170, far from the key) are not flagged.
"""
import subprocess
import sys

import numpy as np

path = sys.argv[1]
W, H = 1920, 1080
cmd = ['ffmpeg', '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
frame = 0
worst = []
while True:
    buf = p.stdout.read(W * H * 3)
    if len(buf) < W * H * 3:
        break
    a = np.frombuffer(buf, np.uint8).reshape(H, W, 3).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    key = (g > 170) & (g - np.maximum(r, b) > 90)
    n = int(key.sum())
    if n:
        ys, xs = np.nonzero(key)
        worst.append((n, frame, int(xs.mean()), int(ys.mean())))
    frame += 1
p.wait()
worst.sort(reverse=True)
print(f'frames scanned: {frame}; frames with key-green pixels: {len(worst)}')
for n, f, x, y in worst[:15]:
    print(f'  frame {f} (t={f / 60:.3f}s): {n} px around ({x},{y})')
