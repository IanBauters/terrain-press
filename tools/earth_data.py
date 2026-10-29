"""Build Terrain Press's Earth tiles from NOAA ETOPO 2022 (60 arc-second surface elevation, public domain).

Usage: python tools/earth_data.py ETOPO_2022_v1_60s_N90W180_surface.tif site/data/earth [samples_dir]

Writes the same layout as every other world (see docs/DATA.md): 8192 x 4096 grid in 1024 px lossless-WebP tiles,
a 2048 x 1024 overview, a shaded globe.jpg, and meta.json values to paste into site/data/meta.json.
Heights are metres above mean sea level, ocean depths included.
"""
import json, math, os, sys, urllib.request
import numpy as np
import rasterio
from scipy.ndimage import map_coordinates
from PIL import Image

W, H, T, OVW, OVH = 8192, 4096, 1024, 2048, 1024


def resample(A, tr):
    # pixel-registered target, 3 x 3 samples per pixel averaged (the source is ~2.6x finer)
    pad = 4
    A = np.pad(A, ((0, 0), (pad, pad)), mode='wrap')
    out = np.empty((H, W), np.float32)
    offs = [(-1 / 3), 0.0, 1 / 3]
    lon = -180 + (np.arange(W) + 0.5) * 360 / W
    for r0 in range(0, H, 128):
        rows = np.arange(r0, min(H, r0 + 128))
        acc = np.zeros((len(rows), W), np.float64)
        for dy in offs:
            lat = 90 - (rows + 0.5 + dy) * 180 / H
            for dx in offs:
                lo = lon + dx * 360 / W
                col = (lo - tr.c) / tr.a - 0.5 + pad
                row = (lat - tr.f) / tr.e - 0.5
                cc, rr = np.meshgrid(col, row)
                acc += map_coordinates(A, [rr.ravel(), cc.ravel()], order=1, mode='nearest').reshape(acc.shape)
        out[rows] = acc / 9
    return out


def encode(h):
    v = (np.clip(np.rint(h), -32768, 32767).astype(np.int32) + 32768)
    rgb = np.zeros(h.shape + (3,), np.uint8)
    rgb[..., 0] = v >> 8
    rgb[..., 1] = v & 255
    return Image.fromarray(rgb, 'RGB')


def globe(h):
    g = h.reshape(H // 2, 2, W // 2, 2).mean(axis=(1, 3))
    # hillshade, sun from the north-west
    dy, dx = np.gradient(g)
    cell = 2 * math.pi * 6371000 / g.shape[1]
    lat = np.deg2rad(90 - (np.arange(g.shape[0]) + 0.5) * 180 / g.shape[0])[:, None]
    dx = dx / (cell * np.maximum(np.cos(lat), 0.05)); dy = dy / cell
    ex = 12.0
    nx, ny, nz = -dx * ex, dy * ex, np.ones_like(g)
    n = np.sqrt(nx * nx + ny * ny + 1)
    L = np.array([-0.6, 0.6, 0.55]); L = L / np.linalg.norm(L)
    shade = np.clip((nx * L[0] + ny * L[1] + nz * L[2]) / n, 0, 1)
    # colours: ocean from deep navy to light blue, land from green through tan and brown to white
    def ramp(x, stops):
        xs = np.array([s[0] for s in stops]); cs = np.array([s[1] for s in stops], np.float64)
        return np.stack([np.interp(x, xs, cs[:, k]) for k in range(3)], -1)
    sea = ramp(g, [(-9000, (8, 22, 52)), (-5000, (18, 46, 92)), (-2000, (34, 82, 140)), (-200, (66, 130, 180)), (0, (110, 170, 205))])
    land = ramp(g, [(0, (86, 120, 70)), (300, (120, 140, 80)), (1000, (170, 150, 100)), (2000, (150, 115, 85)), (3500, (165, 150, 140)), (5000, (240, 240, 240))])
    col = np.where((g > 0)[..., None], land, sea)
    # ice sheets (Greenland, Antarctica): high ground near the poles in white
    latd = np.broadcast_to(np.rad2deg(lat), g.shape)
    lond = np.broadcast_to(-180 + (np.arange(g.shape[1]) + 0.5) * 360 / g.shape[1], g.shape)
    green = (latd > 59.5) & (lond > -74) & (lond < -10)
    ice = np.where(latd < -60, np.clip(g / 50, 0, 1), 0) + np.where(green, np.clip((g - 300) / 500, 0, 1), 0)
    col = col * (1 - ice[..., None]) + np.array([232, 236, 242]) * ice[..., None]
    k = (0.55 + 0.6 * shade)[..., None]
    k = np.where((g > 0)[..., None], k, 0.8 + 0.25 * shade[..., None])
    return Image.fromarray(np.clip(col * k, 0, 255).astype(np.uint8), 'RGB')


def samples(out):
    # a few live terrain tiles (AWS Terrain Tiles, terrarium) so the app's live-detail code can be tested offline
    os.makedirs(out, exist_ok=True)
    places = {'matterhorn': (45.9763, 7.6586, 12), 'fuji': (35.3606, 138.7274, 11), 'borabora': (-16.50, -151.74, 11)}
    for name, (la, lo, z) in places.items():
        n = 2 ** z
        x = int((lo + 180) / 360 * n)
        y = int((1 - math.log(math.tan(math.radians(la)) + 1 / math.cos(math.radians(la))) / math.pi) / 2 * n)
        for yy in range(y - 1, y + 2):
            for xx in range(x - 1, x + 2):
                url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{xx}/{yy}.png'
                urllib.request.urlretrieve(url, os.path.join(out, f'{z}_{xx}_{yy}.png'))
        print('samples', name, z, x, y)


def main():
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    with rasterio.open(src) as ds:
        A = ds.read(1).astype(np.float32); tr = ds.transform; nod = ds.nodata
        print('source', ds.width, ds.height, tr, 'nodata', nod)
    if nod is not None:
        A[A == nod] = 0
    h = resample(A, tr); del A
    hi = np.clip(np.rint(h), -32768, 32767)
    for r in range(H // T):
        for c in range(W // T):
            encode(hi[r * T:(r + 1) * T, c * T:(c + 1) * T]).save(os.path.join(out, f't{r}_{c}.webp'), 'WEBP', lossless=True, quality=100, method=6)
    ov = np.clip(np.rint(h.reshape(OVH, H // OVH, OVW, W // OVW).mean(axis=(1, 3))), -32768, 32767)
    encode(ov).save(os.path.join(out, 'overview.webp'), 'WEBP', lossless=True, quality=100, method=6)
    globe(h).save(os.path.join(out, 'globe.jpg'), 'JPEG', quality=88)
    # round trip: decode what was written and compare
    back = np.asarray(Image.open(os.path.join(out, 'overview.webp')).convert('RGB')).astype(np.int64)
    dec = back[..., 0] * 256 + back[..., 1] - 32768
    assert np.array_equal(dec, ov.astype(np.int64)), 'overview did not round-trip'
    meta = {'radiusKm': 6371.0, 'w': W, 'h': H, 'tile': T, 'ovw': OVW, 'ovh': OVH,
            'min': float(hi.min()), 'max': float(hi.max()), 'check': int(dec[512].sum())}
    json.dump(meta, open(os.path.join(out, 'meta-earth.json'), 'w'), indent=1)
    print('meta', meta)
    if len(sys.argv) > 3:
        samples(sys.argv[3])


if __name__ == '__main__':
    main()
