const BUILD = '__BUILD__'; // changes whenever worker.js or core.js change, so browsers never run stale code
(() => {
'use strict';
const $ = id => document.getElementById(id);

// ---------------- catalogue ----------------
const WORLDS = {
  earth: { name: 'Earth', dot: '#4f86b8', terrain: '#8f9a86', grid: 'ETOPO 2022', liveName: 'AWS Terrain Tiles', landingTitle: 'Mountains and volcanoes', def: 'matterhorn',
    datum: 'above mean sea level, sea floor included',
    credit: 'Global grid: NOAA National Centers for Environmental Information, ETOPO 2022 Global Relief Model (60 arc-second version), public domain. Detail when online: AWS Terrain Tiles (Mapzen / Linux Foundation), combining SRTM (NASA, USGS), GMTED2010, ETOPO1, NED, EU-DEM, ArcticDEM, LINZ and others; see github.com/tilezen/joerd/blob/master/docs/attribution.md.',
    marks: [
      { id: 'matterhorn', group: 'landing', name: 'Matterhorn', note: '4,478 m pyramid above Zermatt', lat: 45.9763, lon: 7.6586, size: 8, ex: 1 },
      { id: 'everest', group: 'landing', name: 'Mount Everest', note: '8,849 m, the highest peak above sea level', lat: 27.9881, lon: 86.925, size: 30, ex: 1 },
      { id: 'k2', group: 'landing', name: 'K2', note: '8,611 m in the Karakoram', lat: 35.8808, lon: 76.5155, size: 25, ex: 1 },
      { id: 'montblanc', group: 'landing', name: 'Mont Blanc', note: '4,806 m, highest in the Alps', lat: 45.8326, lon: 6.8652, size: 20, ex: 1 },
      { id: 'jungfrau', group: 'landing', name: 'Eiger, Mönch and Jungfrau', note: 'The Bernese Oberland trio', lat: 46.56, lon: 7.98, size: 14, ex: 1 },
      { id: 'trecime', group: 'landing', name: 'Tre Cime di Lavaredo', note: 'Three towers in the Dolomites', lat: 46.6186, lon: 12.3047, size: 8, ex: 1 },
      { id: 'fuji', group: 'landing', name: 'Mount Fuji', note: '3,776 m stratovolcano', lat: 35.3606, lon: 138.7274, size: 40, ex: 1.5 },
      { id: 'kilimanjaro', group: 'landing', name: 'Kilimanjaro', note: '5,895 m, the roof of Africa', lat: -3.0674, lon: 37.3556, size: 50, ex: 1.2 },
      { id: 'denali', group: 'landing', name: 'Denali', note: '6,190 m, highest in North America', lat: 63.0692, lon: -151.007, size: 40, ex: 1 },
      { id: 'aconcagua', group: 'landing', name: 'Aconcagua', note: '6,961 m, highest in the Americas', lat: -32.6532, lon: -70.0109, size: 40, ex: 1 },
      { id: 'cook', group: 'landing', name: 'Aoraki / Mount Cook', note: '3,724 m in the Southern Alps', lat: -43.595, lon: 170.1418, size: 30, ex: 1 },
      { id: 'kailash', group: 'landing', name: 'Mount Kailash', note: 'Sacred 6,638 m peak in Tibet', lat: 31.0675, lon: 81.3119, size: 25, ex: 1 },
      { id: 'ararat', group: 'landing', name: 'Mount Ararat', note: '5,137 m volcano', lat: 39.7019, lon: 44.2983, size: 40, ex: 1 },
      { id: 'rainier', group: 'landing', name: 'Mount Rainier', note: '4,392 m glaciated volcano', lat: 46.8523, lon: -121.7603, size: 30, ex: 1.2 },
      { id: 'sthelens', group: 'landing', name: 'Mount St. Helens', note: 'Crater left by the 1980 eruption', lat: 46.1912, lon: -122.1944, size: 15, ex: 1.2 },
      { id: 'etna', group: 'landing', name: 'Etna', note: 'Europe\'s most active volcano', lat: 37.751, lon: 14.9934, size: 40, ex: 1.5 },
      { id: 'vesuvius', group: 'landing', name: 'Vesuvius', note: 'The volcano above Pompeii', lat: 40.8214, lon: 14.4264, size: 15, ex: 1.5 },
      { id: 'stromboli', group: 'landing', name: 'Stromboli', note: 'Island volcano rising from the sea floor', lat: 38.789, lon: 15.213, size: 8, ex: 1.5 },
      { id: 'teide', group: 'landing', name: 'Teide', note: '3,715 m volcano on Tenerife', lat: 28.2724, lon: -16.6425, size: 50, ex: 1.3 },
      { id: 'krakatoa', group: 'landing', name: 'Krakatoa', note: 'Anak Krakatau in the 1883 caldera', lat: -6.102, lon: 105.423, size: 15, ex: 2 },
      { id: 'hawaii', group: 'landing', name: 'Mauna Kea and Mauna Loa', note: 'Hawaii\'s Big Island, from the sea floor up', lat: 19.6, lon: -155.5, size: 160, ex: 1.5 },
      { id: 'grandcanyon', name: 'Grand Canyon', note: 'Carved by the Colorado River, 1.8 km deep', lat: 36.1, lon: -112.1, size: 40, ex: 1.5 },
      { id: 'monumentvalley', name: 'Monument Valley', note: 'Sandstone buttes on the Colorado Plateau', lat: 36.998, lon: -110.0985, size: 20, ex: 1.5 },
      { id: 'yosemite', name: 'Yosemite Valley', note: 'Half Dome and El Capitan', lat: 37.7459, lon: -119.5332, size: 15, ex: 1 },
      { id: 'craterlake', name: 'Crater Lake', note: 'Caldera of Mount Mazama', lat: 42.9446, lon: -122.109, size: 15, ex: 1.5 },
      { id: 'meteorcrater', name: 'Meteor Crater', note: '1.2 km impact crater in Arizona', lat: 35.0275, lon: -111.0225, size: 3, ex: 2 },
      { id: 'richat', name: 'Richat Structure', note: 'The Eye of the Sahara, 40 km of rings', lat: 21.124, lon: -11.4017, size: 50, ex: 4 },
      { id: 'uluru', name: 'Uluru', note: 'Sandstone monolith in central Australia', lat: -25.3444, lon: 131.0369, size: 8, ex: 2 },
      { id: 'ngorongoro', name: 'Ngorongoro Crater', note: 'Collapsed volcano, 19 km across', lat: -3.17, lon: 35.58, size: 30, ex: 1.5 },
      { id: 'tablemountain', name: 'Table Mountain', note: 'Flat-topped above Cape Town', lat: -33.9628, lon: 18.4098, size: 15, ex: 1.5 },
      { id: 'sugarloaf', name: 'Sugarloaf Mountain', note: 'Granite dome over Rio de Janeiro', lat: -22.9488, lon: -43.1566, size: 10, ex: 1.5 },
      { id: 'torres', name: 'Torres del Paine', note: 'Granite towers in Patagonia', lat: -50.9423, lon: -72.9701, size: 20, ex: 1 },
      { id: 'zhangjiajie', name: 'Zhangjiajie', note: 'Sandstone pillar forest', lat: 29.32, lon: 110.43, size: 15, ex: 1 },
      { id: 'chasteuil', name: 'Chasteuil', note: 'Hamlet above the Gorges du Verdon', lat: 43.8369, lon: 6.4227, size: 8, ex: 1 },
      { id: 'geiranger', name: 'Geirangerfjord', note: 'Steep fjord in western Norway', lat: 62.1, lon: 7.1, size: 20, ex: 1 },
      { id: 'gibraltar', name: 'Rock of Gibraltar', note: 'Limestone ridge at the strait', lat: 36.144, lon: -5.353, size: 8, ex: 1.5 },
      { id: 'santorini', name: 'Santorini', note: 'Flooded caldera in the Aegean', lat: 36.404, lon: 25.396, size: 25, ex: 2 },
      { id: 'borabora', name: 'Bora Bora', note: 'Volcanic island in its lagoon', lat: -16.5004, lon: -151.7415, size: 16, ex: 2 },
      { id: 'iceland', name: 'Iceland', note: 'The whole island, on the Mid-Atlantic Ridge', lat: 64.96, lon: -19.02, size: 550, ex: 6 },
      { id: 'alps', name: 'The Alps', note: 'The whole mountain arc', lat: 46.3, lon: 10.0, size: 800, ex: 5 },
      { id: 'challenger', name: 'Challenger Deep', note: 'Mariana Trench, about 10.9 km deep', lat: 11.3733, lon: 142.5917, size: 200, ex: 3 },
    ] },
  moon: { name: 'Moon', dot: '#bdb7a6', terrain: '#8e8d87', grid: 'LOLA LDEM_64', patchName: 'LOLA LDEM_1024', patchBadge: '83 m', landingTitle: 'Apollo landing sites', def: 'tycho',
    datum: 'above the 1737.4 km sphere',
    credit: 'NASA Lunar Reconnaissance Orbiter, Lunar Orbiter Laser Altimeter (LOLA) gridded data records LDEM_64 and LDEM_1024. LOLA Science Team, NASA GSFC; PDS Geosciences Node. Public domain. Tiles mirrored by the galaxy-3d project.',
    marks: [/*MOON*/] },
  mars: { name: 'Mars', dot: '#c0603a', terrain: '#b4552f', grid: 'MOLA MEGDR', landingTitle: 'Landers and rovers', def: 'curiosity',
    datum: 'above the reference ellipsoid',
    credit: 'NASA Mars Global Surveyor, Mars Orbiter Laser Altimeter (MOLA) Mission Experiment Gridded Data Record. MOLA Science Team; PDS Geosciences Node. Public domain. Tiles mirrored by the galaxy-3d project.',
    marks: [/*MARS*/] },
  mercury: { name: 'Mercury', dot: '#8f877c', terrain: '#8f8a82', grid: 'MESSENGER DEM', patchName: 'MESSENGER DEM, full res', patchBadge: '665 m', landingTitle: 'Spacecraft', def: 'rachmaninoff',
    datum: 'above the 2439.4 km sphere',
    credit: 'USGS Astrogeology Science Center, Mercury MESSENGER global DEM v2 (665 m, Becker et al. 2016), from NASA/JHUAPL/Carnegie Institution MESSENGER MDIS stereo images. Public domain.',
    marks: [/*MERCURY*/] },
  ceres: { name: 'Ceres', dot: '#8a9099', terrain: '#7f7f80', grid: 'Dawn HAMO DTM', patchName: 'Dawn HAMO DTM, full res', patchBadge: '180 m', landingTitle: '', def: 'occator',
    datum: 'above the 482 × 446 km reference ellipsoid',
    credit: 'NASA Dawn Framing Camera HAMO global DTM (DLR), via the PDS Small Bodies Node. Public domain. Tiles mirrored by the galaxy-3d project.',
    marks: [
      { id: 'occator', name: 'Occator', note: '92 km crater with bright salt deposits', lat: 19.82, lon: -120.67, size: 140, ex: 2 },
      { id: 'ahuna', name: 'Ahuna Mons', note: 'Lone 4 km ice volcano', lat: -10.48, lon: -43.97, size: 60, ex: 1.5 },
      { id: 'kerwan', name: 'Kerwan', note: '280 km basin, Ceres\'s largest', lat: -10.77, lon: 123.99, size: 380, ex: 2 },
      { id: 'yalode', name: 'Yalode', note: '260 km basin', lat: -42.58, lon: -67.52, size: 350, ex: 2 },
      { id: 'urvara', name: 'Urvara', note: '170 km crater with a central ridge', lat: -46.6, lon: -110.8, size: 240, ex: 2 },
      { id: 'dantu', name: 'Dantu', note: '126 km crater', lat: 24.3, lon: 138.2, size: 170, ex: 2 },
      { id: 'ernutet', name: 'Ernutet', note: '53 km crater with organic material', lat: 52.9, lon: 45.5, size: 80, ex: 2 },
      { id: 'haulani', name: 'Haulani', note: '34 km young bright crater', lat: 5.8, lon: 10.8, size: 50, ex: 2 },
    ] },
  vesta: { name: 'Vesta', dot: '#9a948a', terrain: '#8a857d', grid: 'Dawn HAMO DTM (DLR)', landingTitle: '', def: 'rheasilvia', shape: true,
    datum: 'above a best-fit smooth shape (Vesta is lumpy, so heights are relative to its overall egg shape)',
    credit: 'DLR / NASA Dawn Framing Camera HAMO global DTM (Preusker et al. 2013), PDS dataset DWNVSPG_2. Public domain. Longitudes use the Claudia double-prime system.',
    marks: [
      { id: 'rheasilvia', name: 'Rheasilvia', note: '500 km impact basin covering the south pole', lat: -75, lon: 91, size: 560, ex: 1 },
      { id: 'rheapeak', name: 'Rheasilvia central peak', note: 'About 20 km tall, one of the highest peaks in the solar system', lat: -79.8, lon: 76.4, size: 220, ex: 1 },
      { id: 'snowman', name: 'Snowman craters', note: 'Marcia, Calpurnia and Minucia in a row', lat: 15, lon: -14, size: 160, ex: 1.2 },
      { id: 'marcia', name: 'Marcia', note: '58 km young crater', lat: 9.5, lon: -20.75, size: 90, ex: 1.2 },
      { id: 'calpurnia', name: 'Calpurnia', note: '50 km crater, the snowman\'s middle', lat: 16.75, lon: -10.75, size: 90, ex: 1.2 },
      { id: 'divalia', name: 'Divalia Fossae', note: 'Giant equatorial troughs from the Rheasilvia impact', lat: -8, lon: -150, size: 300, ex: 2 },
    ] },
  venus: { name: 'Venus', dot: '#d29a55', terrain: '#b98a4f', grid: 'Magellan topography', landingTitle: 'Soviet landers (approximate)', def: 'maxwell',
    datum: 'above the 6051 km sphere',
    credit: 'USGS Astrogeology Science Center, Venus Magellan global topography (4641 m), from NASA/JPL Magellan radar altimetry. Public domain. Small radar gaps are filled smoothly.',
    marks: [
      { id: 'venera7', group: 'landing', name: 'Venera 7', note: '15 Dec 1970 · first landing on another planet', lat: -5, lon: -9, size: 700, ex: 8 },
      { id: 'venera8', group: 'landing', name: 'Venera 8', note: '22 Jul 1972', lat: -10.7, lon: -24.75, size: 700, ex: 8 },
      { id: 'venera9', group: 'landing', name: 'Venera 9', note: '22 Oct 1975 · first photo from the surface', lat: 31.0, lon: -68.4, size: 700, ex: 6 },
      { id: 'venera10', group: 'landing', name: 'Venera 10', note: '25 Oct 1975', lat: 15.4, lon: -68.5, size: 700, ex: 6 },
      { id: 'venera13', group: 'landing', name: 'Venera 13', note: '1 Mar 1982 · first colour photos', lat: -7.5, lon: -57.0, size: 700, ex: 8 },
      { id: 'venera14', group: 'landing', name: 'Venera 14', note: '5 Mar 1982', lat: -13.25, lon: -49.8, size: 700, ex: 8 },
      { id: 'vega1', group: 'landing', name: 'Vega 1', note: '11 Jun 1985 · also dropped a balloon', lat: 7.2, lon: 177.8, size: 700, ex: 8 },
      { id: 'vega2', group: 'landing', name: 'Vega 2', note: '15 Jun 1985', lat: -7.14, lon: 177.67, size: 700, ex: 8 },
      { id: 'maxwell', name: 'Maxwell Montes', note: 'Highest mountains, about 11 km', lat: 65.0, lon: 1.5, size: 900, ex: 4 },
      { id: 'maat', name: 'Maat Mons', note: 'Shield volcano, about 9 km', lat: 0.5, lon: -165.4, size: 600, ex: 6 },
      { id: 'sapas', name: 'Sapas Mons', note: 'Shield volcano with lava flows', lat: 8.5, lon: -171.7, size: 600, ex: 6 },
      { id: 'gula', name: 'Gula Mons', note: 'Volcano in western Eistla Regio', lat: 21.9, lon: -1.0, size: 600, ex: 6 },
      { id: 'sif', name: 'Sif Mons', note: 'Volcano in western Eistla Regio', lat: 22.0, lon: -7.6, size: 500, ex: 6 },
      { id: 'lakshmi', name: 'Lakshmi Planum', note: 'High plateau ringed by mountains', lat: 68.6, lon: -20.7, size: 2400, ex: 6 },
      { id: 'ishtar', name: 'Ishtar Terra', note: 'Northern highland continent', lat: 70, lon: 27.5, size: 5000, ex: 6 },
      { id: 'diana', name: 'Diana Chasma', note: 'Deep rift valley', lat: -14.6, lon: 155.8, size: 1200, ex: 6 },
      { id: 'artemis', name: 'Artemis Corona', note: '2,100 km ring-shaped corona', lat: -35, lon: 135, size: 2800, ex: 8 },
    ] },
  pluto: { name: 'Pluto', dot: '#c9a58e', terrain: '#c9b8a6', grid: 'New Horizons DEM', patchName: 'New Horizons DEM, full res', patchBadge: '300 m', landingTitle: '', def: 'sputnik', partial: true,
    datum: 'above the 1188.3 km sphere',
    credit: 'USGS Astrogeology Science Center, Pluto New Horizons global DEM (300 m, Schenk et al.), from NASA/JHUAPL/SwRI New Horizons LORRI and MVIC images. Public domain. Only the hemisphere New Horizons saw up close is mapped; the rest is a smooth fill.',
    marks: [
      { id: 'sputnik', name: 'Sputnik Planitia', note: 'Nitrogen-ice plain, the left half of the heart', lat: 18, lon: 178, size: 1300, ex: 10 },
      { id: 'tenzing', name: 'Tenzing Montes', note: 'Water-ice mountains, about 5 km', lat: -16.5, lon: 175.5, size: 260, ex: 2.5 },
      { id: 'wright', name: 'Wright Mons', note: 'Possible ice volcano with a central pit', lat: -21.5, lon: 172.5, size: 260, ex: 3 },
      { id: 'burney', name: 'Burney', note: '296 km crater', lat: 46, lon: 134, size: 400, ex: 4 },
      { id: 'tartarus', name: 'Tartarus Dorsa', note: 'Bladed terrain near the map edge', lat: 20, lon: 228, size: 500, ex: 4 },
    ] },
};
const MOON_HI = ['tycho', 'apollo11', 'apollo15'];
const PATCH_OF = { pluto: { tenzing: 'heart_west', wright: 'heart_west' } }; // landmarks served by a shared patch
const FONT_INFO = {
  worm: 'Based on Audiowide: rounded and wide, in the spirit of NASA\'s 1975 "worm" logo.',
  plaque: 'Based on Jost: an open Futura, the typeface on the plaque Apollo 11 left on the Moon.',
  technical: 'Based on Orbitron: squared-off and technical, like spacecraft labelling.',
};

// ---------------- state ----------------
const state = { world: 'moon', mark: null, lat: 0, lon: 0, size: 100, product: 'ornament', shape: 'circle', border: 'lettered', font: 'worm',
  detail: 0.35, colors: { terrain: '#8e8d87', frame: '#26282c', text: '#c8915a' } };
const PREVIEW_STEP = 0.7;
let meta = null, worker = null, ready = false, lastStats = null, lastSource = null, coverage = null;
const fontsSent = {};
const exFromSlider = v => Math.round(Math.pow(40, v / 100) * 10) / 10;
const sliderFromEx = e => Math.round(Math.log(Math.max(1, e)) / Math.log(40) * 100);
const clamp = (v, a, b, d) => Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d;
const fmtLat = v => `${Math.abs(v).toFixed(4)}°${v >= 0 ? 'N' : 'S'}`;
const fmtLon = v => `${Math.abs(v).toFixed(4)}°${v >= 0 ? 'E' : 'W'}`;
const fmtM = m => (m >= 0 ? '+' : '−') + Math.abs(Math.round(m)).toLocaleString('en-US') + ' m';
const radio = name => document.querySelector(`input[name="${name}"]:checked`).value;
const setRadio = (name, v) => { const el = document.querySelector(`input[name="${name}"][value="${v}"]`); if (el) el.checked = true; };

// ---------------- theme ----------------
function syncThemeButtons() { for (const m of ['light', 'auto', 'dark']) $('th-' + m).classList.toggle('active', TPTheme.mode === m); }
for (const m of ['light', 'auto', 'dark']) $('th-' + m).onclick = () => { TPTheme.set(m); syncThemeButtons(); };
syncThemeButtons();
const css = name => getComputedStyle(document.body).getPropertyValue(name).trim();

// ---------------- toast ----------------
function toast(msg, kind) {
  const t = $('toast'); t.className = 'tp-toast alert py-2 px-3 mb-0 shadow alert-' + (kind || 'secondary'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 6000);
}

// ---------------- worker ----------------
let reqId = 0; const pending = new Map();
function call(msg, transfer) { const id = ++reqId; msg.id = id; return new Promise((res, rej) => { pending.set(id, { res, rej }); worker.postMessage(msg, transfer || []); }); }
function startWorker() {
  try { worker = new Worker('worker.js?v=' + BUILD); }
  catch (e) { toast('This browser can\'t run the model builder. Try a current version of Chrome, Safari, Firefox or Edge.', 'warning'); return; }
  worker.onmessage = e => {
    const m = e.data;
    if (m.type === 'ready') { ready = true; schedule(true); return; }
    if (m.type === 'warn') { toast(m.text, 'warning'); return; }
    if (m.type === 'progress') { if (m.id === buildId) busy(m.text); else if (m.id === exportId) $('export').textContent = m.text; return; }
    const p = pending.get(m.id); if (!p) return; pending.delete(m.id);
    if (m.type === 'error') p.rej(new Error(m.text)); else p.res(m);
  };
  worker.onerror = e => toast('The model builder stopped: ' + (e.message || 'unknown error'), 'danger');
  worker.postMessage({ type: 'init', meta });
}
async function ensureFont(id) {
  if (fontsSent[id]) return fontsSent[id];
  fontsSent[id] = fetch(`data/fonts/${id}.json`).then(r => r.json()).then(data => { worker.postMessage({ type: 'font', id, data }); });
  return fontsSent[id];
}

// ---------------- parameters ----------------
function params(step) {
  const product = state.product, border = state.border;
  return {
    shape: state.shape, product, widthMm: +$('width').value, exag: exFromSlider(+$('exag').value),
    baseMm: clamp(+$('base').value, 1, 8, 2), frameMm: clamp(+$('frame').value, 4, 14, 7), rimMm: clamp(+$('rim').value, 0.5, 30, 3), rimAuto: $('rim-auto').checked, textMm: 0.8,
    textTop: $('t-top').value.trim(), textBottom: $('t-bottom').value.trim(),
    pieces: Math.round(clamp(+$('pieces').value, 2, 12, 5)), knurl: $('knurl').checked, floorKnurl: $('floor-knurl').checked, pieceNumbers: $('piece-numbers').checked, gapMm: clamp(+$('gap').value, 0.1, 0.6, 0.3),
    separate: product === 'ornament' && border !== 'none' && $('separate').checked,
    loop: product === 'ornament' && border !== 'none' && $('loop').checked,
    stepMm: step, border, mergeText: $('merge').checked, back: $('back').checked, backMm: clamp(+$('back-mm').value, 0.8, 4, 1.6),
    seed: Math.abs(Math.round(state.lat * 1000) * 31 + Math.round(state.lon * 1000)) + 7,
  };
}
const query = step => ({ world: state.world, lat: state.lat, lon: state.lon, size: state.size, widthMm: +$('width').value, step });

// ---------------- build ----------------
let timer = null, buildId = 0, exportId = 0, building = false, again = false;
function schedule(fast) { clearTimeout(timer); timer = setTimeout(build, fast ? 30 : 160); }
function busy(t) { $('busy').hidden = !t; if (t) $('busy-text').textContent = t; }
async function build() {
  if (!ready) return;
  if (building) { again = true; return; }
  building = true; again = false;
  busy('Loading elevation…');
  try {
    if (state.border === 'lettered') await ensureFont(state.font);
    const p = params(PREVIEW_STEP);
    const spread = false; // the preview always shows the puzzle assembled; the download spreads the pieces
    const msg = { type: 'build', q: query(PREVIEW_STEP), p, font: state.border === 'lettered' ? state.font : null, spread, spreadGap: clamp(+$('spread-gap').value, 1, 15, 3) };
    const pr = call(msg); buildId = reqId;
    const r = await pr;
    if (!again) { lastStats = r.stats; lastSource = r.source; bench.setParts(r.parts, spread); showStats(p, r); }
  } catch (e) { console.error(e); toast('Could not build this region: ' + e.message, 'danger'); }
  finally { building = false; busy(null); if (again) build(); }
}
function showStats(p, r) {
  const W = WORLDS[state.world], src = r.source, s = r.stats, pxM = src.pxKm * 1000;
  $('chip-src').innerHTML = `<b>${src.kind === 'patch' ? (W.patchName || W.grid) : src.kind === 'live' ? (W.liveName || W.grid) : W.grid}</b> · ${pxM < 1000 ? Math.round(pxM) + ' m' : (pxM / 1000).toFixed(2) + ' km'} per sample`;
  $('st-low').textContent = fmtM(s.hMin); $('st-high').textContent = fmtM(s.hMax);
  $('st-relief').innerHTML = `${s.reliefMm.toFixed(1)} mm <small>${((s.hMax - s.hMin) / 1000).toFixed(1)} km real</small>`;
  const H = p.shape === 'hexagon' ? p.widthMm * Math.sqrt(3) / 2 : p.widthMm, fr = p.border === 'none' ? 0 : p.frameMm;
  $('st-foot').innerHTML = `${Math.round(p.widthMm + 2 * fr)} × ${Math.round(H + 2 * fr + (p.loop ? 11 : 0))} <small>mm</small>`;
  const n = r.parts.filter(x => x.role === 'terrain').length;
  $('st-parts').innerHTML = p.product === 'puzzle' ? `${n} pieces <small>${p.border === 'none' ? 'no frame' : (p.back && p.border !== 'none' ? '+ tray' : '+ frame')}</small>` : `${(p.separate ? 2 : r.parts.length)} <small>${p.separate ? 'prints' : 'colours'}</small>`;
  const rel = s.reliefMm;
  $('exag-hint').textContent = `${p.exag}× · 1× is true scale. ` + (rel < 2 ? 'Relief is shallow; try more exaggeration.' : rel > 25 ? 'Tall; check the slicer for steep walls.' : 'Reads well at this width.');
  // Pluto: warn when the region strays into the unmapped half
  const warn = $('chip-warn'); warn.hidden = true;
  if (src.offline) { warn.hidden = false; warn.textContent = 'Offline: using the coarser global grid, so small places look smooth'; }
  if (W.partial && coverage) { const c = coverageAt(state.lat, state.lon); if (c < 0.9) { warn.hidden = false; warn.textContent = c < 0.2 ? 'Not mapped by New Horizons: this is a smooth fill' : 'Partly outside the mapped area'; } }
}

// ---------------- 3D bench ----------------
const bench = (() => {
  const canvas = $('bench');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 1, 1, 4000); cam.up.set(0, 0, 1); cam.position.set(0, -190, 170);
  const ctl = new THREE.OrbitControls(cam, canvas); ctl.target.set(0, 0, 4); ctl.maxPolarAngle = Math.PI * 0.49; ctl.enableDamping = false;
  const hemi = new THREE.HemisphereLight(0xb8c4d6, 0x1a1510, 0.4); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 1, far: 900 }); sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);
  const plateMat = new THREE.MeshStandardMaterial({ roughness: 1 });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), plateMat); plate.position.z = -0.02; plate.receiveShadow = true; scene.add(plate);
  let grid = null, group = new THREE.Group(); scene.add(group);
  let pendingFrame = false;
  const render = () => { if (pendingFrame) return; pendingFrame = true; requestAnimationFrame(() => { pendingFrame = false; if (!canvas.parentElement.hidden) renderer.render(scene, cam); }); };
  // keep the camera out of the model: the point it orbits never sinks below the model's highest point, and since the
  // camera can't look up from below that point, it always stays above the landscape
  let topZ = 4; ctl.minDistance = 20;
  const keepOut = () => { const dz = topZ - ctl.target.z; if (dz > 0) { ctl.target.z += dz; cam.position.z += dz; } };
  ctl.addEventListener('change', () => { keepOut(); render(); });
  function theme() {
    scene.background = new THREE.Color(css('--tp-stage') || '#0d1014'); plateMat.color.set(css('--tp-plate') || '#161a20');
    if (grid) { scene.remove(grid); grid.geometry.dispose(); }
    grid = new THREE.GridHelper(400, 40, new THREE.Color(css('--tp-grid1')), new THREE.Color(css('--tp-grid2'))); grid.rotation.x = Math.PI / 2; grid.position.z = 0.01; scene.add(grid);
    const dark = document.documentElement.getAttribute('data-bs-theme') === 'dark'; hemi.intensity = dark ? 0.38 : 0.62;
    render();
  }
  function setSun(deg) { const a = deg * Math.PI / 180, az = -2.3; sun.position.set(Math.cos(az) * Math.cos(a) * 320, Math.sin(az) * Math.cos(a) * 320, Math.sin(a) * 320); render(); }
  function resize() { const r = canvas.parentElement.getBoundingClientRect(); if (!r.width || !r.height) return; renderer.setSize(r.width, r.height, false); cam.aspect = r.width / r.height; cam.updateProjectionMatrix(); render(); }
  new ResizeObserver(resize).observe(canvas.parentElement);
  let framed = '';
  function frameTo(size) {
    const k = String(Math.round(size / 20)); if (framed === k) return; framed = k;
    const d = Math.max(size, 100) / 100; ctl.target.set(0, 0, 4); cam.position.set(0, -190 * d, 170 * d); keepOut(); ctl.update();
  }
  function setParts(parts, spread) {
    scene.remove(group); group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    group = new THREE.Group();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxZ = 4;
    for (const p of parts) {
      let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p.verts, 3)); g.setIndex(new THREE.BufferAttribute(p.idx, 1));
      if (p.role !== 'terrain') g = g.toNonIndexed();          // crisp edges on the frame and letters
      g.computeVertexNormals(); g.computeBoundingBox();
      const b = g.boundingBox; minX = Math.min(minX, b.min.x); maxX = Math.max(maxX, b.max.x); minY = Math.min(minY, b.min.y); maxY = Math.max(maxY, b.max.y); maxZ = Math.max(maxZ, b.max.z);
      const m = new THREE.MeshStandardMaterial({ color: state.colors[p.role], roughness: p.role === 'text' ? 0.45 : 0.88, metalness: p.role === 'text' ? 0.25 : 0 });
      const mesh = new THREE.Mesh(g, m); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.role = p.role; group.add(mesh);
    }
    scene.add(group);
    topZ = maxZ; keepOut(); ctl.update();
    frameTo(Math.max(maxX - minX, maxY - minY, 100));
    render();
  }
  function recolor() { group.children.forEach(m => m.material.color.set(state.colors[m.userData.role])); render(); }
  TPTheme.listeners.push(() => setTimeout(theme, 0));
  theme(); setSun(18);
  return { setParts, recolor, setSun, resize, render };
})();

// ---------------- globe (lazy) ----------------
let globe = null;
function makeGlobe() {
  const canvas = $('globe');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(35, 1, 0.1, 100); cam.position.set(0, 0, 3.4);
  const ctl = new THREE.OrbitControls(cam, canvas); ctl.enablePan = false; ctl.minDistance = 1.25; ctl.maxDistance = 6; ctl.rotateSpeed = 0.5;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff }), sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), mat); scene.add(sphere);
  // irregular bodies (Vesta): push each vertex out to the body's real radius
  const unitPos = sphere.geometry.attributes.position.array.slice(), shapes = {};
  let rAt = () => 1;
  function shapeFn(g) {
    let m = 0; for (const v of g.r) if (v > m) m = v; // largest radius = 1, so it frames like the other worlds
    return (lat, lon) => { // bilinear, wraps in longitude
      const x = ((lon + 180) / 360 * g.w - 0.5 + g.w) % g.w, y = Math.max(0, Math.min(g.h - 1.001, (90 - lat) / 180 * g.h - 0.5));
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, x1 = (x0 + 1) % g.w, R = (i, j) => g.r[j * g.w + i];
      return ((R(x0, y0) * (1 - fx) + R(x1, y0) * fx) * (1 - fy) + (R(x0, y0 + 1) * (1 - fx) + R(x1, y0 + 1) * fx) * fy) / m;
    };
  }
  function applyShape(fn) {
    rAt = fn || (() => 1);
    const pos = sphere.geometry.attributes.position, a = pos.array;
    for (let i = 0; i < a.length; i += 3) {
      const x = unitPos[i], y = unitPos[i + 1], z = unitPos[i + 2];
      const k = fn ? fn(Math.asin(Math.max(-1, Math.min(1, y))) * 180 / Math.PI, Math.atan2(-z, x) * 180 / Math.PI) : 1;
      a[i] = x * k; a[i + 1] = y * k; a[i + 2] = z * k;
    }
    pos.needsUpdate = true; sphere.geometry.computeBoundingSphere();
  }
  const sg = new THREE.BufferGeometry(), sp = []; let s = 12345; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 1400; i++) { const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, d = 30 + rnd() * 20; sp.push(Math.sqrt(1 - u * u) * Math.cos(t) * d, u * d, Math.sqrt(1 - u * u) * Math.sin(t) * d); }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.08 })); scene.add(stars);
  // footprint drawn like a map route: dark casing, white core, faint tint inside, so it reads on any terrain
  const fpCase = new THREE.MeshBasicMaterial({ color: 0x0b0d10, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const fpCore = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const fpFill = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  let fp = null, dots = null, fpPts = null, fpCentre = null, fpDist = 0;
  function ribbon(pts, w) { // closed band of width w (world units) lying on the surface along pts
    const pos = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], t = pts[(i + 1) % n].clone().sub(pts[(i - 1 + n) % n]).normalize(), side = t.cross(p.clone().normalize()).normalize().multiplyScalar(w / 2);
      pos.push(p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z);
    }
    const idx = []; for (let i = 0; i < n; i++) { const a = 2 * i, b = 2 * ((i + 1) % n); idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
  }
  function drawFootprint() {
    if (fp) { scene.remove(fp); fp.traverse(o => o.geometry && o.geometry.dispose()); fp = null; }
    if (!fpPts) return;
    fpDist = cam.position.length();
    let span = 0; for (const q of fpPts) span = Math.max(span, q.distanceTo(fpCentre));
    const px = Math.min(fpDist * 0.0042, span * 0.12); // ~constant on-screen width while zooming, thinner for tiny regions
    const fill = new THREE.BufferGeometry(), fv = [fpCentre.x, fpCentre.y, fpCentre.z], fi = [];
    for (const q of fpPts) fv.push(q.x, q.y, q.z);
    for (let i = 0; i < fpPts.length; i++) fi.push(0, 1 + i, 1 + (i + 1) % fpPts.length);
    fill.setAttribute('position', new THREE.Float32BufferAttribute(fv, 3)); fill.setIndex(fi);
    fp = new THREE.Group();
    fp.add(new THREE.Mesh(fill, fpFill), new THREE.Mesh(ribbon(fpPts, px * 2.6), fpCase), new THREE.Mesh(ribbon(fpPts, px), fpCore));
    fp.children[1].renderOrder = 1; fp.children[2].renderOrder = 2; scene.add(fp);
  }
  const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.beginPath(); x.arc(32, 32, 26, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#000'; x.lineWidth = 6; x.stroke(); return new THREE.CanvasTexture(c); })();
  const dotMat = new THREE.PointsMaterial({ size: 13, sizeAttenuation: false, map: dotTex, alphaTest: 0.4, transparent: true });
  const toVec = (lat, lon, r = 1) => { const a = lat * Math.PI / 180, b = lon * Math.PI / 180; return new THREE.Vector3(Math.cos(a) * Math.cos(b) * r, Math.sin(a) * r, -Math.cos(a) * Math.sin(b) * r); };
  const tex = {}, loader = new THREE.TextureLoader();
  let pendingFrame = false;
  const render = () => { if (pendingFrame) return; pendingFrame = true; requestAnimationFrame(() => { pendingFrame = false; if (!canvas.parentElement.hidden) renderer.render(scene, cam); }); };
  ctl.addEventListener('change', () => { const d = cam.position.length(); if (fpPts && Math.abs(d - fpDist) / fpDist > 0.08) drawFootprint(); render(); });
  function theme() { scene.background = new THREE.Color(css('--tp-stage') || '#0d1014'); stars.material.color.set(document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 0x8a919b : 0x9a958c); refresh(); }
  function setWorld(w) {
    if (!tex[w]) { $('gbusy').hidden = false; tex[w] = loader.load(`data/${w}/globe.jpg`, () => { $('gbusy').hidden = true; render(); }); tex[w].encoding = THREE.sRGBEncoding; tex[w].anisotropy = 4; }
    mat.map = tex[w]; mat.needsUpdate = true;
    if (WORLDS[w].shape) {
      if (!shapes[w]) shapes[w] = fetch(`data/${w}/shape.json?v=` + BUILD).then(r => r.json()).then(shapeFn).catch(() => null);
      shapes[w].then(fn => { if (state.world === w) { applyShape(fn); refresh(); } });
    } else applyShape(null);
    refresh();
  }
  function inv(x, y, lat0, lon0, R) {
    const p0 = lat0 * Math.PI / 180, l0 = lon0 * Math.PI / 180, rho = Math.hypot(x, y); if (rho < 1e-9) return [lat0, lon0];
    const c = rho / R, sc = Math.sin(c), cc = Math.cos(c);
    return [Math.asin(Math.max(-1, Math.min(1, cc * Math.sin(p0) + y * sc * Math.cos(p0) / rho))) * 180 / Math.PI, (l0 + Math.atan2(x * sc, rho * Math.cos(p0) * cc - y * Math.sin(p0) * sc)) * 180 / Math.PI];
  }
  function outline(shape) { const n = shape === 'circle' ? 96 : shape === 'hexagon' ? 6 : 4, pts = []; for (let i = 0; i < n; i++) { const a = shape === 'square' ? Math.PI / 4 + i * Math.PI / 2 : i * 2 * Math.PI / n, r = shape === 'square' ? Math.SQRT1_2 : 0.5; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } return pts; }
  function refresh() {
    const R = meta[state.world].radiusKm, S = state.size, ring = outline(state.shape), pts = [], per = Math.max(4, Math.round(192 / ring.length));
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; for (let k = 0; k < per; k++) { const t = k / per, ll = inv((a[0] + (b[0] - a[0]) * t) * S, (a[1] + (b[1] - a[1]) * t) * S, state.lat, state.lon, R); pts.push(toVec(ll[0], ll[1], 1.004 * rAt(ll[0], ll[1]))); } }
    fpPts = pts; fpCentre = toVec(state.lat, state.lon, 1.004 * rAt(state.lat, state.lon)); drawFootprint();
    if (dots) { scene.remove(dots); dots.geometry.dispose(); }
    const sites = WORLDS[state.world].marks.filter(m => m.group === 'landing');
    dots = new THREE.Points(new THREE.BufferGeometry().setFromPoints(sites.map(L => toVec(L.lat, L.lon, 1.004 * rAt(L.lat, L.lon)))), dotMat); dotMat.color.set(css('--tp-accent') || '#fff'); scene.add(dots);
    render();
  }
  function lookAt(lat, lon) { const d = cam.position.length(); cam.position.copy(toVec(lat, lon, d)); ctl.update(); render(); }
  function resize() { const r = canvas.parentElement.getBoundingClientRect(); if (!r.width || !r.height) return; renderer.setSize(r.width, r.height, false); cam.aspect = r.width / r.height; cam.updateProjectionMatrix(); render(); }
  new ResizeObserver(resize).observe(canvas.parentElement);
  const ray = new THREE.Raycaster(); let down = null;
  canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const rr = canvas.getBoundingClientRect(), nx = (e.clientX - rr.left) / rr.width * 2 - 1, ny = -(e.clientY - rr.top) / rr.height * 2 + 1;
    const sites = WORLDS[state.world].marks.filter(m => m.group === 'landing');
    const near = sites.map(L => { const v = toVec(L.lat, L.lon, rAt(L.lat, L.lon)), p = v.clone().project(cam); return { L, d: Math.hypot((p.x - nx) * rr.width / 2, (p.y - ny) * rr.height / 2), front: v.dot(cam.position) > 0 }; }).filter(o => o.front && o.d < 12).sort((a, b) => a.d - b.d)[0];
    if (near) { selectMark(near.L, true); return; }
    ray.setFromCamera({ x: nx, y: ny }, cam); const hit = ray.intersectObject(sphere)[0]; if (!hit) return;
    const v = hit.point.clone().normalize();
    state.lat = +(Math.asin(v.y) * 180 / Math.PI).toFixed(4); state.lon = +(Math.atan2(-v.z, v.x) * 180 / Math.PI).toFixed(4); state.mark = null;
    $('t-top').value = WORLDS[state.world].name.toUpperCase(); $('t-bottom').value = `${fmtLat(state.lat)}  ${fmtLon(state.lon)}`;
    syncInputs(); renderMarks(); refresh(); updateCoord(); schedule(true);
    $('pickhint').textContent = 'Region set · open Model to see it, or tap again';
  });
  TPTheme.listeners.push(() => setTimeout(theme, 0)); theme();
  return { setWorld, refresh, lookAt, resize };
}

// ---------------- landmarks ----------------
function hasPatch(L) {
  if (state.world === 'moon') return MOON_HI.includes(L.id);
  const pats = meta[state.world].patches || {}; return !!(pats[L.id] || (PATCH_OF[state.world] && PATCH_OF[state.world][L.id]));
}
function renderMarks() {
  const W = WORLDS[state.world], f = $('mark-filter').value.trim().toLowerCase();
  const box = $('marks'); box.textContent = '';
  const list = W.marks.filter(L => !f || (L.name + ' ' + L.note).toLowerCase().includes(f));
  $('mark-count').textContent = `${W.marks.length} sites`;
  const groups = [[W.landingTitle, list.filter(x => x.group === 'landing'), true], ['Landmarks', list.filter(x => x.group !== 'landing'), false]];
  for (const [title, items, dot] of groups) {
    if (!items.length) continue;
    const h = document.createElement('div'); h.className = 'grp'; if (dot) h.appendChild(document.createElement('i')); h.appendChild(document.createTextNode(title)); box.appendChild(h);
    for (const L of items) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tp-mark'; b.id = 'mk-' + L.id; b.setAttribute('aria-pressed', String(state.mark === L.id));
      const nb = document.createElement('b'); nb.textContent = L.name; const ns = document.createElement('span'); ns.textContent = L.note; b.append(nb, ns);
      if (hasPatch(L)) { const e = document.createElement('em'); e.textContent = W.patchBadge || 'HI-RES'; b.appendChild(e); }
      b.onclick = () => selectMark(L); box.appendChild(b);
    }
  }
  if (!list.length) { const p = document.createElement('div'); p.className = 'p-3 tp-hint'; p.textContent = 'No landmark matches that search.'; box.appendChild(p); }
}
function selectMark(L, fromGlobe) {
  state.mark = L.id; state.lat = L.lat; state.lon = L.lon; state.size = L.size;
  $('exag').value = sliderFromEx(L.ex); $('o-exag').textContent = exFromSlider(+$('exag').value) + '×';
  $('t-top').value = L.name.toUpperCase(); $('t-bottom').value = `${fmtLat(L.lat)}  ${fmtLon(L.lon)}`;
  syncInputs(); renderMarks(); updateCoord(); if (globe) { globe.refresh(); if (!fromGlobe && !$('globe').parentElement.hidden) globe.lookAt(state.lat, state.lon); } schedule(true);
  if (fromGlobe) showTab('model');
}
function syncInputs() { $('lat').value = +state.lat.toFixed(4); $('lon').value = +state.lon.toFixed(4); $('size').value = Math.round(state.size); }
function updateCoord() { $('coord').innerHTML = `<span><b>${WORLDS[state.world].name}</b></span><span>${fmtLat(state.lat)} ${fmtLon(state.lon)}</span><span>${Math.round(state.size)} km wide</span>`; }

// ---------------- worlds ----------------
function renderWorlds() {
  const box = $('worlds'); box.textContent = '';
  for (const [id, W] of Object.entries(WORLDS)) {
    if (!meta[id]) continue;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-sm btn-tp tp-world' + (state.world === id ? ' active' : ''); b.id = 'w-' + id;
    b.setAttribute('aria-pressed', String(state.world === id));
    const i = document.createElement('i'); i.style.background = W.dot; b.append(i, document.createTextNode(W.name)); b.onclick = () => setWorld(id); box.appendChild(b);
  }
}
function setWorld(id) {
  state.world = id; document.body.dataset.world = id; renderWorlds();
  state.colors.terrain = WORLDS[id].terrain; $('c-terrain').value = WORLDS[id].terrain;
  $('mark-filter').value = '';
  $('credits').innerHTML = '';
  const c = document.createElement('div'); c.textContent = WORLDS[id].credit + ' Decorative representation, not survey grade. Not endorsed by NASA or the USGS.'; $('credits').appendChild(c);
  const o = document.createElement('div'); o.style.marginTop = '6px';
  const a = document.createElement('a'); a.href = 'https://github.com/IanBauters/terrain-press'; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'source code on GitHub';
  o.append('Terrain Press is free, open-source software (AGPL-3.0) · ', a, '.'); $('credits').appendChild(o);
  if (id === 'pluto' && !coverage) loadCoverage();
  if (globe) globe.setWorld(id);
  selectMark(WORLDS[id].marks.find(m => m.id === WORLDS[id].def));
}
function loadCoverage() {
  const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); coverage = { w: img.width, h: img.height, d: x.getImageData(0, 0, img.width, img.height).data }; schedule(); };
  img.src = 'data/pluto/coverage.png';
}
function coverageAt(lat, lon) { const x = Math.floor((lon + 180) / 360 * coverage.w) % coverage.w, y = Math.min(coverage.h - 1, Math.floor((90 - lat) / 180 * coverage.h)); return coverage.d[(y * coverage.w + x) * 4] / 255; }

// ---------------- UI wiring ----------------
function showTab(t) {
  const g = t === 'globe';
  $('tab-model').classList.toggle('active', !g); $('tab-globe').classList.toggle('active', g);
  $('tab-model').setAttribute('aria-selected', String(!g)); $('tab-globe').setAttribute('aria-selected', String(g));
  $('view-model').hidden = g; $('view-globe').hidden = !g;
  if (g) { if (!globe) { globe = makeGlobe(); globe.setWorld(state.world); } globe.resize(); globe.lookAt(state.lat, state.lon); } else bench.resize();
}
$('tab-model').onclick = () => showTab('model'); $('tab-globe').onclick = () => showTab('globe');
function syncMode() {
  state.product = radio('product'); state.shape = radio('shape'); state.border = radio('border'); state.font = radio('font'); state.detail = +radio('detail');
  const orn = state.product === 'ornament', framed = state.border !== 'none', sep = orn && framed && $('separate').checked;
  $('orn-opts').hidden = !orn || !framed; $('loop-wrap').hidden = !orn || !framed;
  $('fit-row').hidden = !(state.product === 'puzzle' || sep); $('pieces-wrap').hidden = state.product !== 'puzzle';
  $('spread-opts').hidden = $('numbers-wrap').hidden = state.product !== 'puzzle';
  $('back-opts').hidden = !framed; $('back-row').hidden = !$('back').checked; $('floor-knurl-wrap').hidden = state.product !== 'puzzle' || !$('back').checked;
  $('letter-opts').hidden = state.border !== 'lettered';
  $('frame').disabled = $('rim').disabled = !framed; $('rim-auto-wrap').hidden = !framed;
  $('loop-note').hidden = !(orn && state.border === 'lettered' && $('loop').checked);
  $('font-hint').textContent = FONT_INFO[state.font];
  const back = framed && $('back').checked;
  $('model-hint').textContent = state.product === 'puzzle'
    ? 'The pieces print spread apart on one plate, ' + (framed ? (back ? 'the tray' : 'the frame') + ' on another. ' : '') + 'Every piece also comes as its own file, with a numbered map.'
    : (sep ? 'Two single-colour prints: the terrain drops into the frame' + (back ? ' tray.' : '.') : (back ? 'The terrain prints fused to the tray floor, so the ornament is one solid piece.' : 'Terrain and frame print together.'));
  $('export-note').textContent = (state.product === 'puzzle' || sep ? 'A .zip with one file per print plate (STL and 3MF)' : 'A .zip with STL and multicolour 3MF files') + (state.product === 'puzzle' ? ', every piece on its own and a print guide.' : ' and a print guide.');
}
document.querySelectorAll('input[type=radio]').forEach(el => el.addEventListener('change', () => { syncMode(); if (el.name === 'shape' && globe) globe.refresh(); if (el.name !== 'detail') schedule(); }));
['separate', 'loop', 'back', 'merge', 'rim-auto', 'knurl', 'floor-knurl', 'piece-numbers'].forEach(id => $(id).addEventListener('change', () => { syncMode(); schedule(); }));
['base', 'frame', 'rim', 'pieces', 'gap', 'spread-gap', 'back-mm', 't-top', 't-bottom'].forEach(id => $(id).addEventListener('input', () => schedule()));
$('width').addEventListener('input', () => { $('o-width').textContent = $('width').value + ' mm'; schedule(); });
$('exag').addEventListener('input', () => { $('o-exag').textContent = exFromSlider(+$('exag').value) + '×'; schedule(); });
$('sun').addEventListener('input', () => { $('o-sun').textContent = $('sun').value + '°'; bench.setSun(+$('sun').value); });
$('mark-filter').addEventListener('input', renderMarks);
for (const id of ['lat', 'lon', 'size']) $(id).addEventListener('change', () => {
  state.lat = clamp(+$('lat').value, -90, 90, state.lat); state.lon = clamp(+$('lon').value, -180, 180, state.lon); state.size = clamp(+$('size').value, 2, 9000, state.size);
  state.mark = null; syncInputs(); renderMarks(); updateCoord(); if (globe) globe.refresh(); schedule(true);
});
for (const k of ['terrain', 'frame', 'text']) $('c-' + k).addEventListener('input', e => { state.colors[k] = e.target.value; bench.recolor(); });

// ---------------- export ----------------
function readmeTemplate(p, slug) {
  const W = WORLDS[state.world], spread = state.product === 'puzzle', back = p.border !== 'none' && p.back;
  const L = [`Terrain Press — ${slug}`, '',
    `World: ${W.name}`, `Centre: ${fmtLat(state.lat)} ${fmtLon(state.lon)}`, `Region width: ${state.size} km (azimuthal equidistant projection)`,
    `Elevation range: {{LOW}} m to {{HIGH}} m (${W.datum})`,
    `Model: ${p.product}, ${p.shape}, ${p.widthMm} mm terrain, ${p.exag}x relief exaggeration, {{RELIEF}} mm printed relief`,
    `Mesh detail: ${p.stepMm} mm grid; source data {{PX}} m per sample`, '', 'Files'];
  if (spread) L.push('  *-pieces-spread — the pieces only, moved apart so no tab sits in its socket. One plate.', `  *-frame — the frame${p.border === 'lettered' ? ' and lettering' : ''}, a second plate.`, '  *-assembled.3mf — everything in place, for reference only.');
  else if (p.separate) L.push('  *-1-terrain — the terrain on its own, flat on the plate.', '  *-2-frame — the frame' + (p.border === 'lettered' && p.mergeText ? ' with its lettering' : '') + ', flat on the plate.', '  *-assembled.3mf — both in place, for reference only.');
  else if (p.product === 'puzzle' && back) L.push('  *-pieces — the pieces in their assembled positions, on their own plate.', '  *-tray — the tray' + (p.border === 'lettered' ? ' and lettering' : '') + ', on a second plate.', '  *-assembled.3mf — everything in place, for reference only.');
  else L.push(`  ${slug}.3mf — one object with separate parts; assign a filament to each part in your slicer.`, '  *-all.stl — everything in one file, single colour.', '  The other STLs are the same parts on their own, positioned to load together.');
  if (p.product === 'puzzle') L.push('  single-pieces/ — every piece as its own STL, centred and flat on the plate. Lost one? Print just that file.', '  single-pieces/*-piece-map.svg — the puzzle seen from above, each piece numbered to match its file.');
  L.push('', 'Print settings', '  Layer height 0.12–0.16 mm · 15% gyroid infill · no supports · every part prints flat on its base.');
  if (p.product === 'puzzle') L.push(`  Puzzle pieces have ${p.gapMm} mm total clearance` + (spread ? ` and are spread ${clamp(+$('spread-gap').value, 1, 15, 3)} mm beyond their tabs.` : '.'));
  if (p.separate) L.push(`  The terrain has ${p.gapMm} mm clearance to the frame; a drop of glue holds it.`);
  if (back) L.push(`  The frame has a closed ${p.backMm} mm back.`);
  if (p.border === 'lettered') L.push(p.mergeText ? '  Lettering is part of the frame. For coloured letters, add a filament change at {{FRAMETOP}} mm.' : '  Lettering is a separate part; or add a filament change at {{FRAMETOP}} mm.');
  if (W.partial) L.push('', 'Note: only part of Pluto was mapped by New Horizons; areas outside the mapped side are a smooth fill.');
  L.push('', 'Data', '  ' + W.credit, '  Decorative representation, not survey grade. Not endorsed by NASA or the USGS.');
  return L.join('\n');
}
// the print guide loads on demand: jsPDF and the guide script only arrive when someone downloads
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const scripts = {};
function loadScript(src) {
  return scripts[src] || (scripts[src] = new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => { delete scripts[src]; rej(new Error('Could not load ' + src)); }; document.head.appendChild(el); }));
}
async function printGuide(r, p, slug) {
  await Promise.all([loadScript(JSPDF_URL), loadScript('guide.js?v=' + BUILD)]);
  const W = WORLDS[state.world], L = W.marks.find(x => x.id === state.mark);
  const H = p.shape === 'hexagon' ? p.widthMm * Math.sqrt(3) / 2 : p.widthMm, fr = p.border === 'none' ? 0 : p.frameMm;
  const font = await fetch('data/fonts/worm.json').then(x => x.json()).catch(() => null);
  const shape = { circle: 'Circle', square: 'Square', hexagon: 'Hexagon' }[p.shape];
  return TPGuide.make({
    p, slug, colors: state.colors, plates: r.plates, pieces: r.pieces, stats: r.stats, world: { ...W, radiusKm: meta[state.world].radiusKm },
    place: L ? L.name : `${fmtLat(state.lat)} ${fmtLon(state.lon)}`, landmark: L || null, coords: `${fmtLat(state.lat)}  ${fmtLon(state.lon)}`,
    lat: state.lat, lon: state.lon, size: state.size, kind: `${shape} ${p.product}`,
    footprint: `${Math.round(p.widthMm + 2 * fr)} × ${Math.round(H + 2 * fr + (p.loop ? 11 : 0))} mm`,
    hasAssembled: r.files.some(f => f[0].endsWith('-assembled.3mf')), font });
}
$('export').onclick = async () => {
  const btn = $('export'); if (btn.disabled || !ready) return; btn.disabled = true; const old = 'Download print files';
  try {
    if (state.border === 'lettered') await ensureFont(state.font);
    const p = params(state.detail);
    const L = WORLDS[state.world].marks.find(x => x.id === state.mark);
    const slug = ((L ? L.name : WORLDS[state.world].name + ' ' + fmtLat(state.lat) + ' ' + fmtLon(state.lon)) + ' ' + p.product + ' ' + p.shape).toLowerCase().replace(/°/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    btn.textContent = 'Loading elevation…';
    const pr = call({ type: 'export', q: query(state.detail), p, font: state.border === 'lettered' ? state.font : null,
      x: { slug, colors: state.colors, spread: state.product === 'puzzle', spreadGap: clamp(+$('spread-gap').value, 1, 15, 3), perPiece: state.product === 'puzzle' } });
    exportId = reqId;
    const r = await pr, files = r.files;
    btn.textContent = 'Writing the print guide…';
    try { files.push([`${slug}-print-guide.pdf`, await printGuide(r, p, slug)]); }
    catch (e) { // no guide (offline without the PDF library, old browser…): fall back to a plain text summary
      console.warn('Print guide failed', e);
      const s = r.stats, readme = readmeTemplate(p, slug).replace('{{RELIEF}}', s.reliefMm.toFixed(1)).replace('{{LOW}}', Math.round(s.hMin)).replace('{{HIGH}}', Math.round(s.hMax)).replace('{{FRAMETOP}}', s.frameTop.toFixed(2)).replace('{{PX}}', s.pxM.toFixed(0));
      files.push(['README.txt', readme]);
    }
    btn.textContent = 'Packing files…';
    const transfer = files.map(f => f[1]).filter(d => d instanceof Uint8Array).map(d => d.buffer);
    const zr = await call({ type: 'zip', files }, transfer);
    const blob = new Blob([zr.zip], { type: 'application/zip' });
    const dl = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
    if (dl) {
      try { await dl.save({ filename: slug + '.zip', data: blob }); toast('Saved ' + slug + '.zip', 'success'); }
      catch (e) { if (e && e.code !== 'declined') toast('The download was blocked here (' + (e.code || 'error') + ').', 'warning'); }
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = slug + '.zip'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000);
    }
  } catch (e) { console.error(e); toast('Export failed: ' + e.message, 'danger'); }
  finally { btn.disabled = false; btn.textContent = old; }
};

// ---------------- boot ----------------
(async () => {
  $('o-width').textContent = $('width').value + ' mm'; $('o-sun').textContent = $('sun').value + '°'; $('o-exag').textContent = exFromSlider(+$('exag').value) + '×';
  busy('Loading…');
  try {
    meta = await fetch('data/meta.json?v=' + BUILD).then(r => r.json());
    renderWorlds(); syncMode(); startWorker(); setWorld('moon');
  } catch (e) { console.error(e); busy(null); toast('The elevation data did not load. Reload the page to try again.', 'danger'); }
})();
})();
