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

def dilate(mask, r):
    from PIL import ImageFilter
    im = Image.fromarray(mask.astype(np.uint8) * 255)
    remain = int(r)
    while remain > 0:
        step = min(7, remain)
        k = 2 * step + 1
        im = im.filter(ImageFilter.MaxFilter(k))
        remain -= step
    return np.array(im) > 0

def cut_sleep() -> Image.Image:
    """Cut Hana out of the sleep art, dropping the drawn pillow and Zzz."""
    rgb = np.array(Image.open(SRC / 'hana-sleep.jpg').convert('RGB')).astype(np.float32)
    h, w, _ = rgb.shape
    bg = np.array([255.0, 255.0, 255.0])
    dist = np.linalg.norm(rgb - bg, axis=2)

    def flood_mask(allowed, seeds):
        seen = np.zeros((h, w), dtype=bool)
        out = np.zeros((h, w), dtype=bool)
        q = deque()
        for y, x in seeds:
            y, x = int(y), int(x)
            if 0 <= y < h and 0 <= x < w and not seen[y, x]:
                q.append((y, x))
                seen[y, x] = True
        while q:
            y, x = q.popleft()
            if not allowed[y, x]:
                continue
            out[y, x] = True
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx]:
                    seen[ny, nx] = True
                    if allowed[ny, nx]:
                        q.append((ny, nx))
        return out

    def flood_border(allowed):
        seen = np.zeros((h, w), dtype=bool)
        out = np.zeros((h, w), dtype=bool)
        q = deque()
        for y in range(h):
            for x in (0, w - 1):
                q.append((y, x))
                seen[y, x] = True
        for x in range(w):
            for y in (0, h - 1):
                if not seen[y, x]:
                    q.append((y, x))
                    seen[y, x] = True
        while q:
            y, x = q.popleft()
            if not allowed[y, x]:
                continue
            out[y, x] = True
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx]:
                    seen[ny, nx] = True
                    if allowed[ny, nx]:
                        q.append((ny, nx))
        return out

    bgmask = flood_border(dist <= 14)
    keep = np.zeros((h, w), dtype=bool)
    for y, x in max(connected(~bgmask), key=len):
        keep[y, x] = True

    lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    chroma = np.max(np.abs(rgb - rgb.mean(axis=2, keepdims=True)), axis=2)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    core = keep & (lum > 215) & (chroma < 16)
    cores = sorted(connected(core), key=len, reverse=True)
    pillow_core = next(
        cells for cells in cores
        if (np.mean([p[0] for p in cells]) > 450 and np.mean([p[1] for p in cells]) < 450)
    )
    pillow_allow = (keep & (lum > 155) & (chroma < 22)) | (keep & (lum > 125) & (chroma < 18) & (lum < 200))
    pillow = flood_mask(pillow_allow, pillow_core)

    cand = keep & ~pillow & (lum > 135) & (lum < 235) & (chroma < 40)
    silver = np.zeros((h, w), dtype=bool)
    for cells in connected(cand):
        arr = np.array(cells)
        if arr[:, 0].mean() < 520 and len(cells) >= 40:
            for y, x in cells:
                silver[y, x] = True
    skin = keep & ~pillow & (r > 180) & (g > 130) & (b > 120) & (r > g + 12) & (r > b)
    red_tip = keep & ~pillow & (r > g + 18) & (r > b + 12) & (r > 90)
    cyan = keep & (b > r + 30) & (b > g) & (b > 120)
    dark_lock = keep & ~pillow & dilate(silver, 8) & (lum <= 130)
    protect = skin | silver | red_tip | cyan | dark_lock
    take = (dilate(pillow, 22) & keep & ~protect) | pillow

    hana = keep & ~take
    for cells in connected(hana):
        if len(cells) < 250:
            for y, x in cells:
                hana[y, x] = False
    for cells in connected(~hana & ~bgmask & ~take):
        if len(cells) < 80:
            for y, x in cells:
                hana[y, x] = True

    alpha = np.zeros((h, w), dtype=np.uint8)
    alpha[hana] = 255
    hana_u8 = hana.astype(np.uint8)
    neigh = (
        np.pad(hana_u8[1:], ((0, 1), (0, 0))) | np.pad(hana_u8[:-1], ((1, 0), (0, 0)))
        | np.pad(hana_u8[:, 1:], ((0, 0), (0, 1))) | np.pad(hana_u8[:, :-1], ((0, 0), (1, 0)))
        | np.pad(hana_u8[1:, 1:], ((0, 1), (0, 1))) | np.pad(hana_u8[1:, :-1], ((0, 1), (1, 0)))
        | np.pad(hana_u8[:-1, 1:], ((1, 0), (0, 1))) | np.pad(hana_u8[:-1, :-1], ((1, 0), (1, 0)))
    ).astype(bool)
    fringe = neigh & ~hana & ~take
    d = dist[fringe]
    a = np.clip((d - 6.0) / 20.0, 0.0, 1.0)
    alpha[fringe] = (a * 255).astype(np.uint8)
    out = rgb.copy()
    out[fringe] = np.clip(bg + (out[fringe] - bg) / np.maximum(a, 0.14)[:, None], 0, 255)

    # Keep the main silhouette only, so leftover specks do not inflate the crop.
    main = max(connected(alpha > 16), key=len)
    keep_main = np.zeros((h, w), dtype=bool)
    for y, x in main:
        keep_main[y, x] = True
    alpha = np.where(keep_main, alpha, 0).astype(np.uint8)

    ys, xs = np.where(alpha > 16)
    pad = 2
    y0, y1 = max(0, int(ys.min()) - pad), min(h, int(ys.max()) + 1 + pad)
    x0, x1 = max(0, int(xs.min()) - pad), min(w, int(xs.max()) + 1 + pad)
    rgba = np.dstack([np.clip(out, 0, 255).astype(np.uint8), alpha])
    return Image.fromarray(rgba[y0:y1, x0:x1], 'RGBA')

def save_sizes(master: Image.Image, name: str):
    master.save(OUT / f'{name}.png', optimize=True)
    print(f'{name}: {master.size[0]}x{master.size[1]}')
    for height in (512, 256, 128):
        W, H = master.size
        width = max(1, round(W * (height / H)))
        master.resize((width, height), Image.Resampling.NEAREST).save(OUT / f'{name}-{height}.png', optimize=True)

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
    sleep = cut_sleep()
    save_sizes(sleep, 'hana-sleep')

if __name__ == '__main__':
    main()
