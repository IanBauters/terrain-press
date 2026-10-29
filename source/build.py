#!/usr/bin/env python3
"""Build the deployable site/ folder from source/.

    npm install          # once: Bootstrap, PurgeCSS and the runtime libraries
    python3 source/build.py

What it does:
  * injects the Moon/Mars/Mercury landmark lists from source/marks/ into app.js
  * trims Bootstrap to the classes the page uses (PurgeCSS) and inlines it
  * inlines app.js into the page and stamps a build hash, so browsers never run stale code
  * copies core.js and worker.js, pointing them at the bundled libraries in site/lib/
  * copies guide.js and poster.js (the print guide and the A4 posters, loaded when someone downloads)
  * copies three.js, OrbitControls, poly2tri, Clipper and jsPDF into site/lib/

Elevation data in site/data/ is not touched; see docs/DATA.md for how it was made.
"""
import hashlib, json, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, SITE, NM = os.path.join(ROOT, 'source'), os.path.join(ROOT, 'site'), os.path.join(ROOT, 'node_modules')
read = lambda *p: open(os.path.join(*p), encoding='utf-8').read()

# CDN addresses used during development -> bundled copies
LIBS = {
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js': ('lib/three.min.js', 'three/build/three.min.js'),
    'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js': ('lib/OrbitControls.js', 'three/examples/js/controls/OrbitControls.js'),
    'https://cdn.jsdelivr.net/npm/poly2tri@1.5.0/dist/poly2tri.min.js': ('lib/poly2tri.min.js', 'poly2tri/dist/poly2tri.min.js'),
    'https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.js': ('lib/clipper.js', 'clipper-lib/clipper.js'),
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js': ('lib/jspdf.umd.min.js', 'jspdf/dist/jspdf.umd.min.js'),
}
def localise(text):
    for url, (local, _) in LIBS.items(): text = text.replace(url, local)
    return text

if not os.path.isdir(NM): sys.exit('Run "npm install" in the repository root first.')

core, worker = read(SRC, 'core.js'), read(SRC, 'worker.js')
version = hashlib.sha1((worker + core + read(SRC, 'guide.js') + read(SRC, 'poster.js') + read(SITE, 'data', 'meta.json')).encode()).hexdigest()[:10]

app = read(SRC, 'app.js').replace('__BUILD__', version)
for key in ('MOON', 'MARS', 'MERCURY'):
    app = app.replace(f'[/*{key}*/]', '[' + read(SRC, 'marks', f'marks_{key.lower()}.txt').replace("\\\\'", "\\'") + '\n    ]')

page = read(SRC, 'src.html')
tmp_html, tmp_cfg = os.path.join(SRC, '_content.html'), os.path.join(SRC, '_purge.json')
open(tmp_html, 'w', encoding='utf-8').write(page.replace('/*APP*/', app))
json.dump({'content': [tmp_html], 'css': [os.path.join(NM, 'bootstrap/dist/css/bootstrap.min.css')],
           'safelist': {'standard': ['active', 'show', 'disabled', 'hidden'], 'greedy': [r'^alert', r'^btn', r'data-bs-theme']},
           'variables': True, 'keyframes': False, 'fontFace': False}, open(tmp_cfg, 'w'))
try:
    out = subprocess.run(['node', '-e', f"""
const {{PurgeCSS}} = require({json.dumps(os.path.join(NM, 'purgecss'))});
const cfg = require({json.dumps(tmp_cfg)}); cfg.safelist.greedy = cfg.safelist.greedy.map(s => new RegExp(s));
new PurgeCSS().purge(cfg).then(r => process.stdout.write(r[0].css));"""], capture_output=True, text=True)
finally:
    os.remove(tmp_html); os.remove(tmp_cfg)
css = re.sub(r'/\*#\s*sourceMappingURL=.*?\*/', '', out.stdout)
if len(css) < 1000: sys.exit('PurgeCSS failed:\n' + out.stderr)

body = page.replace('/*BOOTSTRAP*/', css).replace('/*APP*/', app.replace('</script', '<\\/script'))
html = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n' + localise(body) + '\n</html>\n')
open(os.path.join(SITE, 'index.html'), 'w', encoding='utf-8').write(html)
open(os.path.join(SITE, 'core.js'), 'w', encoding='utf-8').write(core)
open(os.path.join(SITE, 'worker.js'), 'w', encoding='utf-8').write(localise(worker))
open(os.path.join(SITE, 'guide.js'), 'w', encoding='utf-8').write(read(SRC, 'guide.js'))
open(os.path.join(SITE, 'poster.js'), 'w', encoding='utf-8').write(read(SRC, 'poster.js'))
os.makedirs(os.path.join(SITE, 'lib'), exist_ok=True)
for local, pkg in LIBS.values(): shutil.copy(os.path.join(NM, pkg), os.path.join(SITE, local))
left = [u for u in LIBS if u in html or u in localise(worker)]
assert not left, left
print(f'site/ built · build {version} · Bootstrap {len(css)//1024} KB · index.html {len(html)//1024} KB')
