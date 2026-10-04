"""Cut the upscaled sprites into puppet layers and rectified prop textures.

All polygon coordinates are in 1x sheet-sprite pixels; sprites_2x are exactly 2x.
Outputs <out>/layers/*.png and <out>/rig.json (2x pixel units, y down).
"""
import json
import os
import sys

import cv2
import numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else 'sprites_2x'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'assets'
S = 2  # sprite scale relative to polygon coordinates
os.makedirs(os.path.join(OUT, 'tex'), exist_ok=True)


def load(name):
    im = cv2.imread(os.path.join(SRC, name + '.png'), cv2.IMREAD_UNCHANGED).astype(np.float32) / 255.0
    return im  # BGRA straight alpha


def poly_mask(shape, pts, ss=4):
    """Anti-aliased polygon mask; pts in 1x coords."""
    H, W = shape
    big = np.zeros((H * ss, W * ss), np.uint8)
    p = (np.array(pts, np.float32) * S * ss).round().astype(np.int32)
    cv2.fillPoly(big, [p], 255)
    return cv2.resize(big, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0


def zone(shape, x0, y0, x1, y1):
    m = np.zeros(shape, bool)
    m[y0 * S:y1 * S, x0 * S:x1 * S] = True
    return m


def save_layer(name, rgba, pad=4, offset=(0, 0)):
    a = rgba[..., 3]
    ys, xs = np.where(a > 0.003)
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + 1 + pad, a.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + 1 + pad, a.shape[1])
    crop = rgba[y0:y1, x0:x1].copy()
    # bleed colour into transparent texels so bilinear/mip filtering has no dark fringe
    col, al = crop[..., :3], crop[..., 3]
    known = al > 0.5
    F = col * known[..., None]
    w = known.astype(np.float32)
    for _ in range(8):
        num, den = cv2.blur(F, (3, 3)), cv2.blur(w, (3, 3))
        newly = (den > 1e-4) & ~known
        F[newly] = num[newly] / den[newly][:, None]
        w[newly] = 1
        known |= newly
    col = np.where((al > 0.5)[..., None], col, F)
    out = np.dstack([col, al[..., None]])
    cv2.imwrite(os.path.join(OUT, 'tex', name + '.png'), (out * 255).round().clip(0, 255).astype(np.uint8))
    return {'file': 'tex/' + name + '.png', 'x': int(x0) - offset[0], 'y': int(y0) - offset[1], 'w': int(x1 - x0),
            'h': int(y1 - y0)}


def feet(alpha):
    rows = np.where((alpha > 0.5).any(axis=1))[0]
    ybot = rows.max()
    band = alpha[max(ybot - 30, 0):ybot + 1] > 0.5
    xs = np.where(band.any(axis=0))[0]
    return [float((xs.min() + xs.max()) / 2.0), float(ybot + 1)]


def top(alpha):
    return float(np.where((alpha > 0.5).any(axis=1))[0].min())


CHARS = {
    'eng1': {
        'head': [(55, 0), (232, 0), (232, 153), (55, 153)], 'headPivot': (142, 151),
        'armL': [(80, 156), (55, 157), (33, 172), (18, 210), (10, 250), (0, 290), (0, 372), (40, 372), (69, 340),
                 (69, 288), (75, 250), (76, 200), (79, 170)], 'armLPivot': (70, 176),
        'armR': [(200, 156), (225, 157), (247, 175), (258, 210), (266, 255), (282, 300), (282, 340), (236, 340),
                 (213, 312), (206, 280), (204, 230), (202, 180)], 'armRPivot': (210, 176),
        'bodyTop': 0,
    },
    'eng2': {
        'head': [(25, 0), (248, 0), (248, 182), (205, 182), (180, 164), (150, 157), (95, 157), (56, 154), (56, 114),
                 (25, 114)], 'headPivot': (120, 153),
        'hairZone': (148, 148, 248, 184),
        'armL': [(0, 113), (54, 113), (58, 150), (63, 165), (63, 200), (59, 238), (42, 250), (0, 252)],
        'armLPivot': (58, 178),
    },
    'eng3': {
        'head': [(110, 55), (275, 55), (275, 214), (110, 214)], 'headPivot': (182, 213),
        'bladePoly': [(104, 92), (158, 110), (164, 124), (157, 137), (104, 123)],
        'armL': [(0, 0), (110, 0), (110, 216), (125, 219), (127, 300), (100, 305), (60, 303), (55, 262), (0, 252)],
        'armLPivot': (120, 240),
        'armR': [(247, 216), (275, 222), (297, 258), (308, 330), (318, 395), (252, 395), (250, 340), (250, 300),
                 (247, 250)], 'armRPivot': (250, 240),
    },
    'eng4': {'head': [(50, 0), (220, 0), (220, 154), (50, 154)], 'headPivot': (130, 152)},
    'eng5': {'head': [(38, 0), (208, 0), (208, 155), (38, 155)], 'headPivot': (122, 153)},
}

rig = {'scale': S, 'chars': {}, 'props': {}}
OV = 6 * S  # head/body overlap band (2x px)

for name, d in CHARS.items():
    im = load(name)
    H, W = im.shape[:2]
    a = im[..., 3]
    head = poly_mask((H, W), d['head'])
    if 'hairZone' in d:
        x0, y0, x1, y1 = d['hairZone']
        z = zone((H, W), x0, y0, x1, y1)
        b, g, r = im[..., 0] * 255, im[..., 1] * 255, im[..., 2] * 255
        hair = (r > g + 22) & (r > b + 35) & (r < 235)
        hair = cv2.dilate(hair.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        head = np.where(z & ~hair, 0.0, head)
    arms = {}
    for k in ('armL', 'armR'):
        if k in d:
            arms[k] = poly_mask((H, W), d[k])
    if 'bladePoly' in d:
        z = poly_mask((H, W), d['bladePoly']) > 0.5
        b, g, r = im[..., 0] * 255, im[..., 1] * 255, im[..., 2] * 255
        whitish = (np.abs(r - b) < 40) & (np.minimum(np.minimum(r, g), b) > 120)
        whitish = cv2.dilate(whitish.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        yellow = (r > 150) & (g > 110) & (b < 0.55 * r) & (r - b > 90)
        blade = (z & whitish & ~yellow & (a > 0.02)).astype(np.float32)
        arms['armL'] = np.maximum(arms['armL'], blade)
        head = head * (1 - blade)
    arm_all = np.zeros((H, W), np.float32)
    for m in arms.values():
        arm_all = np.maximum(arm_all, m)
    # head layer: head region minus arms
    head = head * (1 - arm_all)
    # body: everything not head (shifted up for overlap) and not arm
    head_shift = np.zeros_like(head)
    head_shift[:-OV] = head[OV:]
    body_core = (1 - np.maximum(head_shift, arm_all)) * (a > 0.003)
    # keep a few px of arm under internal cut edges so arm-over-body composites seamlessly
    core_bin = (body_core > 0.5).astype(np.uint8)
    near_body = cv2.dilate(core_bin, np.ones((5, 5), np.uint8)).astype(np.float32)
    body = np.maximum(body_core, near_body * arm_all * (a > 0.5))
    layers = {}

    def mk(lname, m):
        rgba = im.copy()
        rgba[..., 3] = a * np.clip(m, 0, 1)
        return save_layer(f'{name}_{lname}', rgba)

    layers['body'] = mk('body', body)
    layers['head'] = mk('head', head)
    piv = {'head': [p * S for p in d['headPivot']]}
    for k, m in arms.items():
        layers[k] = mk(k, m)
        piv[k] = [p * S for p in d[k + 'Pivot']]
    fx, fy = feet(a)
    rig['chars'][name] = {'w': W, 'h': H, 'feet': [fx, fy], 'top': top(a), 'layers': layers, 'pivots': piv,
                          'order': ['body', 'head'] + [k for k in ('armL', 'armR') if k in arms]}
    print(name, W, H, 'feet', (round(fx), round(fy)), list(layers))

# ---- props ----
# single-layer billboards
for pname in ('trophy', 'blueprint', 'circuit_board', 'hard_hat'):
    im = load(pname)
    lay = save_layer(pname, im)
    fx, fy = feet(im[..., 3])
    rig['props'][pname] = {'w': im.shape[1], 'h': im.shape[0], 'feet': [fx, fy], 'layers': {'main': lay}}

# wind turbine: rotor rebuilt from the prop's clean top blade (x3 around the hub),
# tower top behind the rotor re-synthesised from clean rows further down.
im0 = load('wind_turbine')
H0, W0 = im0.shape[:2]
RP = 140
im = cv2.copyMakeBorder(im0, RP, RP, RP, RP, cv2.BORDER_CONSTANT, value=(0, 0, 0, 0))
H, W = im.shape[:2]
hub = (105.0, 108.0)
hc = (hub[0] * S + RP, hub[1] * S + RP)
yy, xx = np.mgrid[0:H, 0:W]
hub_disc = (((xx - hc[0]) ** 2 + (yy - hc[1]) ** 2) < (21 * S) ** 2).astype(np.float32)
blade_m = np.zeros((H, W), np.float32)
blade_m[RP:RP + H0, RP:RP + W0] = poly_mask((H0, W0), [(90, 0), (140, 0), (136, 50), (124, 88), (112, 92), (100, 90)])
blade_m = blade_m * (1 - hub_disc)
blade = im.copy()
blade[..., 3] *= blade_m
rotor = im.copy()
rotor[..., 3] *= hub_disc
for ang in (0.0, 120.0, 240.0):
    M = cv2.getRotationMatrix2D(hc, ang, 1.0)
    rb = cv2.warpAffine(blade, M, (W, H), flags=cv2.INTER_CUBIC, borderValue=(0, 0, 0, 0))
    rb[..., 3] = rb[..., 3].clip(0, 1)
    a_new = rb[..., 3:] + rotor[..., 3:] * (1 - rb[..., 3:])
    col = (rb[..., :3] * rb[..., 3:] + rotor[..., :3] * rotor[..., 3:] * (1 - rb[..., 3:])) / np.maximum(a_new, 1e-4)
    rotor = np.dstack([col, a_new])
# re-composite the hub on top so blade roots tuck under it
a_h = hub_disc[..., None] * im[..., 3:]
rotor[..., :3] = (im[..., :3] * a_h + rotor[..., :3] * rotor[..., 3:] * (1 - a_h)) / np.maximum(a_h + rotor[..., 3:] * (1 - a_h), 1e-4)
rotor[..., 3:] = a_h + rotor[..., 3:] * (1 - a_h)
lay_r = save_layer('turbine_rotor', rotor, offset=(RP, RP))
im, H, W = im0, H0, W0
# tower: keep original below y=162, synthesise y in [96,162) from row 162 with gentle taper
tower = im.copy()
keep = np.zeros((H, W), np.float32)
keep[194 * S:, :] = 1.0
tower[..., 3] *= keep
ref = im[194 * S].copy()
ref[:80 * S] = 0
ref[132 * S:] = 0
ref_cols = np.where(ref[:, 3] > 0.5)[0]
rx0, rx1 = ref_cols.min(), ref_cols.max()
for y in range(110 * S, 194 * S):
    f = (194 * S - y) / float(194 * S - 110 * S)
    shrink = 1.0 - 0.16 * f
    cx = (rx0 + rx1) / 2.0
    half = (rx1 - rx0) / 2.0 * shrink
    xs_new = np.arange(int(cx - half) - 2, int(cx + half) + 3)
    src_x = cx + (xs_new - cx) / shrink
    for xi, sx in zip(xs_new, src_x):
        s0 = int(np.clip(np.floor(sx), 0, W - 2)); t = sx - s0
        tower[y, xi] = ref[s0] * (1 - t) + ref[s0 + 1] * t
lay_t = save_layer('turbine_tower', tower)
fx, fy = feet(im[..., 3])
rig['props']['wind_turbine'] = {'w': W, 'h': H, 'feet': [fx, fy], 'layers': {'tower': lay_t, 'rotor': lay_r},
                                'pivots': {'rotor': [hub[0] * S, hub[1] * S]}, 'order': ['tower', 'rotor']}

# robot arm: base + chain (pivot shoulder) + gripper (pivot wrist)
im = load('robot_arm')
H, W = im.shape[:2]
grip = poly_mask((H, W), [(158, 87), (254, 87), (254, 205), (158, 205)])
chain = poly_mask((H, W), [(0, 0), (254, 0), (254, 87), (158, 87), (142, 118), (132, 148), (112, 152), (100, 158),
                           (80, 160), (58, 158), (45, 172), (28, 182), (0, 182)])
chain = chain * (1 - grip)
base = 1 - np.maximum(chain, grip)
core_bin = (base > 0.5).astype(np.uint8)
near = cv2.dilate(core_bin, np.ones((5, 5), np.uint8)).astype(np.float32)
base = np.maximum(base, near * chain * (im[..., 3] > 0.5))
layers = {}
for lname, m in (('base', base), ('chain', chain), ('grip', grip)):
    rgba = im.copy()
    rgba[..., 3] = im[..., 3] * m
    layers[lname] = save_layer('robot_' + lname, rgba)
fx, fy = feet(im[..., 3])
rig['props']['robot_arm'] = {'w': W, 'h': H, 'feet': [fx, fy], 'layers': layers,
                             'pivots': {'chain': [80 * S, 175 * S], 'grip': [203 * S, 92 * S]},
                             'order': ['base', 'chain', 'grip']}


def rectify(name, quad, size, outname):
    im = load(name)
    src = np.array(quad, np.float32) * S
    w, h = size
    dst = np.array([(0, 0), (w, 0), (w, h), (0, h)], np.float32)
    M = cv2.getPerspectiveTransform(src, dst)
    out = cv2.warpPerspective(im, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    out[..., 3] = 1.0
    cv2.imwrite(os.path.join(OUT, 'tex', outname + '.png'), (out.clip(0, 1) * 255).round().astype(np.uint8))
    return 'tex/' + outname + '.png'


rig['props']['solar_panel'] = {'face': rectify('solar_panel', [(34, 19), (164, 9), (148, 172), (11, 177)],
                                               (512, 640), 'solar_face')}
rig['props']['laptop'] = {
    'screen': rectify('laptop', [(27, 9), (179, 9), (179, 121), (27, 121)], (512, 378), 'laptop_screen'),
    'deck': rectify('laptop', [(23, 125), (181, 125), (198, 152), (6, 152)], (512, 300), 'laptop_deck'),
    'front': rectify('laptop', [(6, 153), (198, 153), (198, 176), (6, 176)], (512, 60), 'laptop_front'),
}

with open(os.path.join(OUT, 'rig.json'), 'w') as f:
    json.dump(rig, f, indent=1)
print('ok')
