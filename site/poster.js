// Terrain Press poster: an A4 landscape sheet with the place drawn as stacked layers (drawn by the worker) and three
// lines of text. Needs jsPDF (window.jspdf). Loaded when someone downloads.
(function (root) {
  const fontCache = {};
  async function font(url) {
    if (!fontCache[url]) fontCache[url] = fetch(url).then(r => { if (!r.ok) throw new Error('font'); return r.arrayBuffer(); }).then(b => {
      let s = ''; const u = new Uint8Array(b);
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      return btoa(s);
    });
    return fontCache[url];
  }
  // o: { png (Uint8Array), dark (bool), where ('NEPAL • NP'), name ('Mount Everest'), coords ('27.99°N 86.92°E') }
  async function make(o) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const [reg, bold] = await Promise.all([font('data/fonts/DejaVuSansMono.ttf'), font('data/fonts/DejaVuSansMono-Bold.ttf')]);
    doc.addFileToVFS('DejaVuSansMono.ttf', reg); doc.addFont('DejaVuSansMono.ttf', 'Mono', 'normal');
    doc.addFileToVFS('DejaVuSansMono-Bold.ttf', bold); doc.addFont('DejaVuSansMono-Bold.ttf', 'Mono', 'bold');
    const PW = 297, PH = 210, M = 16, ink = o.dark ? [242, 242, 242] : [17, 17, 17], soft = o.dark ? [170, 170, 170] : [90, 90, 90];
    doc.setProperties({ title: o.name, subject: `${o.where} · ${o.coords}`, creator: 'Terrain Press' });
    doc.setFillColor(...(o.dark ? [11, 11, 11] : [255, 255, 255])); doc.rect(0, 0, PW, PH, 'F');
    doc.setTextColor(...ink);
    doc.setFont('Mono', 'bold'); doc.setFontSize(8.5); doc.text(o.where.toUpperCase(), M, M + 3, { charSpace: 0.6 });
    doc.setFont('Mono', 'normal'); doc.setFontSize(30); doc.text(o.name, M, M + 17);
    doc.setTextColor(...soft); doc.setFontSize(8.5); doc.text(o.coords, M, M + 25, { charSpace: 0.3 });
    // the drawing: 3130 x 1724 px at 300 dpi = 265 x 146 mm, in the lower part of the page
    doc.addImage(o.png, 'PNG', M, PH - M - 146, 265, 146, undefined, 'FAST');
    return new Uint8Array(doc.output('arraybuffer'));
  }
  root.TPPoster = { make };
})(typeof self !== 'undefined' ? self : this);
