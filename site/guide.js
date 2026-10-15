// Terrain Press print guide: a landscape A4 PDF that comes with every download.
// Loaded only when someone exports. Uses three.js (already on the page) for the part renders and jsPDF for the pages.
(() => {
  const PW = 297, PH = 210, SPLIT = 152;              // page size (mm) and where the picture panel starts
  const LX = 18, LW = SPLIT - LX - 14;                 // left text column
  const INK = [20, 22, 26], SOFT = [88, 92, 100], PANEL = '#4a4b4e', PANEL_RGB = [74, 75, 78], LIGHT_PANEL = [236, 234, 229];
  const PLA_DENSITY = 1.24;                            // g/cm³

  // ---------- part renders ----------
  let R = null;
  function renderer(w, h) {
    if (!R) { const c = document.createElement('canvas'); R = new THREE.WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: true }); R.outputEncoding = THREE.sRGBEncoding; R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; }
    R.setPixelRatio(1); R.setSize(w, h, false); return R;
  }
  // view: 'front' (three-quarter from the front), 'top' (from above), 'low' (closer, lower: shows relief)
  function render(parts, colors, opt) {
    const W = opt.w || 960, H = opt.h || 1360, rr = renderer(W, H);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(opt.bg || PANEL);
    scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x2a2622, 0.55));
    const key = new THREE.DirectionalLight(0xfff6e8, 1.15); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005;
    const fill = new THREE.DirectionalLight(0xc8d4ff, 0.25);
    const group = new THREE.Group(), box = new THREE.Box3();
    for (const p of parts) {
      let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p.verts, 3)); g.setIndex(new THREE.BufferAttribute(p.idx, 1));
      if (p.role !== 'terrain') g = g.toNonIndexed();
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: colors[p.role] || '#cccccc', roughness: p.role === 'text' ? 0.45 : 0.85, metalness: p.role === 'text' ? 0.2 : 0 }));
      m.castShadow = m.receiveShadow = true; group.add(m);
    }
    scene.add(group); box.setFromObject(group);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), rad = Math.max(size.x, size.y, size.z * 2) / 2 * 1.08;
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(rad * 8, rad * 8), new THREE.ShadowMaterial({ opacity: 0.32 })); shadowPlane.position.set(c.x, c.y, box.min.z - 0.01); shadowPlane.receiveShadow = true; scene.add(shadowPlane);
    const cam = new THREE.PerspectiveCamera(opt.fov || 24, W / H, 1, 5000); cam.up.set(0, 0, 1);
    const dir = opt.view === 'top' ? new THREE.Vector3(0, -0.12, 1) : opt.view === 'low' ? new THREE.Vector3(0.35, -1, 0.55) : new THREE.Vector3(0.18, -1, 0.95);
    dir.normalize();
    const vf = cam.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect), dist = rad / Math.sin(Math.min(vf, hf) / 2) * (opt.zoom || 1);
    cam.position.copy(c).addScaledVector(dir, dist); cam.lookAt(c); cam.near = dist / 20; cam.far = dist * 4; cam.updateProjectionMatrix();
    key.position.copy(c).add(new THREE.Vector3(-rad * 1.4, -rad * 0.6, rad * 2.2)); key.target.position.copy(c); scene.add(key, key.target);
    Object.assign(key.shadow.camera, { left: -rad * 1.6, right: rad * 1.6, top: rad * 1.6, bottom: -rad * 1.6, near: 1, far: rad * 8 }); key.shadow.camera.updateProjectionMatrix();
    fill.position.copy(c).add(new THREE.Vector3(rad * 2, rad, rad)); scene.add(fill);
    rr.render(scene, cam);
    const url = rr.domElement.toDataURL('image/jpeg', 0.9);
    const project = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam); return [(v.x + 1) / 2, (1 - v.y) / 2]; };
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    return { url, project, box, aspect: W / H };
  }
  // handy points on a plate, for callouts
  function anchors(parts, role) {
    let best = null;
    for (const p of parts) { if (role && p.role !== role) continue; const v = p.verts;
      for (let i = 0; i < v.length; i += 3) { if (!best || v[i + 2] > best[2] + 1e-6 || (Math.abs(v[i + 2] - best[2]) < 1e-6 && v[i] < best[0])) best = [v[i], v[i + 1], v[i + 2]]; } }
    return best;
  }
  function bbox(parts, role) {
    const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const p of parts) { if (role && p.role !== role) continue; const v = p.verts;
      for (let i = 0; i < v.length; i += 3) { b.x0 = Math.min(b.x0, v[i]); b.x1 = Math.max(b.x1, v[i]); b.y0 = Math.min(b.y0, v[i + 1]); b.y1 = Math.max(b.y1, v[i + 1]); b.z0 = Math.min(b.z0, v[i + 2]); b.z1 = Math.max(b.z1, v[i + 2]); } }
    return b;
  }
  // the height of the terrain surface near (x, y): highest vertex in a small window
  function surfaceAt(parts, x, y, r) {
    let z = -Infinity;
    for (const p of parts) { if (p.role !== 'terrain') continue; const v = p.verts; for (let i = 0; i < v.length; i += 3) if (Math.abs(v[i] - x) < r && Math.abs(v[i + 1] - y) < r && v[i + 2] > z) z = v[i + 2]; }
    return z;
  }
  const grams = pl => { const shell = Math.min(pl.volume, pl.area * 0.8), g = (shell + 0.15 * Math.max(0, pl.volume - shell)) * PLA_DENSITY / 1000; return Math.max(1, Math.ceil(g)); };

  // ---------- page furniture ----------
  function wordmark(doc, font, x, y, h, rgb) {
    // "TERRAIN PRESS" in the app's own space-age lettering, drawn as vector outlines
    const text = 'TERRAIN PRESS', k = h / font.capHeight; let cx = x;
    doc.setFillColor(...rgb);
    for (const ch of text) {
      const g = font.glyphs[ch] || font.glyphs[ch.toUpperCase()];
      if (!g) { cx += font.capHeight * 0.4 * k; continue; }
      if (g.c && g.c.length) {
        for (const c of g.c) { for (let i = 0; i < c.length; i += 2) { const px = cx + c[i] * k, py = y - c[i + 1] * k; if (i === 0) doc.moveTo(px, py); else doc.lineTo(px, py); } doc.close(); }
        doc.fillEvenOdd();
      }
      cx += (g.ha + font.capHeight * 0.06) * k;
    }
    return cx - x;
  }
  function footer(doc, ctx, n) {
    if (ctx.font) wordmark(doc, ctx.font, LX, PH - 18, 4.2, INK); else { doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK); doc.text('TERRAIN PRESS', LX, PH - 18); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...SOFT);
    doc.text('Free and open source · ianbauters.github.io/terrain-press · Share and print freely.', LX, PH - 12.5);
    doc.text('Page ' + n, LX, PH - 9);
  }
  function title(doc, t, y = 34) { doc.setFont('helvetica', 'bold'); doc.setFontSize(21); doc.setTextColor(...INK); doc.text(t, LX, y); return y + 11; }
  function para(doc, t, y, size = 10.5, rgb = INK) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(...rgb);
    const lines = doc.splitTextToSize(t, LW); doc.text(lines, LX, y, { lineHeightFactor: 1.32 }); return y + lines.length * size * 0.3528 * 1.32 + 3.2;
  }
  function field(doc, label, value, y) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...INK); doc.text(label, LX, y);
    doc.setFont('helvetica', 'bold'); const lines = doc.splitTextToSize(value, LW); doc.text(lines, LX, y + 4.8, { lineHeightFactor: 1.25 });
    return y + 4.8 + lines.length * 4.6 + 4.2;
  }
  function specTable(doc, rows, y) {
    const lw = 46, vw = LW - lw, rh = 8.4;
    rows.forEach(([k, v], i) => {
      const yy = y + i * rh;
      doc.setFillColor(...INK); doc.rect(LX, yy, lw, rh, 'F');
      doc.setDrawColor(...INK); doc.setLineWidth(0.25); doc.rect(LX + lw, yy, vw, rh, 'S');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(255, 255, 255); doc.text(k, LX + 3, yy + 5.4);
      doc.setTextColor(...INK); const t = doc.splitTextToSize(v, vw - 6)[0]; doc.text(t, LX + lw + vw / 2, yy + 5.4, { align: 'center' });
    });
    return y + rows.length * rh + 8;
  }
  function panel(doc, img, rgb) {
    doc.setFillColor(...(rgb || PANEL_RGB)); doc.rect(SPLIT, 0, PW - SPLIT, PH, 'F');
    if (!img) return null;
    const pw = PW - SPLIT, ph = PH, a = img.aspect, w = Math.min(pw, ph * a), h = w / a, x = SPLIT + (pw - w) / 2, y = (ph - h) / 2;
    doc.addImage(img.url, 'JPEG', x, y, w, h, undefined, 'FAST');
    return { map: (u, v) => [x + u * w, y + v * h] };
  }
  // black label with a leader line to a dot on the picture; side: 'left' or 'right' of the dot
  function callout(doc, frame, img, pt, text, opt = {}) {
    if (!frame || !pt) return;
    const [u, v] = img.project(...pt), [dx, dy] = frame.map(u, v);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6);
    const tw = doc.getTextWidth(text) + 6, th = 6.6;
    let lx = opt.side === 'left' ? dx - (opt.len || 26) - tw : dx + (opt.len || 26), ly = dy + (opt.dy || 0) - th / 2;
    lx = Math.max(SPLIT + 4, Math.min(PW - 4 - tw, lx)); ly = Math.max(6, Math.min(PH - 6 - th, ly));
    const ex = lx + tw / 2 < dx ? lx + tw : lx, ey = ly + th / 2;
    doc.setDrawColor(10, 10, 10); doc.setLineWidth(0.5); doc.line(dx, dy, ex, ey);
    doc.setFillColor(10, 10, 10); doc.circle(dx, dy, 1.05, 'F'); doc.rect(lx, ly, tw, th, 'F');
    doc.setTextColor(255, 255, 255); doc.text(text, lx + 3, ly + 4.5);
  }
  function swatch(doc, hex, x, y) { const n = parseInt(hex.slice(1), 16); doc.setFillColor(n >> 16 & 255, n >> 8 & 255, n & 255); doc.setDrawColor(...INK); doc.setLineWidth(0.25); doc.roundedRect(x, y, 9, 9, 1.2, 1.2, 'FD'); }

  // ---------- the guide ----------
  async function make(ctx) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    doc.setProperties({ title: `${ctx.place} — print guide`, subject: 'Terrain Press print guide', creator: 'Terrain Press', author: 'Terrain Press' });
    const p = ctx.p, puzzle = p.product === 'puzzle', framed = p.border !== 'none', tray = framed && p.back, colors = ctx.colors;
    let page = 0;
    const next = () => { if (page) doc.addPage(); page++; };
    const done = () => footer(doc, ctx, page);

    // assembled model, from the plates (plates printed apart are shifted back into place)
    const ref = ctx.plates.find(pl => pl.reference), assembled = ref ? ref.parts.slice() : [];
    ctx.plates = ctx.plates.filter(pl => !pl.reference);
    if (!ref) for (const pl of ctx.plates) { if (pl.spread) continue; for (const q of pl.parts) {
      if (!pl.dz) { assembled.push(q); continue; }
      const v = new Float32Array(q.verts); for (let i = 2; i < v.length; i += 3) v[i] += pl.dz; assembled.push({ ...q, verts: v }); } }
    const hero = render(assembled.length ? assembled : ctx.plates[0].parts, colors, { view: 'front' });

    // 1 · cover
    next(); let y = 26;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...SOFT); doc.text('PRINT GUIDE', LX, y);
    doc.setFontSize(30); doc.setTextColor(...INK); const tl = doc.splitTextToSize(ctx.place, LW); doc.text(tl, LX, y + 13, { lineHeightFactor: 1.1 }); y += 13 + tl.length * 11.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.setTextColor(...SOFT); doc.text(`${ctx.world.name} · ${ctx.kind}`, LX, y); y += 13;
    y = field(doc, 'Centre', ctx.coords, y);
    y = field(doc, 'Area shown', `${ctx.size} km across`, y);
    y = field(doc, 'Model size', `${p.widthMm} mm terrain · ${ctx.footprint} overall`, y);
    y = field(doc, 'Relief', `${ctx.stats.reliefMm.toFixed(1)} mm printed · ${((ctx.stats.hMax - ctx.stats.hMin) / 1000).toFixed(1)} km real · ${p.exag}× exaggeration`, y);
    if (puzzle && ctx.pieces) y = field(doc, 'Pieces', `${ctx.pieces.list.length}`, y);
    // about the data, in small print under the facts
    y += 2; doc.setDrawColor(215, 215, 215); doc.setLineWidth(0.2); doc.line(LX, y - 3, LX + LW, y - 3); y += 2;
    const sample = ctx.stats.pxM < 1000 ? Math.round(ctx.stats.pxM) + ' m' : (ctx.stats.pxM / 1000).toFixed(1) + ' km';
    if (ctx.landmark) y = para(doc, `${ctx.landmark.name}: ${ctx.landmark.note}.`, y, 9, INK);
    y = para(doc, `Heights ${Math.round(ctx.stats.hMin)} m to ${Math.round(ctx.stats.hMax)} m, ${ctx.world.datum}, sampled every ${sample}. ${ctx.world.credit}`, y, 7.6, SOFT);
    y = para(doc, 'A decorative model, not survey-grade data. Not endorsed by NASA, the USGS or DLR. Terrain Press is free and open source (AGPL-3.0); what you make with it is yours to print, share and give away.', y, 7.6, SOFT);
    panel(doc, hero); done();

    // 3 · general print settings
    next(); y = title(doc, 'General Print Settings');
    y = para(doc, 'These settings work for every part. If a part page says otherwise, follow the part page.', y); y += 2;
    y = field(doc, 'Nozzle size', '0.4 mm', y);
    y = field(doc, 'Layer height', '0.12 to 0.16 mm  (finer layers show more of the relief)', y);
    y = field(doc, 'Supports', 'None', y);
    y = field(doc, 'Part orientation', 'As exported: flat side down', y);
    y = field(doc, 'Infill', '15 % gyroid', y);
    y = field(doc, 'Build plate', 'Any clean, flat plate. Textured PEI gives the base a fine finish.', y);
    panel(doc, render(assembled.length ? assembled : ctx.plates[0].parts, colors, { view: 'low', zoom: 0.82 })); done();

    // 4 · filament
    next(); y = title(doc, 'Filament');
    const total = ctx.plates.reduce((t, pl) => t + grams(pl), 0);
    y = field(doc, 'Material', 'PLA is all you need', y);
    y = field(doc, 'Finish', 'Matte PLA hides the layer lines, so the terrain reads best', y);
    y = field(doc, 'Ironing', 'Off. Ironing flattens the fine relief on top', y);
    y = field(doc, 'Filament use', `About ${total} g in total`, y);
    if (p.border === 'lettered') { y += 2; y = para(doc, `No multi-colour printer? Print the lettering in one colour with the frame, or pause at ${ctx.stats.frameTop.toFixed(2)} mm and swap filament for the letters.`, y, 9.5, SOFT); }
    panel(doc, hero); done();

    // 5 · one page per print plate
    for (const pl of ctx.plates) {
      next(); y = title(doc, pl.title);
      const qty = pl.key === 'pieces' || (pl.together && puzzle) ? `${pl.count} pieces` : '1 pcs';
      y = specTable(doc, [['Filament use', `ca. ${grams(pl)} g`], ['Quantity', qty], ['File', pl.files[0]]], y);
      const isPieces = pl.key === 'pieces', isFrame = pl.key === 'frame';
      y = field(doc, 'Wall count', isFrame ? '3 or more' : '2 or more', y);
      y = field(doc, 'Infill density', isFrame ? '20 % or more' : '15 %', y);
      if (isPieces || (pl.together && puzzle)) y = field(doc, 'Fit', `${p.gapMm} mm clearance is built in. Keep elephant-foot compensation on (about 0.1 mm) so the pieces slide together.`, y);
      if (pl.key === 'terrain') y = field(doc, 'Fit', `${p.gapMm} mm clearance to the frame. A drop of glue holds it in place.`, y);
      if ((isFrame || pl.together) && p.border === 'lettered') y = field(doc, 'Coloured letters', p.mergeText ? `Change filament at ${ctx.stats.frameTop.toFixed(2)} mm` : 'The lettering is a separate part: give it its own filament', y);
      const img = render(pl.parts, colors, { view: 'front' }), fr = panel(doc, img), b = bbox(pl.parts);
      if (pl.key === 'terrain' || isPieces || pl.together) {
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        callout(doc, fr, img, [cx, cy, surfaceAt(pl.parts, cx, cy, Math.max(1.5, (b.x1 - b.x0) / 40))], isPieces && pl.spread ? 'Spread apart: tabs clear their sockets' : 'Print in this orientation', { side: 'right', dy: -22 });
      }
      if (isFrame || pl.together) {
        const fb = bbox(pl.parts, 'frame'), tb = bbox(pl.parts, 'text');
        if (isFinite(tb.x0)) callout(doc, fr, img, [(tb.x0 + tb.x1) / 2, tb.y0 + 1, tb.z1], 'Lettering: its own filament', { side: 'right', dy: 18 });
        if (p.loop && isFinite(fb.y1)) { // the loop is the frame's highest-y point
          let best = null; for (const q of pl.parts) { if (q.role !== 'frame') continue; const v = q.verts; for (let i = 0; i < v.length; i += 3) if (!best || v[i + 1] > best[1]) best = [v[i], v[i + 1], v[i + 2]]; }
          if (best) callout(doc, fr, img, [best[0], best[1] - 2.5, fb.z1], 'Hanging loop', { side: 'right', dy: -6 });
        }
        if (isFrame && tray) callout(doc, fr, img, [(fb.x0 + fb.x1) / 2 + (fb.x1 - fb.x0) * 0.15, (fb.y0 + fb.y1) / 2, fb.z0 + p.backMm], 'Closed back holds the ' + (puzzle ? 'pieces' : 'terrain'), { side: 'left', dy: -30 });
      }
      done();
    }

    if (R) { R.dispose(); R = null; }
    return new Uint8Array(doc.output('arraybuffer'));
  }
  window.TPGuide = { make };
})();
