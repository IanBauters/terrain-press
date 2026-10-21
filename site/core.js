// Terrain Press core: elevation sampling, solids, jigsaw cuts, lettering, STL/3MF/ZIP writers.
// Runs in a worker (or the page as a fallback). Needs poly2tri and ClipperLib.
(function (root) {
  const P2T = root.poly2tri, CL = root.ClipperLib;
  const SCALE = 1000; // clipper units per mm
  // ---------- elevation store ----------
  // Global grids are pixel-registered: 8192 x 4096, tiles 512, row 0 at the north.
  function makeStore(meta, loader) {
    // loader(path) -> Promise<Float32Array> (decoded, row-major)
    const cache = new Map();
    function get(path) {
      if (!cache.has(path)) cache.set(path, loader(path));
      return cache.get(path);
    }
    function nodeGrid(lat0, lon0, sizeKm, N, R) {
      // returns arrays of lat/lon for an N x N azimuthal-equidistant grid (row 0 = north edge)
      const lats = new Float64Array(N * N), lons = new Float64Array(N * N);
      const p0 = lat0 * Math.PI / 180, l0 = lon0 * Math.PI / 180;
      const sp = Math.sin(p0), cp = Math.cos(p0);
      for (let i = 0; i < N; i++) {
        const y = sizeKm / 2 - i * sizeKm / (N - 1);
        for (let j = 0; j < N; j++) {
          const x = -sizeKm / 2 + j * sizeKm / (N - 1);
          const rho = Math.hypot(x, y);
          let lat, lon;
          if (rho < 1e-9) { lat = p0; lon = l0; } else {
            const c = rho / R, sc = Math.sin(c), cc = Math.cos(c);
            lat = Math.asin(Math.max(-1, Math.min(1, cc * sp + y * sc * cp / rho)));
            lon = l0 + Math.atan2(x * sc, rho * cp * cc - y * sp * sc);
          }
          let ld = lon * 180 / Math.PI;
          ld = ((ld + 180) % 360 + 360) % 360 - 180;
          lats[i * N + j] = lat * 180 / Math.PI; lons[i * N + j] = ld;
        }
      }
      return { lats, lons };
    }
    function chooseSource(body, lat0, lon0, sizeKm, N) {
      const m = meta[body], R = m.radiusKm;
      const spacingKm = sizeKm / (N - 1);
      const g = nodeGrid(lat0, lon0, sizeKm, N, R);
      // hi-res patch if region falls entirely inside one
      if (m.patches) {
        for (const [id, p] of Object.entries(m.patches)) {
          let inside = true;
          for (let k = 0; k < g.lats.length && inside; k += 7) {
            const la = g.lats[k], lo = g.lons[k] < p.west ? g.lons[k] + 360 : g.lons[k]; // patches may cross 180°
            if (la > p.north || la < p.south || lo < p.west || lo > p.east) inside = false;
          }
          if (inside) {
            const pxKm = (Math.PI * R / 180) / p.ppd;
            return { kind: 'patch', id, grid: g, pxKm, label: `${p.ppd.toFixed(0)} px/deg`, paths: [`data/${body}/patch_${id}.webp`] };
          }
        }
      }
      const fullPxKm = (2 * Math.PI * R) / m.w;
      const ovPxKm = (2 * Math.PI * R) / m.ovw;
      if (spacingKm > ovPxKm * 0.7) {
        return { kind: 'overview', grid: g, pxKm: ovPxKm, label: `${(m.ovw / 360).toFixed(1)} px/deg`, paths: [`data/${body}/overview.webp`] };
      }
      const T = m.tile, set = new Set();
      for (let k = 0; k < g.lats.length; k++) {
        const fy = (90 - g.lats[k]) / 180 * m.h - 0.5, fx = (g.lons[k] + 180) / 360 * m.w - 0.5;
        for (const yy of [Math.floor(fy), Math.floor(fy) + 1]) for (const xx of [Math.floor(fx), Math.floor(fx) + 1]) {
          const y = Math.max(0, Math.min(m.h - 1, yy)), x = ((xx % m.w) + m.w) % m.w;
          set.add(`${(y / T) | 0}_${(x / T) | 0}`);
        }
      }
      return { kind: 'tiles', grid: g, pxKm: fullPxKm, label: `${(m.w / 360).toFixed(1)} px/deg`, paths: [...set].map(s => `data/${body}/t${s}.webp`) };
    }
    async function sample(body, lat0, lon0, sizeKm, N, onProgress) {
      const m = meta[body];
      const src = chooseSource(body, lat0, lon0, sizeKm, N);
      let done = 0;
      const arrays = await Promise.all(src.paths.map(p => get(p).then(a => { done++; onProgress && onProgress(done, src.paths.length); return a; })));
      const byPath = new Map(src.paths.map((p, i) => [p, arrays[i]]));
      const out = new Float32Array(N * N);
      const { lats, lons } = src.grid;
      let W, H, read;
      if (src.kind === 'patch') {
        const p = m.patches[src.id], A = arrays[0];
        W = p.w; H = p.h;
        for (let k = 0; k < out.length; k++) {
          const fy = (p.north - lats[k]) / (p.north - p.south) * H - 0.5;
          const lo = lons[k] < p.west ? lons[k] + 360 : lons[k];
          const fx = (lo - p.west) / (p.east - p.west) * W - 0.5;
          out[k] = bilinear(A, W, H, fx, fy, false);
        }
      } else if (src.kind === 'overview') {
        const A = arrays[0]; W = m.ovw; H = m.ovh;
        for (let k = 0; k < out.length; k++) {
          const fy = (90 - lats[k]) / 180 * H - 0.5, fx = (lons[k] + 180) / 360 * W - 0.5;
          out[k] = bilinear(A, W, H, fx, fy, true);
        }
      } else {
        W = m.w; H = m.h; const T = m.tile;
        const px = (x, y) => {
          y = Math.max(0, Math.min(H - 1, y)); x = ((x % W) + W) % W;
          const a = byPath.get(`data/${body}/t${(y / T) | 0}_${(x / T) | 0}.webp`);
          return a[(y % T) * T + (x % T)];
        };
        for (let k = 0; k < out.length; k++) {
          const fy = (90 - lats[k]) / 180 * H - 0.5, fx = (lons[k] + 180) / 360 * W - 0.5;
          const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
          const a = px(x0, y0), b = px(x0 + 1, y0), c = px(x0, y0 + 1), d = px(x0 + 1, y0 + 1);
          out[k] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
        }
      }
      return { heights: out, N, source: src };
    }
    async function globeSampler(body) {
      const m = meta[body], A = await get(`data/${body}/overview.webp`);
      return (lat, lon) => bilinear(A, m.ovw, m.ovh, (lon + 180) / 360 * m.ovw - 0.5, (90 - lat) / 180 * m.ovh - 0.5, true);
    }
    return { sample, chooseSource, globeSampler };
  }
  function bilinear(A, W, H, fx, fy, wrap) {
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const cy = y => Math.max(0, Math.min(H - 1, y));
    const cx = x => wrap ? ((x % W) + W) % W : Math.max(0, Math.min(W - 1, x));
    const g = (x, y) => A[cy(y) * W + cx(x)];
    return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
  }
  // ---------- 2D helpers (mm) ----------
  const toCL = pts => pts.map(p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) }));
  const fromCL = path => path.map(p => [p.X / SCALE, p.Y / SCALE]);
  function area(pts) { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return -a / 2; }
  function ccw(pts) { return area(pts) >= 0 ? pts : pts.slice().reverse(); }
  function cw(pts) { return area(pts) < 0 ? pts : pts.slice().reverse(); }

  function shapeOutline(shape, W) {
    const pts = [];
    if (shape === 'circle') {
      const n = 240; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([Math.cos(a) * W / 2, Math.sin(a) * W / 2]); }
    } else if (shape === 'hexagon') {
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; pts.push([Math.cos(a) * W / 2, Math.sin(a) * W / 2]); }
    } else {
      pts.push([-W / 2, -W / 2], [W / 2, -W / 2], [W / 2, W / 2], [-W / 2, W / 2]);
    }
    return pts;
  }
  function densify(pts, maxLen) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push(a);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / maxLen);
      for (let k = 1; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    return out;
  }
  function cleanRing(pts, minD) {
    const out = [];
    for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > minD) out.push(p); }
    while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= minD) out.pop();
    // drop collinear points
    const res = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cr) > 1e-7) res.push(b);
    }
    return res;
  }
  function offset(paths, delta, join) {
    const co = new CL.ClipperOffset(2, 0.05 * SCALE);
    co.AddPaths(paths.map(toCL), join === 'miter' ? CL.JoinType.jtMiter : CL.JoinType.jtRound, CL.EndType.etClosedPolygon);
    const sol = new CL.Paths(); co.Execute(sol, delta * SCALE);
    return sol.map(fromCL);
  }
  function boolOp(type, subj, clip) {
    const c = new CL.Clipper();
    c.AddPaths(subj.map(toCL), CL.PolyType.ptSubject, true);
    c.AddPaths(clip.map(toCL), CL.PolyType.ptClip, true);
    const tree = new CL.PolyTree();
    c.Execute(type, tree, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
    return polyTreeToExPolys(tree);
  }
  function exPolysFrom(paths) { // normalize a set of rings into outer+holes
    const c = new CL.Clipper(); c.AddPaths(paths.map(toCL), CL.PolyType.ptSubject, true);
    const tree = new CL.PolyTree(); c.Execute(CL.ClipType.ctUnion, tree, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
    return polyTreeToExPolys(tree);
  }
  function polyTreeToExPolys(tree) {
    const res = [];
    const walk = node => {
      for (const ch of node.Childs()) {
        if (!ch.IsHole()) {
          res.push({ outer: ccw(fromCL(ch.Contour())), holes: ch.Childs().map(h => cw(fromCL(h.Contour()))) });
          for (const h of ch.Childs()) walk(h);
        }
      }
    };
    walk(tree);
    return res;
  }
  const exArea = e => area(e.outer) + e.holes.reduce((s, h) => s + area(h), 0);

  // ---------- solid builder ----------
  // ex: {outer, holes}; topZ: number | fn(x,y); bottomZ number; step: Steiner grid spacing (0 = none)
  function pointInRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function distToRing(x, y, ring) {
    let best = Infinity;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const ax = ring[j][0], ay = ring[j][1], bx = ring[i][0], by = ring[i][1];
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      let t = L ? ((x - ax) * dx + (y - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - ax - t * dx, y - ay - t * dy); if (d < best) best = d;
    }
    return best;
  }
  function triangulate(ex, steiner) {
    const contour = ex.outer.map(p => new P2T.Point(p[0], p[1]));
    const sw = new P2T.SweepContext(contour, { cloneArrays: false });
    for (const h of ex.holes) sw.addHole(h.map(p => new P2T.Point(p[0], p[1])));
    if (steiner && steiner.length) sw.addPoints(steiner.map(p => new P2T.Point(p[0], p[1])));
    sw.triangulate();
    return sw.getTriangles().map(t => t.getPoints().map(p => [p.x, p.y]));
  }
  function steinerPoints(ex, step) {
    const pts = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of ex.outer) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    const rings = [ex.outer, ...ex.holes];
    // bucket edges for fast distance test
    const gs = step * 2, edges = new Map();
    const key = (i, j) => i + ',' + j;
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[j], b = r[i];
      const i0 = Math.floor(Math.min(a[0], b[0]) / gs) - 1, i1 = Math.floor(Math.max(a[0], b[0]) / gs) + 1;
      const j0 = Math.floor(Math.min(a[1], b[1]) / gs) - 1, j1 = Math.floor(Math.max(a[1], b[1]) / gs) + 1;
      for (let u = i0; u <= i1; u++) for (let v = j0; v <= j1; v++) { const k = key(u, v); if (!edges.has(k)) edges.set(k, []); edges.get(k).push([a, b]); }
    }
    const minD = step * 0.45;
    const x0 = Math.ceil(minX / step) * step, y0 = Math.ceil(minY / step) * step;
    for (let y = y0; y <= maxY; y += step) {
      for (let x = x0; x <= maxX; x += step) {
        if (!pointInRing(x, y, ex.outer)) continue;
        let inHole = false; for (const h of ex.holes) if (pointInRing(x, y, h)) { inHole = true; break; }
        if (inHole) continue;
        const near = edges.get(key(Math.floor(x / gs), Math.floor(y / gs)));
        let ok = true;
        if (near) for (const [a, b] of near) {
          const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
          let t = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
          if (Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) < minD) { ok = false; break; }
        }
        if (ok) pts.push([x + 1e-6 * ((x * 7.3 + y * 3.1) % 1), y + 1e-6 * ((x * 1.7 + y * 5.9) % 1)]);
      }
    }
    return pts;
  }
  // ---------- knurled edge: a criss-cross diamond texture on a frame's outer wall ----------
  // The outline is resampled evenly so the pattern repeats a whole number of times around it; the texture fades
  // out near the top and bottom edge, so the wall meets the flat faces exactly and the mesh stays closed.
  function knurlRing(ring, pitch) {
    const n = ring.length, cum = [0];
    for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(ring[i % n][0] - ring[i - 1][0], ring[i % n][1] - ring[i - 1][1]));
    const P = cum[n], reps = Math.max(8, Math.round(P / pitch)), m = reps * 4, out = [];
    let k = 0;
    for (let q = 0; q < m; q++) {
      const u = q / m * P; while (k < n - 1 && cum[k + 1] < u) k++;
      const a = ring[k], b = ring[(k + 1) % n], t = (u - cum[k]) / ((cum[k + 1] - cum[k]) || 1);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return { pts: out, pitch: P / reps };
  }
  function knurlWall(ring, pitch, depth, z0, z1, push) { // ring: ccw, from knurlRing
    const n = ring.length, nrm = [];
    for (let i = 0; i < n; i++) { // outward vertex normals of a ccw ring
      const a = ring[(i - 1 + n) % n], b = ring[i], c = ring[(i + 1) % n];
      let x = (b[1] - a[1]) + (c[1] - b[1]), y = -(b[0] - a[0]) - (c[0] - b[0]); const l = Math.hypot(x, y) || 1; nrm.push([x / l, y / l]);
    }
    const rows = Math.max(2, Math.round((z1 - z0) / (pitch / 4))), dz = (z1 - z0) / rows, fade = Math.min(0.6, (z1 - z0) / 3);
    const tent = v => { const f = v - Math.floor(v); return 1 - 2 * Math.abs(f - 0.5); };
    const P = (i, r) => {
      const z = z0 + r * dz, ii = ((i % n) + n) % n, s = ii / 4; // s in pitches along the wall
      const env = Math.max(0, Math.min(1, (z - z0) / fade, (z1 - z) / fade));
      const d = depth * env * Math.min(tent(s + (z - z0) / pitch + 0.5), tent(s - (z - z0) / pitch + 0.5));
      return [ring[ii][0] + nrm[ii][0] * d, ring[ii][1] + nrm[ii][1] * d, z];
    };
    for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
      const a0 = P(i, r), b0 = P(i + 1, r), a1 = P(i, r + 1), b1 = P(i + 1, r + 1);
      push(a0, b0, b1); push(a0, b1, a1);
    }
  }

  function solid(ex, topZ, bottomZ, step, out, knurl) {
    ex = { outer: ccw(cleanRing(ex.outer, 0.02)), holes: ex.holes.map(h => cw(cleanRing(h, 0.02))).filter(h => h.length >= 3) };
    if (ex.outer.length < 3) return;
    let kn = null; if (knurl) { kn = knurlRing(ex.outer, knurl.pitch); ex.outer = kn.pts; }
    const tz = typeof topZ === 'function' ? topZ : () => topZ;
    let tris;
    const st = step ? steinerPoints(ex, step) : [];
    try { tris = triangulate(ex, st); }
    catch (e) {
      try { tris = triangulate(ex, st.filter((_, i) => i % 2 === 0)); }
      catch (e2) { tris = triangulate(ex, []); }
    }
    const push = (a, b, c) => { out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };
    const zc = new Map();
    const z = p => { const k = p[0] + ',' + p[1]; let v = zc.get(k); if (v === undefined) { v = tz(p[0], p[1]); zc.set(k, v); } return v; };
    for (const t of tris) {
      let [a, b, c] = t;
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) [b, c] = [c, b];
      push([a[0], a[1], z(a)], [b[0], b[1], z(b)], [c[0], c[1], z(c)]);
    }
    // bottom: flat triangulation, reversed
    let btris = step ? null : tris;
    if (!btris) { try { btris = triangulate(ex, []); } catch (e) { btris = tris; } }
    for (const t of btris) {
      let [a, b, c] = t;
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0) [b, c] = [c, b];
      push([a[0], a[1], bottomZ], [b[0], b[1], bottomZ], [c[0], c[1], bottomZ]);
    }
    for (const ring of [ex.outer, ...ex.holes]) {
      if (kn && ring === ex.outer && typeof topZ !== 'function') { knurlWall(ring, kn.pitch, knurl.depth, bottomZ, topZ, push); continue; }
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const at = [a[0], a[1], z(a)], bt = [b[0], b[1], z(b)], ab = [a[0], a[1], bottomZ], bb = [b[0], b[1], bottomZ];
        push(ab, bb, bt); push(ab, bt, at);
      }
    }
  }

  // body: {outer ccw, holes cw} (holes = through-holes such as the hanging loop); pocket: ccw rings recessed down to floorZ
  // floorKnurl: {pitch, depth} — the same criss-cross diamonds as the knurled edge, on the pocket floor. The floor is
  // lowered by the depth, so whatever sits in the tray rests on the diamond tips at the original floor height.
  function traySolid(body, pocket, topZ, floorZ, out, knurl, floorKnurl) {
    const push = (a, b, c) => out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    let kn = null; if (knurl) { kn = knurlRing(body.outer, knurl.pitch); body = { outer: kn.pts, holes: body.holes }; }
    const face = (ex, z, up) => {
      for (const t of triangulate(ex, [])) {
        let [a, b, c] = t;
        const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if ((cr < 0) === up) [b, c] = [c, b];
        push([a[0], a[1], z], [b[0], b[1], z], [c[0], c[1], z]);
      }
    };
    const walls = (ring, z0, z1) => {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        push([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1]); push([a[0], a[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]);
      }
    };
    face(body, 0, false);
    face({ outer: body.outer, holes: [...body.holes, ...pocket.map(r => cw(r))] }, topZ, true);
    const fz = floorKnurl ? floorZ - floorKnurl.depth : floorZ;
    for (const r of pocket) if (floorKnurl) knurlFloor(r, fz, floorKnurl, push); else face({ outer: r, holes: [] }, fz, true);
    if (kn) knurlWall(body.outer, kn.pitch, knurl.depth, 0, topZ, push); else walls(body.outer, 0, topZ);
    for (const h of body.holes) walls(h, 0, topZ);
    for (const r of pocket) walls(cw(r), fz, topZ);
  }
  // A pocket floor covered in diamond pyramids, rising `depth` above fz, on a grid at 45°. Whole pyramids are built
  // directly (four flat facets each); the strip between them and the pocket wall is triangulated separately, with the
  // texture fading out within 1 mm of the wall, so the floor meets the wall at fz and the mesh stays closed.
  function knurlFloor(ring, fz, { pitch, depth }, push) {
    const r = ccw(ring), s2 = Math.SQRT1_2 * pitch, fade = 1.0;
    // grid corner (i, j) and the apex of cell (i, j), in mm; corners get a tiny fixed nudge so no three line up exactly
    const corner = (i, j) => { const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; const f = h - Math.floor(h);
      return [(i + j) * s2 + 1e-5 * (f - 0.5), (i - j) * s2 + 1e-5 * (((h * 7) % 1 + 1) % 1 - 0.5)]; };
    const apex = (i, j) => [(i + j + 1) * s2, (i - j) * s2];
    const tent = v => { const f = v - Math.floor(v); return 1 - 2 * Math.abs(f - 0.5); };
    const zAt = (x, y) => {
      const d = distToRing(x, y, r); if (d <= 1e-4) return fz;
      const u = (x + y) / (2 * s2), v = (x - y) / (2 * s2);
      return fz + depth * Math.min(1, d / fade) * Math.min(tent(u), tent(v));
    };
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const i0 = Math.floor((x0 + y0) / (2 * s2)) - 2, i1 = Math.ceil((x1 + y1) / (2 * s2)) + 2;
    const j0 = Math.floor((x0 - y1) / (2 * s2)) - 2, j1 = Math.ceil((x1 - y0) / (2 * s2)) + 2;
    const K = (i, j) => i + ',' + j, deep = new Map();
    const isDeep = (i, j) => { const k = K(i, j); if (!deep.has(k)) { const [x, y] = corner(i, j); deep.set(k, pointInRing(x, y, r) && distToRing(x, y, r) >= fade + 0.05); } return deep.get(k); };
    // whole pyramids: every corner a full fade away from the wall
    const C = new Set();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++)
      if (isDeep(i, j) && isDeep(i + 1, j) && isDeep(i + 1, j + 1) && isDeep(i, j + 1)) C.add(K(i, j));
    // no two pyramids touching only at a corner, and one connected patch
    for (let changed = true; changed;) {
      changed = false;
      for (const k of [...C]) { const [i, j] = k.split(',').map(Number);
        for (const [di, dj] of [[1, 1], [1, -1]]) if (C.has(K(i + di, j + dj)) && !C.has(K(i + di, j)) && !C.has(K(i, j + dj))) { C.delete(k); changed = true; break; } }
    }
    if (C.size) {
      const seen = new Set(), comps = [];
      for (const k of C) { if (seen.has(k)) continue; const comp = [], st = [k]; seen.add(k);
        while (st.length) { const c = st.pop(); comp.push(c); const [i, j] = c.split(',').map(Number);
          for (const n of [K(i + 1, j), K(i - 1, j), K(i, j + 1), K(i, j - 1)]) if (C.has(n) && !seen.has(n)) { seen.add(n); st.push(n); } }
        comps.push(comp); }
      comps.sort((a, b) => b.length - a.length); for (const comp of comps.slice(1)) for (const k of comp) C.delete(k);
    }
    const flat = () => { for (const t of triangulate({ outer: r, holes: [] }, [])) { let [a, b, c] = t;
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) [b, c] = [c, b]; push([a[0], a[1], fz], [b[0], b[1], fz], [c[0], c[1], fz]); } };
    if (C.size < 4) return flat();
    // outline of the pyramid patch: cell edges with no pyramid on the other side, chained into one loop
    const next = new Map(), cellEdges = (i, j) => [[[i, j], [i + 1, j], [i, j - 1]], [[i + 1, j], [i + 1, j + 1], [i + 1, j]], [[i + 1, j + 1], [i, j + 1], [i, j + 1]], [[i, j + 1], [i, j], [i - 1, j]]];
    for (const k of C) { const [i, j] = k.split(',').map(Number);
      for (const [a, b, n] of cellEdges(i, j)) if (!C.has(K(n[0], n[1]))) next.set(K(a[0], a[1]), b); }
    const startK = next.keys().next().value, loop = [];
    let cur = startK.split(',').map(Number);
    for (let g = 0; g <= next.size; g++) { loop.push(corner(cur[0], cur[1])); cur = next.get(K(cur[0], cur[1])); if (!cur || K(cur[0], cur[1]) === startK) break; }
    if (!cur || loop.length !== next.size) return flat(); // a patch with a hole in it: keep it simple
    // the strip between the wall and the patch, with grid points inside it so the fade follows the pattern
    const onPatch = new Set(); for (const k of C) { const [i, j] = k.split(',').map(Number); for (const [a, b] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) onPatch.add(K(a, b)); }
    const steiner = [], keepPt = ([x, y]) => pointInRing(x, y, r) && distToRing(x, y, r) >= 0.2;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      if (!onPatch.has(K(i, j))) { const c = corner(i, j); if (keepPt(c)) steiner.push(c); }
      if (!C.has(K(i, j))) { const a = apex(i, j); if (keepPt(a)) steiner.push(a); }
    }
    let band;
    try { band = triangulate({ outer: r, holes: [cw(loop)] }, steiner); }
    catch (e) { try { band = triangulate({ outer: r, holes: [cw(loop)] }, []); } catch (e2) { return flat(); } }
    const up = (a, b, c) => { if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) [b, c] = [c, b]; push(a, b, c); };
    for (const [a, b, c] of band) up([a[0], a[1], zAt(a[0], a[1])], [b[0], b[1], zAt(b[0], b[1])], [c[0], c[1], zAt(c[0], c[1])]);
    for (const k of C) { const [i, j] = k.split(',').map(Number), ap = apex(i, j), top = [ap[0], ap[1], fz + depth];
      for (const [a, b] of cellEdges(i, j)) { const pa = corner(a[0], a[1]), pb = corner(b[0], b[1]); up([pa[0], pa[1], fz], [pb[0], pb[1], fz], top); } }
  }

  // ---------- piece numbers, engraved into the underside ----------
  // Digit outlines from DejaVu Sans Mono Bold (the font Menlo, the classic Mac Terminal font, is based on), scaled so a
  // digit is 1 unit tall; flattened from the font's curves. Mirrored when engraved, so they read when the piece is turned over.
  const ENGRAVE_MM = 0.45;
  const MONO = {"adv":0.796,"h":1,"g":{"0":[[0.318,0.5,0.318,0.5,0.318,0.511,0.32,0.521,0.323,0.531,0.328,0.54,0.334,0.549,0.341,0.557,0.349,0.564,0.358,0.57,0.367,0.575,0.376,0.578,0.387,0.58,0.398,0.58,0.398,0.58,0.409,0.58,0.419,0.578,0.429,0.575,0.438,0.57,0.447,0.564,0.455,0.557,0.462,0.549,0.468,0.54,0.473,0.531,0.476,0.521,0.478,0.511,0.478,0.5,0.478,0.5,0.478,0.489,0.476,0.478,0.473,0.469,0.468,0.46,0.462,0.451,0.455,0.443,0.447,0.436,0.438,0.43,0.429,0.425,0.419,0.422,0.409,0.42,0.398,0.42,0.398,0.42,0.387,0.42,0.376,0.422,0.367,0.425,0.358,0.43,0.349,0.436,0.341,0.443,0.334,0.45,0.328,0.459,0.323,0.468,0.32,0.478,0.318,0.489,0.318,0.5],[0.398,0.839,0.398,0.839,0.377,0.836,0.358,0.83,0.341,0.818,0.326,0.803,0.313,0.783,0.301,0.758,0.292,0.728,0.285,0.693,0.279,0.653,0.275,0.607,0.272,0.556,0.271,0.5,0.271,0.5,0.272,0.443,0.275,0.392,0.279,0.347,0.285,0.307,0.292,0.272,0.301,0.242,0.313,0.217,0.326,0.197,0.341,0.182,0.358,0.17,0.377,0.164,0.398,0.161,0.398,0.161,0.419,0.164,0.438,0.17,0.455,0.182,0.47,0.197,0.483,0.217,0.495,0.242,0.504,0.272,0.511,0.307,0.517,0.347,0.521,0.392,0.524,0.443,0.525,0.5,0.525,0.5,0.524,0.556,0.521,0.607,0.517,0.653,0.511,0.693,0.504,0.728,0.495,0.758,0.483,0.783,0.47,0.803,0.455,0.818,0.438,0.83,0.419,0.836,0.398,0.839],[0.079,0.5,0.079,0.5,0.082,0.58,0.088,0.653,0.099,0.719,0.115,0.778,0.135,0.83,0.159,0.875,0.188,0.913,0.221,0.944,0.258,0.969,0.3,0.986,0.347,0.997,0.398,1,0.398,1,0.449,0.997,0.495,0.986,0.538,0.969,0.575,0.945,0.608,0.913,0.637,0.875,0.661,0.83,0.681,0.778,0.697,0.719,0.708,0.653,0.714,0.58,0.717,0.5,0.717,0.5,0.714,0.42,0.708,0.347,0.697,0.281,0.681,0.222,0.661,0.17,0.637,0.125,0.608,0.087,0.575,0.055,0.538,0.031,0.495,0.014,0.449,0.003,0.398,0,0.398,0,0.347,0.003,0.3,0.014,0.258,0.031,0.221,0.056,0.188,0.087,0.159,0.125,0.135,0.17,0.115,0.222,0.099,0.281,0.088,0.347,0.082,0.42,0.079,0.5]],"1":[[0.121,0.019,0.121,0.187,0.334,0.187,0.334,0.812,0.136,0.763,0.136,0.935,0.336,0.983,0.52,0.983,0.52,0.187,0.733,0.187,0.733,0.019,0.121,0.019]],"2":[[0.28,0.187,0.28,0.187,0.686,0.187,0.686,0.019,0.074,0.019,0.074,0.181,0.178,0.291,0.235,0.352,0.284,0.405,0.325,0.449,0.359,0.485,0.384,0.513,0.401,0.532,0.401,0.532,0.416,0.55,0.43,0.568,0.443,0.584,0.453,0.6,0.463,0.616,0.471,0.63,0.477,0.645,0.482,0.659,0.487,0.673,0.49,0.687,0.491,0.701,0.492,0.715,0.492,0.715,0.491,0.736,0.488,0.755,0.482,0.773,0.475,0.788,0.465,0.802,0.453,0.815,0.439,0.826,0.423,0.835,0.406,0.841,0.386,0.846,0.365,0.849,0.342,0.85,0.342,0.85,0.325,0.85,0.307,0.848,0.288,0.845,0.269,0.841,0.248,0.836,0.228,0.83,0.206,0.823,0.185,0.814,0.163,0.805,0.14,0.795,0.118,0.783,0.095,0.771,0.095,0.771,0.095,0.948,0.118,0.956,0.141,0.964,0.163,0.971,0.186,0.977,0.208,0.982,0.23,0.987,0.252,0.991,0.274,0.994,0.295,0.997,0.316,0.999,0.337,1,0.357,1,0.357,1,0.406,0.998,0.452,0.992,0.494,0.982,0.532,0.968,0.567,0.95,0.597,0.929,0.624,0.903,0.646,0.875,0.663,0.844,0.675,0.81,0.683,0.774,0.685,0.734,0.685,0.734,0.684,0.715,0.683,0.697,0.68,0.679,0.676,0.661,0.672,0.644,0.666,0.628,0.659,0.611,0.65,0.593,0.64,0.575,0.628,0.556,0.615,0.537,0.6,0.517,0.6,0.517,0.586,0.499,0.564,0.476,0.536,0.446,0.502,0.41,0.46,0.368,0.413,0.32,0.413,0.32,0.386,0.293,0.361,0.268,0.338,0.245,0.317,0.223,0.297,0.204,0.28,0.187]],"3":[[0.354,0.45,0.354,0.45,0.252,0.45,0.252,0.618,0.354,0.618,0.377,0.619,0.398,0.621,0.417,0.625,0.435,0.63,0.451,0.637,0.464,0.646,0.476,0.656,0.486,0.667,0.494,0.68,0.499,0.694,0.502,0.709,0.504,0.725,0.504,0.725,0.502,0.742,0.499,0.758,0.494,0.773,0.486,0.786,0.476,0.798,0.464,0.809,0.451,0.818,0.435,0.825,0.417,0.831,0.398,0.835,0.377,0.838,0.354,0.839,0.354,0.839,0.336,0.838,0.317,0.837,0.298,0.835,0.279,0.833,0.259,0.829,0.238,0.825,0.217,0.82,0.196,0.815,0.175,0.808,0.154,0.802,0.132,0.794,0.11,0.786,0.11,0.786,0.11,0.959,0.132,0.965,0.154,0.971,0.176,0.976,0.198,0.981,0.219,0.986,0.241,0.989,0.262,0.993,0.283,0.995,0.304,0.997,0.325,0.999,0.345,1,0.365,1,0.365,1,0.414,0.998,0.459,0.993,0.5,0.983,0.538,0.97,0.572,0.954,0.602,0.934,0.628,0.91,0.65,0.884,0.666,0.854,0.678,0.822,0.685,0.788,0.688,0.75,0.688,0.75,0.686,0.722,0.682,0.696,0.675,0.672,0.666,0.65,0.653,0.629,0.638,0.61,0.621,0.593,0.601,0.578,0.579,0.565,0.554,0.554,0.528,0.545,0.498,0.538,0.498,0.538,0.531,0.531,0.562,0.521,0.589,0.509,0.614,0.494,0.636,0.476,0.656,0.456,0.672,0.434,0.686,0.409,0.697,0.382,0.704,0.353,0.709,0.321,0.71,0.287,0.71,0.287,0.708,0.242,0.7,0.201,0.688,0.164,0.67,0.13,0.648,0.1,0.62,0.074,0.588,0.051,0.552,0.033,0.51,0.018,0.465,0.008,0.414,0.002,0.36,0,0.36,0,0.335,0,0.311,0.001,0.287,0.003,0.263,0.005,0.24,0.009,0.216,0.012,0.193,0.017,0.17,0.022,0.147,0.027,0.124,0.033,0.102,0.04,0.081,0.048,0.081,0.048,0.081,0.225,0.101,0.215,0.122,0.206,0.144,0.198,0.166,0.191,0.189,0.184,0.212,0.179,0.235,0.174,0.259,0.17,0.284,0.167,0.309,0.164,0.334,0.163,0.36,0.163,0.36,0.163,0.385,0.164,0.408,0.167,0.429,0.172,0.449,0.179,0.466,0.188,0.482,0.199,0.496,0.211,0.507,0.225,0.516,0.241,0.522,0.257,0.526,0.275,0.527,0.295,0.527,0.295,0.526,0.319,0.522,0.341,0.516,0.361,0.507,0.379,0.496,0.395,0.482,0.41,0.466,0.422,0.448,0.432,0.428,0.44,0.405,0.445,0.381,0.449,0.354,0.45]],"4":[[0.448,0.39,0.448,0.771,0.205,0.39,0.448,0.39],[0.066,0.411,0.431,0.983,0.631,0.983,0.631,0.39,0.737,0.39,0.737,0.227,0.631,0.227,0.631,0.019,0.448,0.019,0.448,0.227,0.066,0.227,0.066,0.411]],"5":[[0.125,0.444,0.125,0.983,0.648,0.983,0.648,0.815,0.279,0.815,0.279,0.636,0.287,0.639,0.295,0.641,0.303,0.644,0.311,0.646,0.32,0.648,0.329,0.649,0.338,0.65,0.347,0.651,0.356,0.652,0.365,0.653,0.375,0.653,0.385,0.653,0.385,0.653,0.431,0.651,0.474,0.643,0.515,0.631,0.552,0.613,0.586,0.591,0.617,0.563,0.644,0.531,0.667,0.497,0.684,0.459,0.696,0.418,0.704,0.375,0.706,0.328,0.706,0.328,0.704,0.279,0.696,0.234,0.682,0.192,0.663,0.154,0.639,0.119,0.61,0.088,0.576,0.061,0.538,0.039,0.496,0.022,0.45,0.01,0.4,0.002,0.347,0,0.347,0,0.326,0,0.305,0.001,0.284,0.003,0.263,0.005,0.242,0.007,0.221,0.01,0.2,0.014,0.179,0.018,0.158,0.023,0.136,0.029,0.114,0.035,0.092,0.041,0.092,0.041,0.092,0.213,0.11,0.205,0.128,0.197,0.147,0.19,0.165,0.184,0.184,0.178,0.202,0.173,0.221,0.169,0.24,0.166,0.259,0.163,0.278,0.162,0.297,0.16,0.316,0.16,0.316,0.16,0.348,0.161,0.377,0.165,0.404,0.171,0.428,0.179,0.45,0.19,0.469,0.203,0.485,0.218,0.498,0.236,0.508,0.256,0.515,0.278,0.52,0.302,0.521,0.328,0.521,0.328,0.52,0.352,0.515,0.375,0.508,0.396,0.498,0.415,0.485,0.433,0.469,0.449,0.451,0.463,0.431,0.474,0.408,0.483,0.384,0.489,0.358,0.493,0.331,0.495,0.331,0.495,0.314,0.494,0.296,0.493,0.279,0.491,0.262,0.489,0.245,0.486,0.228,0.482,0.211,0.477,0.194,0.472,0.177,0.466,0.159,0.46,0.142,0.452,0.125,0.444,0.125,0.444]],"6":[[0.415,0.502,0.415,0.502,0.395,0.5,0.377,0.497,0.36,0.49,0.346,0.482,0.332,0.47,0.321,0.457,0.311,0.441,0.302,0.422,0.296,0.402,0.292,0.379,0.289,0.354,0.288,0.327,0.288,0.327,0.289,0.3,0.292,0.275,0.296,0.252,0.302,0.232,0.311,0.213,0.321,0.197,0.332,0.184,0.346,0.172,0.36,0.164,0.377,0.157,0.395,0.154,0.415,0.152,0.415,0.152,0.435,0.154,0.453,0.157,0.47,0.164,0.485,0.172,0.498,0.184,0.51,0.197,0.52,0.213,0.529,0.232,0.535,0.252,0.54,0.275,0.543,0.3,0.544,0.327,0.544,0.327,0.543,0.354,0.54,0.379,0.535,0.401,0.529,0.422,0.52,0.44,0.51,0.456,0.498,0.47,0.485,0.482,0.47,0.49,0.453,0.497,0.435,0.5,0.415,0.502],[0.665,0.96,0.665,0.96,0.665,0.787,0.648,0.796,0.631,0.805,0.615,0.812,0.599,0.819,0.583,0.825,0.567,0.831,0.552,0.835,0.536,0.839,0.521,0.841,0.506,0.843,0.492,0.845,0.477,0.845,0.477,0.845,0.444,0.843,0.414,0.837,0.386,0.828,0.361,0.814,0.339,0.797,0.32,0.776,0.303,0.751,0.29,0.722,0.279,0.69,0.271,0.654,0.266,0.614,0.263,0.571,0.263,0.571,0.274,0.584,0.285,0.596,0.298,0.607,0.311,0.617,0.326,0.626,0.341,0.634,0.357,0.64,0.374,0.645,0.392,0.649,0.411,0.652,0.431,0.654,0.452,0.655,0.452,0.655,0.494,0.652,0.532,0.645,0.567,0.634,0.599,0.618,0.628,0.597,0.653,0.572,0.675,0.543,0.693,0.51,0.707,0.473,0.716,0.432,0.722,0.387,0.724,0.339,0.724,0.339,0.722,0.287,0.715,0.239,0.704,0.195,0.689,0.155,0.669,0.12,0.645,0.088,0.616,0.061,0.584,0.038,0.549,0.021,0.509,0.009,0.467,0.001,0.42,-0.001,0.42,-0.001,0.364,0.002,0.313,0.012,0.268,0.028,0.228,0.051,0.194,0.081,0.164,0.117,0.14,0.16,0.12,0.212,0.105,0.271,0.093,0.339,0.087,0.415,0.085,0.498,0.085,0.498,0.087,0.578,0.095,0.651,0.109,0.717,0.128,0.777,0.152,0.829,0.182,0.874,0.217,0.912,0.258,0.943,0.304,0.967,0.355,0.985,0.412,0.995,0.474,0.999,0.474,0.999,0.49,0.998,0.505,0.998,0.52,0.996,0.536,0.994,0.552,0.992,0.568,0.989,0.584,0.986,0.6,0.981,0.616,0.977,0.632,0.972,0.649,0.966,0.665,0.96]],"7":[[0.087,0.815,0.087,0.983,0.697,0.983,0.697,0.848,0.37,0.019,0.176,0.019,0.489,0.815,0.087,0.815]],"8":[[0.398,0.449,0.398,0.449,0.377,0.448,0.358,0.444,0.34,0.439,0.323,0.431,0.308,0.421,0.294,0.408,0.282,0.394,0.273,0.379,0.265,0.361,0.259,0.343,0.256,0.323,0.255,0.301,0.255,0.301,0.256,0.28,0.259,0.26,0.265,0.241,0.273,0.224,0.282,0.209,0.294,0.194,0.308,0.182,0.323,0.172,0.34,0.164,0.358,0.158,0.377,0.155,0.398,0.154,0.398,0.154,0.418,0.155,0.438,0.158,0.456,0.164,0.472,0.172,0.487,0.182,0.501,0.195,0.513,0.209,0.523,0.225,0.531,0.242,0.537,0.261,0.54,0.28,0.541,0.301,0.541,0.301,0.54,0.323,0.537,0.343,0.531,0.361,0.523,0.379,0.514,0.394,0.502,0.408,0.488,0.421,0.473,0.431,0.456,0.439,0.438,0.444,0.418,0.448,0.398,0.449],[0.256,0.529,0.256,0.529,0.233,0.539,0.212,0.549,0.192,0.562,0.175,0.576,0.159,0.591,0.145,0.608,0.134,0.627,0.124,0.647,0.117,0.668,0.111,0.691,0.108,0.715,0.107,0.74,0.107,0.74,0.109,0.779,0.116,0.815,0.127,0.848,0.142,0.878,0.161,0.906,0.185,0.93,0.213,0.952,0.244,0.969,0.277,0.983,0.314,0.992,0.354,0.998,0.398,1,0.398,1,0.441,0.998,0.481,0.992,0.518,0.983,0.552,0.969,0.583,0.952,0.611,0.93,0.635,0.906,0.654,0.878,0.669,0.848,0.68,0.815,0.687,0.779,0.689,0.74,0.689,0.74,0.688,0.715,0.685,0.691,0.679,0.669,0.672,0.648,0.663,0.628,0.651,0.609,0.638,0.592,0.623,0.576,0.605,0.562,0.586,0.55,0.565,0.539,0.542,0.529,0.542,0.529,0.568,0.52,0.592,0.509,0.614,0.495,0.634,0.479,0.651,0.462,0.668,0.442,0.681,0.42,0.693,0.397,0.701,0.372,0.708,0.346,0.711,0.319,0.713,0.29,0.713,0.29,0.71,0.245,0.704,0.204,0.692,0.167,0.676,0.133,0.656,0.102,0.631,0.076,0.601,0.052,0.568,0.034,0.531,0.019,0.491,0.008,0.446,0.002,0.398,0,0.398,0,0.349,0.002,0.305,0.008,0.264,0.019,0.228,0.034,0.194,0.052,0.165,0.076,0.14,0.102,0.12,0.133,0.104,0.167,0.092,0.204,0.086,0.245,0.083,0.29,0.083,0.29,0.085,0.319,0.088,0.346,0.095,0.372,0.104,0.397,0.115,0.42,0.129,0.442,0.145,0.462,0.164,0.48,0.184,0.496,0.206,0.509,0.23,0.52,0.256,0.529],[0.276,0.725,0.276,0.725,0.277,0.707,0.28,0.69,0.284,0.674,0.291,0.66,0.299,0.647,0.309,0.635,0.32,0.625,0.333,0.616,0.347,0.61,0.363,0.605,0.38,0.603,0.398,0.602,0.398,0.602,0.416,0.603,0.433,0.605,0.448,0.61,0.463,0.616,0.476,0.625,0.487,0.635,0.497,0.647,0.505,0.66,0.512,0.674,0.516,0.69,0.519,0.707,0.52,0.725,0.52,0.725,0.519,0.743,0.516,0.76,0.512,0.775,0.505,0.789,0.497,0.802,0.487,0.814,0.476,0.824,0.463,0.832,0.448,0.838,0.433,0.843,0.416,0.845,0.398,0.846,0.398,0.846,0.38,0.845,0.363,0.843,0.348,0.838,0.334,0.832,0.321,0.823,0.309,0.813,0.299,0.802,0.291,0.789,0.285,0.775,0.28,0.759,0.277,0.743,0.276,0.725]],"9":[[0.131,0.032,0.131,0.032,0.131,0.205,0.148,0.196,0.165,0.187,0.181,0.179,0.197,0.173,0.213,0.167,0.229,0.161,0.244,0.157,0.26,0.154,0.275,0.151,0.29,0.149,0.304,0.148,0.319,0.147,0.319,0.147,0.352,0.149,0.382,0.155,0.409,0.164,0.434,0.178,0.456,0.195,0.475,0.216,0.492,0.241,0.506,0.269,0.517,0.302,0.525,0.338,0.53,0.378,0.533,0.422,0.533,0.422,0.522,0.408,0.511,0.396,0.498,0.385,0.485,0.375,0.47,0.366,0.455,0.359,0.439,0.352,0.422,0.347,0.404,0.343,0.385,0.34,0.364,0.338,0.343,0.338,0.343,0.338,0.302,0.34,0.263,0.347,0.228,0.358,0.197,0.374,0.168,0.395,0.143,0.42,0.121,0.449,0.103,0.482,0.089,0.519,0.08,0.56,0.074,0.605,0.072,0.653,0.072,0.653,0.074,0.705,0.08,0.753,0.092,0.796,0.107,0.836,0.127,0.872,0.151,0.903,0.179,0.93,0.211,0.952,0.247,0.969,0.286,0.982,0.329,0.989,0.376,0.992,0.376,0.992,0.432,0.988,0.482,0.979,0.528,0.962,0.568,0.939,0.602,0.91,0.632,0.874,0.656,0.83,0.676,0.779,0.691,0.72,0.703,0.652,0.709,0.577,0.711,0.493,0.711,0.493,0.709,0.413,0.701,0.341,0.687,0.275,0.668,0.216,0.644,0.164,0.614,0.118,0.579,0.08,0.538,0.049,0.492,0.025,0.441,0.007,0.384,-0.003,0.321,-0.006,0.321,-0.006,0.306,-0.006,0.291,-0.005,0.276,-0.004,0.26,-0.002,0.244,0,0.228,0.003,0.212,0.007,0.196,0.011,0.18,0.015,0.164,0.02,0.147,0.026,0.131,0.032],[0.381,0.497,0.381,0.497,0.401,0.498,0.419,0.502,0.435,0.508,0.45,0.517,0.463,0.528,0.475,0.542,0.485,0.558,0.493,0.576,0.499,0.597,0.504,0.62,0.507,0.645,0.507,0.672,0.507,0.672,0.507,0.699,0.504,0.724,0.499,0.747,0.493,0.767,0.485,0.785,0.475,0.801,0.463,0.815,0.45,0.826,0.435,0.835,0.419,0.841,0.401,0.845,0.381,0.846,0.381,0.846,0.361,0.845,0.343,0.841,0.326,0.835,0.311,0.826,0.298,0.815,0.286,0.801,0.276,0.785,0.267,0.767,0.261,0.747,0.256,0.724,0.253,0.699,0.252,0.672,0.252,0.672,0.253,0.645,0.256,0.62,0.261,0.597,0.267,0.577,0.276,0.558,0.286,0.542,0.298,0.528,0.311,0.517,0.326,0.508,0.343,0.502,0.361,0.498,0.381,0.497]]}};
  function roomiest(ex) { // the point deepest inside the piece, and how far it is from the edge
    const rings = [ex.outer, ...ex.holes]; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of ex.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    let best = null, bd = -1; const n = 28;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * j / n;
      if (!pointInRing(x, y, ex.outer) || ex.holes.some(h => pointInRing(x, y, h))) continue;
      const d = Math.min(...rings.map(r => distToRing(x, y, r))); if (d > bd) { bd = d; best = [x, y]; }
    }
    return best ? { at: best, room: bd } : null;
  }
  // where and how large a number fits on a piece: { H, at, turn }, searching from size `top` down
  function numberFit(text, ex, top) {
    const keep = exPolysFrom(offset([ex.outer, ...ex.holes], -0.8, 'round')); // stay 0.8 mm inside the piece
    if (!keep.length) return null;
    const inKeep = (x, y) => keep.some(k => pointInRing(x, y, k.outer) && !k.holes.some(h => pointInRing(x, y, h)));
    const n = text.length, adv = MONO.adv, spot = roomiest(ex); if (!spot) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of ex.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cand = []; const g = 26;
    for (let i = 0; i <= g; i++) for (let j = 0; j <= g; j++) { const x = x0 + (x1 - x0) * i / g, y = y0 + (y1 - y0) * j / g; if (inKeep(x, y)) cand.push([x, y, Math.hypot(x - spot.at[0], y - spot.at[1])]); }
    cand.sort((a, b) => a[2] - b[2]);
    // the largest size (from `top`, at most 5.5 mm, down to 2.5 mm tall) at which the whole number fits somewhere
    const start = Math.min(5.5, top || 5.5);
    const largest = turn => {
      for (let H = start; H >= 2.5 - 1e-9; H -= 0.25) {
        const bw = n * adv * H / 2, bh = H / 2, hw = turn ? bh : bw, hh = turn ? bw : bh;
        const fits = (cx, cy) => { for (let k = 0; k <= 8; k++) { const t = k / 8, xs = cx - hw + 2 * hw * t, ys = cy - hh + 2 * hh * t;
          if (!inKeep(xs, cy - hh) || !inKeep(xs, cy + hh) || !inKeep(cx - hw, ys) || !inKeep(cx + hw, ys)) return false; } return true; };
        const at = cand.find(c => fits(c[0], c[1]));
        if (at) return { H, at, turn };
      }
      return null;
    };
    const up = largest(false);
    if (top) { // a set size: upright if it fits that way, otherwise turned
      if (up && up.H >= start - 1e-9) return up;
      const side = largest(true);
      return !up ? side : !side ? up : side.H > up.H ? side : up;
    }
    // free size: upright unless turning it lets the number be clearly (25 %) larger
    const side = !up || up.H < 4 ? largest(true) : null;
    return up && (!side || up.H >= side.H * 0.8) ? up : side;
  }
  // the number's outline, laid out at a spot found by numberFit
  function engraving(text, pick) {
    const n = text.length, adv = MONO.adv;
    if (pick) {
      const { H, turn } = pick, [cx, cy] = pick.at, totW = n * adv * H, c = new CL.Clipper();
      [...text].forEach((ch, k) => {
        for (const flat of MONO.g[ch] || []) {
          const path = [];
          for (let i = 0; i < flat.length; i += 2) {
            // laid out left to right around the centre, turned if needed, then mirrored in x so it reads from below
            let dx = -totW / 2 + (k * adv + flat[i]) * H, dy = -H / 2 + flat[i + 1] * H;
            if (turn) [dx, dy] = [-dy, dx];
            path.push([cx - dx, cy + dy]);
          }
          c.AddPath(toCL(path), CL.PolyType.ptSubject, true);
        }
      });
      const sol = new CL.Paths(); c.Execute(CL.ClipType.ctUnion, sol, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
      return sol.map(fromCL);
    }
    return null; // too small to read or print: this piece stays plain
  }

  // ---------- jigsaw ----------
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function chaikin(pts, it) {
    for (let k = 0; k < it; k++) {
      const o = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        o.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
      }
      o.push(pts[pts.length - 1]); pts = o;
    }
    return pts;
  }
  function tabEdge(a, b, dir, r) {
    const j = () => (r() - 0.5) * 0.06;
    const c = 0.5 + j();
    const T = [[0, 0], [c - 0.14, 0], [c - 0.07, 0.02], [c - 0.10, 0.10], [c - 0.16, 0.20], [c - 0.10, 0.30], [c, 0.32 + j() * .5], [c + 0.10, 0.30], [c + 0.16, 0.20], [c + 0.10, 0.10], [c + 0.07, 0.02], [c + 0.14, 0], [1, 0]];
    const s = chaikin(T, 4);
    const dx = b[0] - a[0], dy = b[1] - a[1], nx = -dy * dir, ny = dx * dir;
    return s.map(([u, v]) => [a[0] + dx * u + nx * v, a[1] + dy * u + ny * v]);
  }
  function jigsawCells(W, H, across, seed) {
    const cell = W / across, cols = across, rows = Math.max(1, Math.round(H / cell));
    const ch = H / rows, r = rng(seed);
    const X = i => -W / 2 + i * cell, Y = j => -H / 2 + j * ch;
    const hE = [], vE = [];
    for (let j = 0; j <= rows; j++) { hE[j] = []; for (let i = 0; i < cols; i++) { const a = [X(i), Y(j)], b = [X(i + 1), Y(j)]; hE[j][i] = (j === 0 || j === rows) ? [a, b] : tabEdge(a, b, r() < .5 ? 1 : -1, r); } }
    for (let i = 0; i <= cols; i++) { vE[i] = []; for (let j = 0; j < rows; j++) { const a = [X(i), Y(j)], b = [X(i), Y(j + 1)]; vE[i][j] = (i === 0 || i === cols) ? [a, b] : tabEdge(a, b, r() < .5 ? 1 : -1, r); } }
    const cells = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const p = [];
      p.push(...hE[j][i].slice(0, -1));
      p.push(...vE[i + 1][j].slice(0, -1));
      p.push(...hE[j + 1][i].slice().reverse().slice(0, -1));
      p.push(...vE[i][j].slice().reverse().slice(0, -1));
      cells.push({ i, j, pts: p });
    }
    return { cells, cellArea: cell * ch, cellW: cell, cellH: ch, cols, rows };
  }

  // ---------- shaped jigsaw (rings for circles, nested hexagons for hexagons) ----------
  let TAB_UNIT = null;
  function tabTemplate() {
    if (!TAB_UNIT) {
      const T = [[0.36, 0], [0.43, 0.02], [0.40, 0.10], [0.34, 0.20], [0.40, 0.30], [0.5, 0.32], [0.60, 0.30], [0.66, 0.20], [0.60, 0.10], [0.57, 0.02], [0.64, 0]];
      TAB_UNIT = chaikin(T, 4);
    }
    return TAB_UNIT;
  }
  // put a tab near the middle of a polyline; s = tab scale in mm, dir = +1/-1 side.
  // ang0 / ang1: the sharpest corner angle (degrees) a piece has at that end of the edge. Near a sharp corner the
  // knob is moved away and, if needed, made smaller, so the tip stays at least MIN_WALL thick even with a
  // socket on the neighbouring edge as well.
  const MIN_WALL = 2.8;
  // room a socket needs from a tip of angle A: between this socket and the other edge there must be the wall plus a
  // possible socket from that edge; a point x along this edge is x * sin(A) from the other edge.
  // (0.42 q covers the round bulb plus the printing clearance; the other edge's knob can be a little larger too)
  const tipRoom = (q, A, L) => A < 88 ? (MIN_WALL + 0.3 + 0.42 * q) / Math.sin(A * Math.PI / 180) : 0.05 * L;
  // how much spare length a socket of scale q has on an edge of length L whose socket piece has these end angles
  const tabSlack = (L, q, A0, A1) => L - tipRoom(q, A0, L) - tipRoom(q, A1, L) - 0.34 * q;
  let tabMayDrop = true;
  function tabOnPolyline(pts, s, dir, r, ang0 = 90, ang1 = 90) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1];
    const at = u => {
      let i = 1; while (i < cum.length - 1 && cum[i] < u) i++;
      const a = pts[i - 1], b = pts[i], seg = (cum[i] - cum[i - 1]) || 1, t = (u - cum[i - 1]) / seg;
      const tx = (b[0] - a[0]) / seg, ty = (b[1] - a[1]) / seg;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, -ty, tx];
    };
    let mid = L / 2 + (r() - 0.5) * 0.08 * L;
    if (tabMayDrop && (ang0 < 88 || ang1 < 88)) {
      for (let i = 0; i < 9; i++) {
        const lo = tipRoom(s, ang0, L) + 0.17 * s, hi = L - tipRoom(s, ang1, L) - 0.17 * s;
        if (lo <= hi) { mid = Math.min(hi, Math.max(lo, mid)); break; }
        if (i === 8) return pts; // no safe spot on this short edge: leave it straight, the piece locks through its other edges
        s *= 0.88; // edge too short for a full-size knob this close to a sharp corner
      }
    }
    const u0 = mid - 0.14 * s, u1 = mid + 0.14 * s;
    const out = [];
    for (let i = 0; i < pts.length; i++) if (cum[i] < u0) out.push(pts[i]);
    for (const [tu, tv] of tabTemplate()) {
      const p = at(mid + (tu - 0.5) * s);
      out.push([p[0] + p[2] * tv * s * dir, p[1] + p[3] * tv * s * dir]);
    }
    for (let i = 0; i < pts.length; i++) if (cum[i] > u1) out.push(pts[i]);
    return out;
  }
  // Strength check for a cut layout: a sharp corner of a piece must not hang on material thinner than `wall`.
  // Shrinking the piece by wall/2 splits such a tip off from the main body; count how many tips that happens to.
  function weakTips(pts, wall) {
    const inside = (R, x, y) => { let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) { const A = R[i], B = R[j]; if ((A[1] > y) !== (B[1] > y) && x < (B[0] - A[0]) * (y - A[1]) / (B[1] - A[1]) + A[0]) c = !c; } return c; };
    const area = R => { let t = 0; for (let i = 0, j = R.length - 1; i < R.length; j = i++) t += R[j][0] * R[i][1] - R[i][0] * R[j][1]; return t / 2; };
    const parts = offset([pts], -wall / 2, 'round').filter(q => Math.abs(area(q)) > 0.05).sort((x, y) => Math.abs(area(y)) - Math.abs(area(x)));
    if (!parts.length) return 0;
    const main = parts[0], n = pts.length; let weak = 0;
    for (let i = 0; i < n; i++) {
      const P = pts[(i - 1 + n) % n], V = pts[i], Q = pts[(i + 1) % n];
      const ax = P[0] - V[0], ay = P[1] - V[1], bx = Q[0] - V[0], by = Q[1] - V[1], la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (la < 1.5 || lb < 1.5) continue; // corners of the cut layout sit between long straight edges
      const th = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / la / lb)));
      if (th > 85 * Math.PI / 180) continue;
      const ux = ax / la + bx / lb, uy = ay / la + by / lb, ul = Math.hypot(ux, uy), d = (wall / 2 + 0.3) / Math.sin(th / 2);
      const X = V[0] + ux / ul * d, Y = V[1] + uy / ul * d;
      if (!inside(pts, X, Y)) continue; // reflex corner
      if (!inside(main, X, Y) && parts.slice(1).some(q => inside(q, X, Y))) weak++;
    }
    return weak;
  }
  // Try a few knob arrangements and keep the first (or strongest) one without weak tips.
  function radialCells(kind, W, across, seed, gapMm = 0.3) {
    let best = null;
    for (let t = 0; t < 8; t++) {
      const jc = radialCellsOnce(kind, W, across, seed + t * 7919);
      const clip = [shapeOutline(kind === 'circle' ? 'circle' : 'hexagon', W)];
      let weak = 0;
      for (const c of jc.cells) for (const e of boolOp(CL.ClipType.ctIntersection, [c.pts], clip)) weak += weakTips(e.outer, MIN_WALL + gapMm);
      if (!best || weak < best.weak) best = { jc, weak };
      if (!weak) break;
    }
    return best.jc;
  }
  function radialCellsOnce(kind, W, across, seed) {
    const a = W / across, r = rng(seed);
    // pieces under ~6 mm are too small to keep every tip 2.8 mm strong; there the knobs stay where they always were,
    // since dropping or shrinking them could leave a piece with nothing holding it
    tabMayDrop = a >= 5.8;
    const isHex = kind === 'hex';
    // C(rho, phi): point on the ring of size rho at perimeter fraction phi (0..1, ccw from +x)
    const V = isHex ? [...Array(7)].map((_, i) => [Math.cos(i * Math.PI / 3), Math.sin(i * Math.PI / 3)]) : null;
    const C = (rho, phi) => {
      phi = ((phi % 1) + 1) % 1;
      if (!isHex) return [rho * Math.cos(phi * 2 * Math.PI), rho * Math.sin(phi * 2 * Math.PI)];
      const f = phi * 6, s = Math.min(5, Math.floor(f)), t = f - s;
      return [rho * (V[s][0] * (1 - t) + V[s + 1][0] * t), rho * (V[s][1] * (1 - t) + V[s + 1][1] * t)];
    };
    // sharpest angle between a radial cut and the ring it meets, at perimeter fraction phi (hexagon corners: 60)
    const cutAngle = phi => {
      if (!isHex) return 90;
      const f = (((phi % 1) + 1) % 1) * 6, sd = Math.floor(f + 1e-9) % 6;
      if (Math.abs(f - Math.round(f)) < 1e-6) return 60;
      const P = C(1, phi), T = [V[sd + 1][0] - V[sd][0], V[sd + 1][1] - V[sd][1]];
      const c = Math.abs(P[0] * T[0] + P[1] * T[1]) / (Math.hypot(...P) * Math.hypot(...T));
      return Math.acos(Math.min(1, c)) * 180 / Math.PI;
    };
    const thick = isHex ? a / Math.cos(Math.PI / 6) : a;          // ring thickness along the size axis
    const Rout = W / 2 + 1.5;                                       // beyond the outline; clipping makes the edge
    // a generous centre piece: the landmark usually sits right in the middle, so keep it whole
    const rho1 = Math.max(a * 0.8, Math.min(thick * 1.2, Rout - thick * 0.9));
    const nR = Math.max(1, Math.round((Rout - rho1) / thick));
    const t = (Rout - rho1) / nR;
    const rho = [0, rho1]; for (let k = 1; k <= nR; k++) rho.push(rho1 + k * t);
    const K = rho.length - 1; // rho[K] = Rout
    // segment boundaries per ring k (between rho[k] and rho[k+1]), k = 1..K-1
    const B = [];
    for (let k = 1; k < K; k++) {
      const mid = (rho[k] + rho[k + 1]) / 2;
      let b = [];
      if (isHex) {
        let m = Math.max(1, Math.round(mid / a));
        if (k === 1 && K > 2) m = Math.max(1, Math.min(m, Math.floor(rho1 / (0.9 * a)))); // long centre edges = full-size knobs
        for (let s = 0; s < 6; s++) for (let j = 0; j < m; j++) b.push((s + j / m) / 6);
      } else {
        let m = Math.max(3, Math.round(2 * Math.PI * mid / a)); const off = r();
        if (k === 1 && K > 2) m = Math.max(3, Math.min(m, Math.floor(2 * Math.PI * rho1 / (0.9 * a))));
        for (let j = 0; j < m; j++) b.push(((off + j) / m) % 1);
      }
      B[k] = b.sort((x, y) => x - y);
    }
    // nodes on each ring circle rho[k], k = 1..K-1
    const N = [];
    for (let k = 1; k < K; k++) {
      const s = [...B[k], ...(k > 1 ? B[k - 1] : [])].sort((x, y) => x - y);
      const u = []; for (const v of s) if (!u.length || v - u[u.length - 1] > 1e-6) u.push(v);
      if (u.length > 1 && 1 + u[0] - u[u.length - 1] < 1e-6) u.pop();
      N[k] = u;
    }
    const ringPts = (k, p0, p1) => { // polyline on ring k from phi p0 to p1 (p1 > p0)
      const pts = [], steps = isHex ? null : Math.max(2, Math.ceil((p1 - p0) * 360));
      if (isHex) {
        pts.push(C(rho[k], p0));
        for (let s = Math.floor(p0 * 6 + 1e-9) + 1; s / 6 < p1 - 1e-9; s++) pts.push(C(rho[k], s / 6));
        pts.push(C(rho[k], p1));
      } else for (let i = 0; i <= steps; i++) pts.push(C(rho[k], p0 + (p1 - p0) * i / steps));
      return pts;
    };
    const polyLen = pts => pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);
    // ring edges: key k:i  (from N[k][i] to N[k][i+1])
    const ringEdge = new Map();
    for (let k = 1; k < K; k++) {
      const n = N[k];
      for (let i = 0; i < n.length; i++) {
        const p0 = n[i], p1 = i + 1 < n.length ? n[i + 1] : n[0] + 1;
        let pts = ringPts(k, p0, p1);
        const L = polyLen(pts);
        const cap = Math.min(k === 1 ? rho1 * 1.1 : t, t) * 0.95;
        // Corner angles of the two pieces this edge separates, at each end. The piece inside (ring k-1) has a corner
        // where a cut from ring k-1 ends here; the piece outside (ring k) where a cut of ring k starts here.
        const Rd = q => { const l = Math.hypot(q[0], q[1]) || 1; return [q[0] / l, q[1] / l]; };
        const dirAt = (u, v) => Rd([v[0] - u[0], v[1] - u[1]]);
        const T0 = dirAt(pts[0], pts[1]), T1 = dirAt(pts[pts.length - 2], pts[pts.length - 1]);
        const R0 = Rd(pts[0]), R1 = Rd(pts[pts.length - 1]);
        const ang = (u, v) => Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))) * 180 / Math.PI;
        const has = (list, q) => !!list && list.some(v => Math.abs(((v - q) % 1 + 1.5) % 1 - 0.5) < 1e-6);
        const corner = q => isHex && Math.abs(q * 6 - Math.round(q * 6)) < 1e-6;
        const q1 = p1 % 1;
        // centre piece (k = 1): its only corners are the hexagon's own 120 degree corners
        const in0 = k === 1 ? (corner(p0) ? 120 : 180) : has(B[k - 1], p0) ? ang([-R0[0], -R0[1]], T0) : 180;
        const in1 = k === 1 ? (corner(q1) ? 120 : 180) : has(B[k - 1], q1) ? ang([-R1[0], -R1[1]], [-T1[0], -T1[1]]) : 180;
        const out0 = has(B[k], p0) ? ang(R0, T0) : 180, out1 = has(B[k], q1) ? ang(R1, [-T1[0], -T1[1]]) : 180;
        // the sharper piece gets the knob (it adds material to the tip); the blunter one takes the socket.
        // ring edges run ccw, so dir -1 pushes the knob outward (inside piece owns it); the centre always gets knobs.
        const inSharp = Math.min(in0, in1), outSharp = Math.min(out0, out1), sz = Math.min(L * 0.9, cap);
        let dir = k === 1 ? -1 : Math.abs(inSharp - outSharp) > 3 ? (inSharp < outSharp ? -1 : 1) : (r() < 0.5 ? 1 : -1);
        if (k > 1) { // if the socket doesn't fit safely on the preferred side but does (better) on the other, swap
          const slack = d => d === -1 ? tabSlack(L, sz, out0, out1) : tabSlack(L, sz, in0, in1);
          if (slack(dir) < 0 && slack(-dir) > slack(dir)) dir = -dir;
        }
        const sock0 = dir === -1 ? out0 : in0, sock1 = dir === -1 ? out1 : in1; // corners of the piece with the socket
        if (k === 1 ? L > a * 0.3 : L > a * 0.6) pts = tabOnPolyline(pts, Math.min(L * 0.9, cap), dir, r, sock0, sock1);
        ringEdge.set(k + ':' + i, pts);
      }
    }
    const radEdge = new Map(); // ring k, boundary phi: inner -> outer
    for (let k = 1; k < K; k++) for (const p of B[k]) {
      const outer = k + 1 === K;
      const end = outer ? W / 2 : rho[k + 1];               // the outline, for the clipped outer ring
      let pts = [C(rho[k], p), C(end, p)];
      const L = end - rho[k];
      const seg = isHex ? a : 2 * Math.PI * (rho[k] + end) / 2 / B[k].length;
      // Corner angles at both ends of the cut, for the piece on each side. A cut to a hexagon corner gives both pieces
      // 120 degrees inside and 60 outside; a slanted cut gives one piece alpha / 180-alpha and the other the reverse.
      const Rr = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]], lr = Math.hypot(...Rr), Ru = [Rr[0] / lr, Rr[1] / lr];
      const Tq = (() => { const e = 1e-5, A = C(rho[k], p - e), Bq = C(rho[k], p + e), l = Math.hypot(Bq[0] - A[0], Bq[1] - A[1]); return [(Bq[0] - A[0]) / l, (Bq[1] - A[1]) / l]; })();
      const isCorner = isHex && Math.abs(p * 6 - Math.round(p * 6)) < 1e-6;
      const alpha = isCorner ? 120 : Math.acos(Math.max(-1, Math.min(1, Ru[0] * Tq[0] + Ru[1] * Tq[1]))) * 180 / Math.PI;
      const right = isCorner ? [120, 60] : [alpha, 180 - alpha], left = isCorner ? [120, 60] : [180 - alpha, alpha];
      // dir +1 puts the knob on the left piece (socket on the right one): random, unless only one side fits safely
      const sz = Math.min(L, seg) * 0.8;
      let dir = r() < 0.5 ? 1 : -1;
      const slack = d => d === 1 ? tabSlack(L, sz, right[0], right[1]) : tabSlack(L, sz, left[0], left[1]);
      if (slack(dir) < 0 && slack(-dir) > slack(dir)) dir = -dir;
      const sock = dir === 1 ? right : left;
      if (L > a * 0.45) pts = tabOnPolyline(pts, sz, dir, r, sock[0], sock[1]);
      if (outer) pts.push(C(rho[K] + 2, p));
      radEdge.set(k + ':' + p.toFixed(9), pts);
    }
    const ringPath = (k, p0, p1) => { // ring k from p0 to p1 ccw, through stored edges
      if (k === K) { const pts = ringPts(K, p0, p1 > p0 ? p1 : p1 + 1).map(q => q); return pts.map(([x, y]) => { const l = Math.hypot(x, y) || 1; return [x * (l + 2) / l, y * (l + 2) / l]; }); }
      const n = N[k], out = [];
      let i = n.findIndex(v => Math.abs(v - p0) < 1e-6);
      const target = n.findIndex(v => Math.abs(v - p1) < 1e-6);
      do {
        const e = ringEdge.get(k + ':' + i);
        out.push(...(out.length ? e.slice(1) : e));
        i = (i + 1) % n.length;
      } while (i !== target);
      return out;
    };
    const cells = [];
    // centre
    { const n = N[1], pts = []; for (let i = 0; i < n.length; i++) pts.push(...ringEdge.get('1:' + i).slice(0, -1)); cells.push({ i: 0, j: 0, pts }); }
    for (let k = 1; k < K; k++) {
      const b = B[k];
      for (let j = 0; j < b.length; j++) {
        const pa = b[j], pb = b[(j + 1) % b.length];
        const inner = ringPath(k, pa, pb);
        const outer = ringPath(k + 1, pa, pb).slice().reverse();
        const rb = radEdge.get(k + ':' + pb.toFixed(9)), ra = radEdge.get(k + ':' + pa.toFixed(9)).slice().reverse();
        const pts = [...inner.slice(0, -1), ...rb.slice(0, -1), ...outer.slice(0, -1), ...ra.slice(0, -1)];
        cells.push({ i: j, j: k, pts });
      }
    }
    return { cells, cellArea: a * a, cellW: a, cellH: a, cols: 1, rows: 1 };
  }

  // ---------- text ----------
  function exPolysEO(paths) { // even-odd: right for any outline direction (TrueType or CFF)
    const c = new CL.Clipper(); c.AddPaths(paths.map(toCL), CL.PolyType.ptSubject, true);
    const tree = new CL.PolyTree(); c.Execute(CL.ClipType.ctUnion, tree, CL.PolyFillType.pftEvenOdd, CL.PolyFillType.pftEvenOdd);
    return polyTreeToExPolys(tree);
  }
  // font: {resolution, capHeight, glyphs:{ch:{ha, c:[[x,y,x,y,...]]}}} in font units, y up
  function glyphRings(font, text, size) {
    const scale = size / font.resolution;
    const res = []; let x = 0;
    for (const ch of text) {
      const g = font.glyphs[ch] || (ch === '·' && font.glyphs['.']) || font.glyphs[ch.normalize('NFD')[0]] || font.glyphs['?'];
      if (!g) { x += size * 0.3; continue; }
      const rings = g.c.map(f => { const r = []; for (let i = 0; i < f.length; i += 2) r.push([f[i] * scale, f[i + 1] * scale]); return r; });
      res.push({ ch, x, exs: rings.length ? exPolysEO(rings) : [], adv: g.ha * scale });
      x += g.ha * scale;
    }
    return { glyphs: res, width: x };
  }
  function placeText(font, text, opts, out) {
    // opts: {mode:'arcBottom'|'arcTop'|'line', radius, y, capH, z0, z1}
    if (!text || !text.trim()) return;
    const size = opts.capH / ((font.capHeight || font.resolution * 0.7) / font.resolution);
    const { glyphs, width } = glyphRings(font, text, size);
    let usedWidth = width, sc = 1;
    if (opts.maxWidth && width > opts.maxWidth) sc = opts.maxWidth / width;
    usedWidth = width * sc;
    for (const g of glyphs) {
      const cx = (g.x + g.adv / 2) * sc - usedWidth / 2; // glyph centre along the line
      for (const ex of g.exs) {
        const tf = pts => pts.map(([u, v]) => {
          const lu = (u - g.adv / 2) * sc, lv = v * sc - opts.capH * sc / 2;
          if (opts.mode === 'line') return [cx + lu, opts.y + lv];
          const R = opts.radius;
          if (opts.mode === 'arcBottom') {
            const a = -Math.PI / 2 + cx / R;
            const t = [-Math.sin(a), Math.cos(a)], n = [-Math.cos(a), -Math.sin(a)];
            return [R * Math.cos(a) + lu * t[0] + lv * n[0], R * Math.sin(a) + lu * t[1] + lv * n[1]];
          }
          const a = Math.PI / 2 - cx / R;
          const t = [Math.sin(a), -Math.cos(a)], n = [Math.cos(a), Math.sin(a)];
          return [R * Math.cos(a) + lu * t[0] + lv * n[0], R * Math.sin(a) + lu * t[1] + lv * n[1]];
        });
        for (const e of exPolysFrom([tf(ex.outer), ...ex.holes.map(tf)])) solid(e, opts.z1, opts.z0, 0, out);
      }
    }
  }

  // ---------- model ----------
  // p: {shape, widthMm, product:'ornament'|'puzzle', exag, baseMm, frameMm, rimMm, textTop, textBottom, pieces, gapMm, loop, stepMm, seed}
  // hf: {heights Float32Array, N, sizeKm}
  function buildModel(p, hf, font) {
    const W = p.widthMm, N = hf.N, sizeKm = hf.sizeKm;
    let numH = 0; // height of the engraved piece numbers, the same on every piece
    const outline = shapeOutline(p.shape, W);
    const H = p.shape === 'hexagon' ? W * Math.sqrt(3) / 2 : W;
    const mmPerM = W / (sizeKm * 1000);
    // reference height = lowest point inside outline
    let hMin = Infinity, hMax = -Infinity;
    const gx = j => -W / 2 + j * W / (N - 1), gy = i => W / 2 - i * W / (N - 1);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (!pointInRing(gx(j), gy(i), outline) && distToRing(gx(j), gy(i), outline) > W / (N - 1) * 1.5) continue;
      const h = hf.heights[i * N + j]; if (h < hMin) hMin = h; if (h > hMax) hMax = h;
    }
    const base = p.baseMm, k = mmPerM * p.exag;
    const backed = p.back && (p.border || 'lettered') !== 'none';
    const floorZ = backed ? p.backMm : 0;
    const topZ = (x, y) => {
      const fj = (x + W / 2) / W * (N - 1), fi = (W / 2 - y) / W * (N - 1);
      const j0 = Math.max(0, Math.min(N - 2, Math.floor(fj))), i0 = Math.max(0, Math.min(N - 2, Math.floor(fi)));
      const tx = Math.max(0, Math.min(1, fj - j0)), ty = Math.max(0, Math.min(1, fi - i0));
      const A = hf.heights;
      const h = (A[i0 * N + j0] * (1 - tx) + A[i0 * N + j0 + 1] * tx) * (1 - ty) + (A[(i0 + 1) * N + j0] * (1 - tx) + A[(i0 + 1) * N + j0 + 1] * tx) * ty;
      return floorZ + base + Math.max(0, h - hMin) * k;
    };
    const step = p.stepMm;
    const parts = [];
    let grid = null;
    const reliefMm = (hMax - hMin) * k;
    // rim height above the base: exactly as set, or (optional) raised to about half the printed relief
    const frameTop = floorZ + base + (p.rimAuto ? Math.max(p.rimMm, Math.min(reliefMm * 0.55, 14)) : p.rimMm);
    const join = p.shape === 'circle' ? 'round' : 'miter';
    const outlineD = densify(outline, Math.max(0.6, step * 1.5));

    // terrain
    const terrain = [];
    if (p.product === 'puzzle') {
      const inner = offset([outline], -p.gapMm / 2, join);
      const jc = p.shape === 'square' ? jigsawCells(W, H, p.pieces, p.seed) : radialCells(p.shape === 'circle' ? 'circle' : 'hex', W, p.pieces, p.seed, p.gapMm), { cells, cellArea } = jc;
      grid = jc;
      let pieces = [];
      for (const c of cells) for (const e of boolOp(CL.ClipType.ctIntersection, [c.pts], inner)) pieces.push({ ex: e, a: exArea(e), cell: c });
      // merge slivers into a neighbour
      pieces.sort((a, b) => a.a - b.a);
      const big = pieces.filter(q => q.a >= cellArea * 0.35), small = pieces.filter(q => q.a < cellArea * 0.35);
      for (const s of small) {
        let best = null, bestA = 0;
        for (const b of big) {
          const ov = boolOp(CL.ClipType.ctIntersection, offset([s.ex.outer], 0.05, 'round'), [b.ex.outer]);
          const a = ov.reduce((t, e) => t + exArea(e), 0);
          if (a > bestA) { bestA = a; best = b; }
        }
        if (best) { const u = boolOp(CL.ClipType.ctUnion, [best.ex.outer, ...best.ex.holes], [s.ex.outer]); u.sort((x, y) => exArea(y) - exArea(x)); best.ex = u[0]; best.a = exArea(u[0]); }
        else big.push(s);
      }
      // a tip cut off by a socket (neck thinner than the clearance) goes to the neighbour it touches
      const neck = p.gapMm / 2 + 0.05;
      for (const q of big) {
        const op = exPolysFrom(offset(offset([q.ex.outer, ...q.ex.holes], -neck, 'round'), neck, 'round'));
        if (op.length < 2) continue;
        op.sort((x, y) => exArea(y) - exArea(x));
        for (const frag of op.slice(1)) {
          const grown = offset([frag.outer], neck + 0.1, 'round');
          const own = boolOp(CL.ClipType.ctIntersection, [q.ex.outer, ...q.ex.holes], grown);
          if (!own.length) continue;
          let best = null, bestA = 0;
          for (const o of big) {
            if (o === q) continue;
            const ov = boolOp(CL.ClipType.ctIntersection, offset(own.map(e => e.outer), 0.2, 'round'), [o.ex.outer]);
            const ar = ov.reduce((t, e) => t + exArea(e), 0);
            if (ar > bestA) { bestA = ar; best = o; }
          }
          if (!best) continue;
          const rest = boolOp(CL.ClipType.ctDifference, [q.ex.outer, ...q.ex.holes], own.flatMap(e => [e.outer, ...e.holes]));
          rest.sort((x, y) => exArea(y) - exArea(x)); if (rest.length) q.ex = rest[0];
          const u = boolOp(CL.ClipType.ctUnion, [best.ex.outer, ...best.ex.holes], own.flatMap(e => [e.outer, ...e.holes]));
          u.sort((x, y) => exArea(y) - exArea(x)); best.ex = u[0];
        }
      }
      // 1. final outline of every piece
      const outs = [];
      for (const q of big) {
        const shr = exPolysFrom(offset([q.ex.outer, ...q.ex.holes], -p.gapMm / 2, 'round'));
        shr.sort((x, y) => exArea(y) - exArea(x));
        if (shr.length) outs.push({ q, ex: shr[0] });
      }
      // 2. number them in reading order (squares row by row; circles and hexagons centre first, then ring by ring
      //    clockwise from 12 o'clock). Files, the piece map and the engraved numbers all use this.
      const cen = r => { let x = 0, y = 0, A = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const c = r[j][0] * r[i][1] - r[i][0] * r[j][1]; A += c; x += (r[j][0] + r[i][0]) * c; y += (r[j][1] + r[i][1]) * c; } return A ? [x / (3 * A), y / (3 * A)] : r[0]; };
      const cw0 = Math.min(grid.cellW || 1e9, grid.cellH || 1e9);
      outs.forEach(o => { o.c = cen(o.ex.outer); });
      if (p.shape === 'square') outs.sort((a, b) => Math.round(b.c[1] / cw0) - Math.round(a.c[1] / cw0) || a.c[0] - b.c[0]);
      else { const key = o => [o.q.cell.j, o.q.cell.j === 0 ? -1 : (Math.atan2(o.c[0], o.c[1]) + 2 * Math.PI) % (2 * Math.PI)]; outs.forEach(o => o.k = key(o)); outs.sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1]); }
      // 3. one number size for the whole puzzle: the largest that fits on every piece that can take a number
      if (p.pieceNumbers) {
        outs.forEach((o, k) => { o.fit = numberFit(String(k + 1), o.ex); });
        const hs = outs.filter(o => o.fit).map(o => o.fit.H);
        if (hs.length) numH = Math.min(...hs);
      }
      // 4. solids, with the number engraved into the underside if asked
      outs.forEach((o, k) => {
        const num = k + 1;
        let ex = o.ex, tris = [];
        const build = e => {
          tris = [];
          const e2 = { outer: densify(e.outer, Math.max(0.6, step * 1.5)), holes: e.holes };
          const eng = numH ? engraving(String(num), e === o.ex && o.fit && o.fit.H === numH ? o.fit : numberFit(String(num), e, numH)) : null;
          if (!eng) { solid(e2, topZ, floorZ, step, tris); return; }
          // a thin slab with the number cut out of it, and the rest of the piece on top (sunk 0.05 mm into the slab)
          solid(e2, topZ, floorZ + ENGRAVE_MM - 0.05, step, tris);
          for (const s2 of boolOp(CL.ClipType.ctDifference, [e.outer, ...e.holes], eng)) solid(s2, floorZ + ENGRAVE_MM, floorZ, 0, tris);
        };
        try { build(ex); }
        catch (err) {
          // a pinch where two tabs nearly touch: open the outline slightly and retry
          const fix = exPolysFrom(offset(offset([ex.outer, ...ex.holes], -0.15, 'round'), 0.15, 'round'));
          fix.sort((x, y) => exArea(y) - exArea(x)); ex = fix[0]; build(ex);
        }
        parts.push({ name: `Piece ${num}`, num, role: 'terrain', tris: new Float32Array(tris), cell: [o.q.cell.i, o.q.cell.j], ring: ex.outer });
      });
    } else {
      const tOut = p.separate ? densify(offset([outline], -p.gapMm / 2, join)[0], Math.max(0.6, step * 1.5)) : outlineD;
      solid({ outer: tOut, holes: [] }, topZ, floorZ, step, terrain);
      parts.push({ name: 'Terrain', role: 'terrain', tris: new Float32Array(terrain) });
    }

    // frame
    const border = p.border || 'lettered';
    const fW = p.frameMm;
    if (border !== 'none') {
    const frameInner = (p.product === 'puzzle' || p.separate) ? offset([outline], p.gapMm / 2, join) : [outline];
    const pocketRings = frameInner.slice();
    let frameOuter = offset([outline], p.frameMm, join);
    if (p.loop) {
      const top = p.shape === 'hexagon' ? H / 2 : W / 2;
      const cy = top + fW + 3.2, ring = [];
      for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; ring.push([Math.cos(a) * 5, cy + Math.sin(a) * 5]); }
      const neck = [[-4, top + fW * 0.5], [4, top + fW * 0.5], [4, cy], [-4, cy]];
      const u = boolOp(CL.ClipType.ctUnion, frameOuter, [ring, neck]);
      frameOuter = u.map(e => e.outer);
      const hole = []; for (let i = 0; i < 48; i++) { const a = -i / 48 * Math.PI * 2; hole.push([Math.cos(a) * 2.2, cy + Math.sin(a) * 2.2]); }
      frameInner.push(hole);
    }
    const ft = [];
    const knurl = p.knurl ? { pitch: 1.6, depth: 0.45 } : null; // the criss-cross grip texture on the outer wall
    if (backed) {
      // a tray: full-thickness floor under the pocket, rim around it
      const loopHoles = frameInner.slice(pocketRings.length);
      const body = boolOp(CL.ClipType.ctDifference, frameOuter, loopHoles);
      const pocket = pocketRings.map(r => ccw(cleanRing(densify(r, 1.2), 0.02)));
      const floorKnurl = p.floorKnurl && p.product === 'puzzle' && floorZ >= 1.25 ? { pitch: 1.6, depth: 0.45 } : null; // knurled floor for puzzle trays
      for (const e of body) traySolid({ outer: ccw(cleanRing(densify(e.outer, 1.2), 0.02)), holes: e.holes.map(h => cw(cleanRing(densify(h, 1.2), 0.02))) }, pocket, frameTop, floorZ, ft, knurl, floorKnurl);
    } else {
      const frameEx = boolOp(CL.ClipType.ctDifference, frameOuter, frameInner);
      for (const e of frameEx) solid({ outer: densify(e.outer, 1.2), holes: e.holes.map(h => densify(h, 1.2)) }, frameTop, 0, 0, ft, knurl);
    }
    parts.push({ name: 'Frame', role: 'frame', tris: new Float32Array(ft) });
    }

    // text
    if (border === 'lettered' && font && (p.textTop || p.textBottom)) {
      const tt = [], capH = Math.min(fW * 0.56, 5.5), z0 = frameTop - 0.2, z1 = frameTop + p.textMm;
      if (p.shape === 'circle') {
        const R = W / 2 + fW / 2, maxW = Math.PI * R * 0.8;
        placeText(font, p.textBottom, { mode: 'arcBottom', radius: R, capH, z0, z1, maxWidth: maxW }, tt);
        if (!p.loop) placeText(font, p.textTop, { mode: 'arcTop', radius: R, capH, z0, z1, maxWidth: maxW }, tt);
      } else {
        const yb = -(H / 2 + fW / 2), edge = p.shape === 'hexagon' ? W / 2 : W;
        placeText(font, p.textBottom, { mode: 'line', y: yb, capH, z0, z1, maxWidth: edge * 0.92 }, tt);
        if (!p.loop) placeText(font, p.textTop, { mode: 'line', y: -yb, capH, z0, z1, maxWidth: edge * 0.92 }, tt);
      }
      if (tt.length) {
        const fr = parts.find(x => x.role === 'frame');
        if (p.mergeText && fr) {
          const m = new Float32Array(fr.tris.length + tt.length); m.set(fr.tris); m.set(tt, fr.tris.length);
          fr.tris = m; fr.name = 'Frame with lettering';
        } else parts.push({ name: 'Lettering', role: 'text', tris: new Float32Array(tt) });
      }
    }
    return { parts, hMin, hMax, reliefMm, mmPerM, frameTop, grid, floorZ, numberMm: numH };
  }

  // Move puzzle pieces apart so every tab clears its socket. Returns new parts and the layout size.
  function spreadPieces(parts, grid, gapMm, dropZ = 0) {
    // shelf-pack the pieces by bounding box so no two can touch
    const items = [];
    for (const p of parts) {
      if (!p.cell) continue;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < p.tris.length; i += 3) { const x = p.tris[i], y = p.tris[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      items.push({ p, x0, y0, w: x1 - x0, h: y1 - y0 });
    }
    const area = items.reduce((s, it) => s + (it.w + gapMm) * (it.h + gapMm), 0);
    const maxW = Math.max(Math.sqrt(area) * 1.15, ...items.map(it => it.w + gapMm));
    items.sort((a, b) => b.h - a.h);
    let x = 0, y = 0, rowH = 0;
    for (const it of items) {
      if (x > 0 && x + it.w > maxW) { x = 0; y += rowH + gapMm; rowH = 0; }
      it.nx = x; it.ny = y; x += it.w + gapMm; rowH = Math.max(rowH, it.h);
    }
    const totW = Math.max(...items.map(it => it.nx + it.w)), totH = y + rowH;
    const out = items.map(it => {
      const dx = it.nx - totW / 2 - it.x0, dy = -(it.ny - totH / 2) - it.h - it.y0, t = new Float32Array(it.p.tris.length);
      for (let i = 0; i < t.length; i += 3) { t[i] = it.p.tris[i] + dx; t[i + 1] = it.p.tris[i + 1] + dy; t[i + 2] = it.p.tris[i + 2] - dropZ; }
      return { ...it.p, tris: t };
    });
    return { parts: out, width: totW, depth: totH, minX: -totW / 2, maxX: totW / 2 };
  }

  // ---------- writers ----------
  function stl(parts) {
    let n = 0; for (const p of parts) n += p.tris.length / 9;
    const buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
    const hdr = 'Terrain Press binary STL'; for (let i = 0; i < hdr.length; i++) dv.setUint8(i, hdr.charCodeAt(i));
    dv.setUint32(80, n, true);
    let o = 84;
    for (const p of parts) {
      const t = p.tris;
      for (let i = 0; i < t.length; i += 9) {
        const ux = t[i + 3] - t[i], uy = t[i + 4] - t[i + 1], uz = t[i + 5] - t[i + 2];
        const vx = t[i + 6] - t[i], vy = t[i + 7] - t[i + 1], vz = t[i + 8] - t[i + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const L = Math.hypot(nx, ny, nz) || 1;
        dv.setFloat32(o, nx / L, true); dv.setFloat32(o + 4, ny / L, true); dv.setFloat32(o + 8, nz / L, true);
        for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, t[i + k], true);
        o += 50;
      }
    }
    return new Uint8Array(buf);
  }
  function weld(tris) {
    const map = new Map(), verts = [], idx = new Uint32Array(tris.length / 3);
    for (let i = 0; i < tris.length; i += 3) {
      const k = Math.round(tris[i] * 1e4) + ',' + Math.round(tris[i + 1] * 1e4) + ',' + Math.round(tris[i + 2] * 1e4);
      let v = map.get(k);
      if (v === undefined) { v = verts.length / 3; map.set(k, v); verts.push(tris[i], tris[i + 1], tris[i + 2]); }
      idx[i / 3] = v;
    }
    return { verts, idx };
  }
  function model3mf(parts, colors, title) {
    const mats = [...new Set(parts.map(p => p.role))];
    let objs = '', comps = '', id = 2;
    for (const p of parts) {
      const { verts, idx } = weld(p.tris);
      const v = []; for (let i = 0; i < verts.length; i += 3) v.push(`<vertex x="${verts[i].toFixed(4)}" y="${verts[i + 1].toFixed(4)}" z="${verts[i + 2].toFixed(4)}"/>`);
      const t = []; for (let i = 0; i < idx.length; i += 3) { if (idx[i] === idx[i + 1] || idx[i + 1] === idx[i + 2] || idx[i] === idx[i + 2]) continue; t.push(`<triangle v1="${idx[i]}" v2="${idx[i + 1]}" v3="${idx[i + 2]}"/>`); }
      objs += `<object id="${id}" name="${esc(p.name)}" type="model" pid="1" pindex="${mats.indexOf(p.role)}"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object>`;
      comps += `<component objectid="${id}"/>`; id++;
    }
    const bm = mats.map(m => `<base name="${m}" displaycolor="${colors[m] || '#888888'}"/>`).join('');
    const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${esc(title)}</metadata><metadata name="Application">Terrain Press</metadata><resources><basematerials id="1">${bm}</basematerials>${objs}<object id="${id}" name="${esc(title)}" type="model"><components>${comps}</components></object></resources><build><item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 128 128 0"/></build></model>`;
    const ct = `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
    return [['[Content_Types].xml', ct], ['_rels/.rels', rels], ['3D/3dmodel.model', model]];
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  // entries: [[name, Uint8Array|string]]; deflate: async (u8)=>u8 | null
  async function zip(entries, deflate) {
    const enc = new TextEncoder(), chunks = [], central = [];
    let offset = 0;
    for (const [name, d] of entries) {
      const data = typeof d === 'string' ? enc.encode(d) : d;
      const crc = crc32(data);
      let comp = data, method = 0;
      if (deflate) { try { const c = await deflate(data); if (c.length < data.length) { comp = c; method = 8; } } catch (e) { } }
      const nm = enc.encode(name);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, comp.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), nm, comp);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true);
      ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, comp.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, nm.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nm);
      offset += 30 + nm.length + comp.length;
    }
    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const all = [...chunks, ...central, new Uint8Array(end.buffer)];
    const total = all.reduce((s, c) => s + c.length, 0), out = new Uint8Array(total);
    let o = 0; for (const c of all) { out.set(c, o); o += c.length; }
    return out;
  }

  root.TPCore = { makeStore, buildModel, spreadPieces, stl, model3mf, zip, weld, shapeOutline };
})(typeof self !== 'undefined' ? self : globalThis);
