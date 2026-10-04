"""Chroma-key the reference sheet and cut it into individual RGBA sprites.

Alpha is estimated by projecting each edge pixel onto the line between the key
colour and a locally propagated foreground colour, so dark-green parts (circuit
boards) stay opaque and antialiased edges are unmixed with no green spill.
"""
import json
import os
import sys

import cv2
import numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else 'sheet.png'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'sprites_raw'
os.makedirs(OUT, exist_ok=True)

img = cv2.imread(SRC)[:, :, ::-1].astype(np.float32)
H, W = img.shape[:2]
K = np.array([1.1, 249.0, 1.15], np.float32)

dist = np.linalg.norm(img - K, axis=2)
R_, G_, B_ = img[..., 0], img[..., 1], img[..., 2]
mx = np.maximum(R_, B_)
bg_core = dist < 28.0
n, lab, stats, _ = cv2.connectedComponentsWithStats(bg_core.astype(np.uint8), 4)
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] < 6:
        bg_core[lab == i] = False

# Shadowed green pockets (gaps between hands/hips, hair/arm). Circuit boards are
# legitimately green, so they are excluded from this test.
pcb_zones = [(1088, 283, 1192, 388), (1196, 730, 1330, 897)]
not_pcb = np.ones((H, W), bool)
for x0, y0, x1, y1 in pcb_zones:
    not_pcb[y0:y1, x0:x1] = False
green_dom = not_pcb & (G_ - mx > 22) & (G_ > 1.45 * mx + 12)
bg_seed = bg_core | green_dom

BAND = 3
k = np.ones((2 * BAND + 1, 2 * BAND + 1), np.uint8)
near_bg = cv2.dilate(bg_seed.astype(np.uint8), k) > 0
band = near_bg & ~bg_seed
fg_known = ~bg_seed & ~band

def propagate(src_mask, iters):
    Fv = img * src_mask[..., None]
    wv = src_mask.astype(np.float32)
    kn = src_mask.copy()
    for _ in range(iters):
        num = cv2.blur(Fv, (3, 3))
        den = cv2.blur(wv, (3, 3))
        newly = (den > 1e-4) & ~kn
        Fv[newly] = num[newly] / den[newly][:, None]
        wv[newly] = 1.0
        kn |= newly
    return Fv

F_local = propagate(fg_known, 10)
K_local = propagate(bg_seed, 10)

diff = F_local - K_local
proj = np.sum((img - K_local) * diff, axis=2) / np.maximum(np.sum(diff * diff, axis=2), 1.0)
alpha = np.zeros((H, W), np.float32)
alpha[fg_known] = 1.0
alpha[band] = np.clip(proj[band], 0.0, 1.0)

unmixed = (img - (1.0 - alpha[..., None]) * K_local) / np.maximum(alpha[..., None], 1e-3)
w = np.clip((alpha - 0.55) / 0.4, 0, 1)[..., None]
color = np.where(band[..., None], w * unmixed + (1 - w) * F_local, img)
# safety despill on edge pixels: never greener than the local foreground estimate
g_cap = np.maximum(F_local[..., 1] + 6.0, np.maximum(color[..., 0], color[..., 2]))
color[..., 1] = np.where(band & not_pcb, np.minimum(color[..., 1], g_cap), color[..., 1])
color = np.clip(color, 0, 255)
alpha = np.clip(alpha * 1.04 - 0.04, 0, 1)

# item boxes on the 1536x1024 sheet (generous; components are assigned by centroid)
items = {
    'eng1': (10, 100, 300, 590),
    'eng2': (320, 110, 585, 590),
    'eng3': (580, 55, 910, 590),
    'eng4': (915, 110, 1200, 590),
    'eng5': (1250, 100, 1515, 590),
    'robot_arm': (25, 610, 295, 925),
    'trophy': (295, 690, 462, 920),
    'solar_panel': (458, 665, 640, 920),
    'wind_turbine': (640, 610, 822, 925),
    'laptop': (825, 720, 1035, 915),
    'blueprint': (1060, 680, 1185, 925),
    'circuit_board': (1195, 728, 1332, 895),
    'hard_hat': (1330, 730, 1515, 890),
}

solid = (alpha > 0.02).astype(np.uint8)
n, lab, stats, cents = cv2.connectedComponentsWithStats(solid, 8)
meta = {}
for name, (x0, y0, x1, y1) in items.items():
    mask = np.zeros((H, W), bool)
    for i in range(1, n):
        cx, cy = cents[i]
        if stats[i, cv2.CC_STAT_AREA] < 25:
            continue
        if x0 <= cx < x1 and y0 <= cy < y1:
            mask |= lab == i
    ys, xs = np.where(mask)
    bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    pad = 6
    bx0, by0 = max(bx0 - pad, 0), max(by0 - pad, 0)
    bx1, by1 = min(bx1 + pad, W), min(by1 + pad, H)
    a = (alpha * mask)[by0:by1, bx0:bx1]
    c = color[by0:by1, bx0:bx1]
    rgba = np.dstack([c, a[..., None] * 255.0]).round().clip(0, 255).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, name + '.png'), cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
    meta[name] = {'box': [int(bx0), int(by0), int(bx1), int(by1)], 'size': [int(bx1 - bx0), int(by1 - by0)]}
    print(name, meta[name])

with open(os.path.join(OUT, 'meta.json'), 'w') as f:
    json.dump(meta, f, indent=1)

# preview: all sprites over dark and light backgrounds to check for fringes
prev = np.zeros((H, W * 2, 3), np.float32)
full_a = np.zeros((H, W), np.float32)
for name, m in meta.items():
    x0, y0, x1, y1 = m['box']
    s = cv2.imread(os.path.join(OUT, name + '.png'), cv2.IMREAD_UNCHANGED)
    full_a[y0:y1, x0:x1] = np.maximum(full_a[y0:y1, x0:x1], s[..., 3] / 255.0)
bgd = np.zeros((H, W, 3), np.float32); bgd[:] = (60, 20, 8)
bgl = np.zeros((H, W, 3), np.float32); bgl[:] = (240, 170, 70)
fa = full_a[..., None]
prev[:, :W] = color * fa + bgd * (1 - fa)
prev[:, W:] = color * fa + bgl * (1 - fa)
cv2.imwrite(os.path.join(OUT, '_preview.png'), prev[:, :, ::-1].clip(0, 255).astype(np.uint8))
