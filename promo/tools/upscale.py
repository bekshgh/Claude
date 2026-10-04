"""Upscale keyed RGBA sprites 2x via Real-ESRGAN (x4 then area-downsample)."""
import os
import sys
import time

import cv2
import numpy as np
import onnxruntime as ort


def fill_rgb(rgb, a, iters=24):
    """Extend edge colours into transparent areas so upscaling has no halos."""
    known = a > 0.6
    F = rgb * known[..., None]
    w = known.astype(np.float32)
    for _ in range(iters):
        num = cv2.blur(F, (3, 3))
        den = cv2.blur(w, (3, 3))
        newly = (den > 1e-4) & ~known
        F[newly] = num[newly] / den[newly][:, None]
        w[newly] = 1.0
        known |= newly
    if (~known).any():
        F[~known] = rgb[a > 0.6].mean(0)
    return F


class Upscaler:
    def __init__(self, model):
        so = ort.SessionOptions()
        so.intra_op_num_threads = os.cpu_count()
        self.sess = ort.InferenceSession(model, so, providers=['CPUExecutionProvider'])

    def run(self, img01, tile=160, pad=12):
        """img01: HxWx3 float in [0,1]. Returns 4x image."""
        H, W = img01.shape[:2]
        out = np.zeros((H * 4, W * 4, 3), np.float32)
        for y0 in range(0, H, tile):
            for x0 in range(0, W, tile):
                y1, x1 = min(y0 + tile, H), min(x0 + tile, W)
                ya, xa = max(y0 - pad, 0), max(x0 - pad, 0)
                yb, xb = min(y1 + pad, H), min(x1 + pad, W)
                patch = img01[ya:yb, xa:xb].transpose(2, 0, 1)[None].astype(np.float32)
                res = self.sess.run(None, {'input': patch})[0][0].transpose(1, 2, 0)
                out[y0 * 4:y1 * 4, x0 * 4:x1 * 4] = res[(y0 - ya) * 4:(y0 - ya + y1 - y0) * 4,
                                                        (x0 - xa) * 4:(x0 - xa + x1 - x0) * 4]
        return np.clip(out, 0, 1)


def upscale_sprite(up, path_in, path_out, factor=2):
    s = cv2.imread(path_in, cv2.IMREAD_UNCHANGED).astype(np.float32) / 255.0
    rgb, a = s[..., 2::-1].copy(), s[..., 3].copy()
    P = 8
    rgb = cv2.copyMakeBorder(fill_rgb(rgb, a), P, P, P, P, cv2.BORDER_REPLICATE)
    a = cv2.copyMakeBorder(a, P, P, P, P, cv2.BORDER_CONSTANT, value=0)
    rgb4 = up.run(rgb)
    a4 = up.run(np.repeat(a[..., None], 3, axis=2)).mean(axis=2)
    H, W = a.shape
    size = (W * factor, H * factor)
    rgb2 = cv2.resize(rgb4, size, interpolation=cv2.INTER_AREA)
    a2 = cv2.resize(a4, size, interpolation=cv2.INTER_AREA)
    c = P * factor
    rgb2, a2 = rgb2[c:-c, c:-c], a2[c:-c, c:-c]
    a2 = np.clip((a2 - 0.02) / 0.96, 0, 1)
    out = np.dstack([rgb2[..., ::-1], a2[..., None]])
    cv2.imwrite(path_out, (out * 255).round().clip(0, 255).astype(np.uint8))


if __name__ == '__main__':
    model, src_dir, dst_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    names = sys.argv[4:]
    os.makedirs(dst_dir, exist_ok=True)
    up = Upscaler(model)
    for n in names:
        t = time.time()
        upscale_sprite(up, os.path.join(src_dir, n + '.png'), os.path.join(dst_dir, n + '.png'))
        print(n, '%.1fs' % (time.time() - t), flush=True)
