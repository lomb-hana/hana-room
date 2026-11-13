#!/usr/bin/env python3
"""Cut Hana's pixel-art sprites out of the flat grey JPEG backgrounds."""
from pathlib import Path
from collections import deque
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'art-src'
OUT = ROOT / 'public' / 'sprites'

def flood(dist, seeds, thresh, vis):
    h, w = dist.shape
    q = deque()
    for y, x in seeds:
        if 0 <= y < h and 0 <= x < w and not vis[y, x] and dist[y, x] <= thresh:
            vis[y, x] = True
            q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not vis[ny, nx] and dist[ny, nx] <= thresh:
                vis[ny, nx] = True
                q.append((ny, nx))
    return vis

def connected(mask):
    h, w = mask.shape
    seen = np.zeros_like(mask)
    groups = []
    for y, x in zip(*np.where(mask)):
        if seen[y, x]:
            continue
        q = deque([(int(y), int(x))])
        seen[y, x] = True
        cells = [(int(y), int(x))]
        while q:
            cy, cx = q.popleft()
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
                    cells.append((ny, nx))
        groups.append(cells)
    return groups

def cut(name: str) -> Image.Image:
    rgb = np.array(Image.open(SRC / f'{name}.jpg').convert('RGB'))
    h, w, _ = rgb.shape
    border = np.concatenate([
        rgb[0:16].reshape(-1, 3), rgb[-16:].reshape(-1, 3),
        rgb[:, 0:16].reshape(-1, 3), rgb[:, -16:].reshape(-1, 3),
    ]).astype(np.float32)
    bg = np.median(border, axis=0)
    dist = np.linalg.norm(rgb.astype(np.float32) - bg, axis=2)
    vis = np.zeros((h, w), dtype=bool)
    vis[:8] = vis[-8:] = vis[:, :8] = vis[:, -8:] = True
    seeds = ([(8, x) for x in range(8, w - 8)] + [(h - 9, x) for x in range(8, w - 8)]
             + [(y, 8) for y in range(8, h - 8)] + [(y, w - 9) for y in range(8, h - 8)])
    flood(dist, seeds, 22, vis)
    leftover = (~vis) & (dist < 10)
    for cells in connected(leftover):
        if len(cells) < 80:
            continue
        arr = np.array(cells)
        mean_d = dist[arr[:, 0], arr[:, 1]].mean()
        std = rgb[arr[:, 0], arr[:, 1]].astype(np.float32).std()
        if mean_d <= 6.0 and std <= 3.5:
            flood(dist, cells, 15, vis)
    for cells in connected(~vis):
        if len(cells) < 200:
            for y, x in cells:
                vis[y, x] = True
    alpha = np.where(vis, 0, 255).astype(np.uint8)
    bg_u8 = vis.astype(np.uint8)
    touch = (
        np.pad(bg_u8[1:], ((0, 1), (0, 0))) | np.pad(bg_u8[:-1], ((1, 0), (0, 0)))
        | np.pad(bg_u8[:, 1:], ((0, 0), (0, 1))) | np.pad(bg_u8[:, :-1], ((0, 0), (1, 0)))
        | np.pad(bg_u8[1:, 1:], ((0, 1), (0, 1))) | np.pad(bg_u8[1:, :-1], ((0, 1), (1, 0)))
        | np.pad(bg_u8[:-1, 1:], ((1, 0), (0, 1))) | np.pad(bg_u8[:-1, :-1], ((1, 0), (1, 0)))
    ).astype(bool)
    edge = (~vis) & touch
    out = rgb.astype(np.float32).copy()
    d = dist[edge]
    a = np.clip((d - 8.0) / 22.0, 0.0, 1.0)
    a = np.where(d >= 30, 1.0, a)
    alpha[edge] = (a * 255).astype(np.uint8)
    aa = np.maximum(a, 0.14)[:, None]
    out[edge] = np.clip(bg + (out[edge] - bg) / aa, 0, 255)
    rgba = np.dstack([np.clip(out, 0, 255).astype(np.uint8), alpha])
    ys, xs = np.where(alpha > 16)
    pad = 1
    y0, y1 = max(0, int(ys.min()) - pad), min(h, int(ys.max()) + 1 + pad)
    x0, x1 = max(0, int(xs.min()) - pad), min(w, int(xs.max()) + 1 + pad)
    return Image.fromarray(rgba[y0:y1, x0:x1], 'RGBA')

def portrait(front: Image.Image) -> Image.Image:
    w, h = front.size
    a = np.array(front)[:, :, 3]
    y1 = int(h * 0.46)
    x0 = int(w * 0.22)
    ys, xs = np.where(a[:y1, x0:] > 16)
    hx0 = max(0, x0 + int(xs.min()) - 8)
    hx1 = min(w, x0 + int(xs.max()) + 8)
    hy0 = max(0, int(ys.min()) - 8)
    hy1 = min(h, int(ys.max()) + 8)
    crop = front.crop((hx0, hy0, hx1, hy1))
    cw, ch = crop.size
    side = max(cw, ch) + 12
    port = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    port.alpha_composite(crop, ((side - cw) // 2, (side - ch) // 2 + 4))
    return port

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    front = back = None
    for name in ('hana-front', 'hana-back'):
        master = cut(name)
        master.save(OUT / f'{name}.png', optimize=True)
        print(f'{name}: {master.size[0]}x{master.size[1]}')
        for height in (512, 256, 128):
            W, H = master.size
            width = max(1, round(W * (height / H)))
            master.resize((width, height), Image.Resampling.NEAREST).save(OUT / f'{name}-{height}.png', optimize=True)
        if name == 'hana-front':
            front = master
        else:
            back = master
    port = portrait(front)
    port.save(OUT / 'hana-portrait.png', optimize=True)
    for side in (128, 64):
        port.resize((side, side), Image.Resampling.NEAREST).save(OUT / f'hana-portrait-{side}.png', optimize=True)
    print('portrait:', port.size)

if __name__ == '__main__':
    main()
