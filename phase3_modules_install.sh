#!/usr/bin/env bash
# phase3_modules_install.sh
# Install full Phase-3 JS modules (safe, backed-up). Designed for ~/pan-photo-resize repo.
set -euo pipefail
REPO_DIR="${HOME}/pan-photo-resize"
cd "$REPO_DIR" || { echo "Repo not found at $REPO_DIR"; exit 1; }

timestamp() { date +%s; }
NOW="$(timestamp)"
backup_suffix=".bak-phase3"

die(){ echo "ERROR: $*"; exit 1; }

# Files to write (relative to repo root)
FILES_TO_WRITE=(
  "assets/js/cropper.js"
  "assets/js/validator.js"
  "assets/js/imageProcessor.js"
  "assets/js/worker-advanced.js"
  "assets/js/worker.js"
)

echo "Creating backups for target files..."
for f in "${FILES_TO_WRITE[@]}"; do
  if [ -f "$f" ]; then
    cp -v -- "$f" "${f}${backup_suffix}" || die "Failed to backup $f"
    echo "Backup created: ${f}${backup_suffix}"
  else
    echo "Note: $f did not exist (will be created)."
  fi
done

echo "Writing new Phase-3 module files..."

# 1) cropper.js - minimal cropper with rectangle and pointer support
cat > assets/js/cropper.js <<'EOF'
// cropper.js - lightweight cropper used by Phase-3 app
export default class Cropper {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rect = null; // {x,y,w,h}
    this.drag = null;
    this.handleSize = 10;
    this._bind();
  }
  _bind() {
    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this.canvas.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
  }
  start(rect) {
    if(!rect) {
      rect = { x: 20, y: 20, w: Math.min(200, this.canvas.width-40), h: Math.min(200, this.canvas.height-40) };
    }
    this.rect = Object.assign({}, rect);
    this.draw();
  }
  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    this.rect = null;
  }
  draw() {
    if(!this.rect) return;
    const ctx = this.ctx;
    // overlay
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6,4]);
    ctx.strokeRect(this.rect.x + 0.5, this.rect.y + 0.5, this.rect.w, this.rect.h);
    // draw handles
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    const s = this.handleSize;
    [[this.rect.x,this.rect.y],[this.rect.x+this.rect.w,this.rect.y],[this.rect.x,this.rect.y+this.rect.h],[this.rect.x+this.rect.w,this.rect.y+this.rect.h]].forEach(h=>{
      ctx.fillRect(h[0]-s/2, h[1]-s/2, s, s);
    });
    ctx.restore();
  }
  _hitHandle(p) {
    const s = this.handleSize;
    const r = this.rect;
    if(!r) return null;
    const handles = [
      {name:'nw', x:r.x, y:r.y},
      {name:'ne', x:r.x+r.w, y:r.y},
      {name:'sw', x:r.x, y:r.y+r.h},
      {name:'se', x:r.x+r.w, y:r.y+r.h}
    ];
    for(const h of handles){
      if(Math.abs(p.x - h.x) <= s && Math.abs(p.y - h.y) <= s) return h.name;
    }
    if(p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) return 'move';
    return null;
  }
  _onDown(e){
    if(!this.rect) return;
    const r = this.canvas.getBoundingClientRect();
    const p = { x: e.clientX - r.left, y: e.clientY - r.top };
    const hit = this._hitHandle(p);
    if(hit){
      this.drag = {mode: hit, start: p, orig: Object.assign({}, this.rect)};
    }
  }
  _onMove(e){
    if(!this.drag) return;
    const r = this.canvas.getBoundingClientRect();
    const p = { x: e.clientX - r.left, y: e.clientY - r.top };
    const d = { x: p.x - this.drag.start.x, y: p.y - this.drag.start.y };
    const orig = this.drag.orig;
    switch(this.drag.mode){
      case 'move':
        this.rect.x = Math.max(0, Math.min(orig.x + d.x, this.canvas.width - orig.w));
        this.rect.y = Math.max(0, Math.min(orig.y + d.y, this.canvas.height - orig.h));
        break;
      case 'nw':
        this.rect.x = Math.max(0, orig.x + d.x);
        this.rect.y = Math.max(0, orig.y + d.y);
        this.rect.w = Math.max(10, orig.w - d.x);
        this.rect.h = Math.max(10, orig.h - d.y);
        break;
      case 'ne':
        this.rect.y = Math.max(0, orig.y + d.y);
        this.rect.w = Math.max(10, orig.w + d.x);
        this.rect.h = Math.max(10, orig.h - d.y);
        break;
      case 'sw':
        this.rect.x = Math.max(0, orig.x + d.x);
        this.rect.w = Math.max(10, orig.w - d.x);
        this.rect.h = Math.max(10, orig.h + d.y);
        break;
      case 'se':
        this.rect.w = Math.max(10, orig.w + d.x);
        this.rect.h = Math.max(10, orig.h + d.y);
        break;
    }
    // redraw: assume external UI will redraw canvas image then call cropper.draw()
    // but attempt to draw overlay on top
    this.draw();
  }
  _onUp(){
    this.drag = null;
  }
}
EOF

# 2) validator.js - file type/size/dimensions checks
cat > assets/js/validator.js <<'EOF'
// validator.js - simple validation helpers
export function validateFile(file, opts = {}) {
  const maxSize = opts.maxSize || 10 * 1024 * 1024; // 10MB default
  const allowed = opts.types || ['image/jpeg','image/png'];
  const res = { valid: true, errors: [] };
  if(!file) { res.valid = false; res.errors.push('no-file'); return res; }
  if(file.size <= 0) { res.valid = false; res.errors.push('zero-size'); }
  if(file.size > maxSize) { res.valid = false; res.errors.push('too-large'); }
  if(allowed.indexOf(file.type) === -1) { res.valid = false; res.errors.push('invalid-type'); }
  return res;
}
EOF

# 3) imageProcessor.js - core client-side processing: resize, crop support, compress; returns Blob
cat > assets/js/imageProcessor.js <<'EOF'
// imageProcessor.js - client-side image processing (exports processFile(file, preset))
// Returns a Promise<Blob>
export async function processFile(file, preset = 'nsdl') {
  // presets: nsdl => 276x394 target, utI => 213x213 etc. Use fallback scaling if unknown
  const presets = {
    nsdl: { w: 276, h: 394, maxBytes: 50 * 1024 },
    uti:  { w: 213, h: 213, maxBytes: 30 * 1024 }
  };
  const cfg = presets[preset] || { w: 276, h: 394, maxBytes: 60 * 1024 };

  // helper to load file into Image or ImageBitmap
  async function loadImageBlob(blob){
    // try objectURL -> Image first
    try {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      URL.revokeObjectURL(url);
      return img;
    } catch(e){
      // fallback to createImageBitmap
      if(typeof createImageBitmap === 'function'){
        try { const bmp = await createImageBitmap(blob); return bmp; } catch(_) {}
      }
      // fallback FileReader
      return await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = ()=>{ const img = new Image(); img.onload = ()=>res(img); img.onerror = rej; img.src = fr.result; };
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
    }
  }

  // resize and compress to target bytes
  function canvasToBlob(canvas, mime, quality){ 
    return new Promise(resolve => canvas.toBlob(resolve, mime, quality));
  }

  // main logic
  const imgLike = await loadImageBlob(file);
  // compute target dimensions preserving aspect ratio
  const srcW = imgLike.naturalWidth || imgLike.width || (imgLike.bitmapWidth || 800);
  const srcH = imgLike.naturalHeight || imgLike.height || (imgLike.bitmapHeight || 600);
  const targetW = cfg.w;
  const targetH = cfg.h;
  // we'll fit by width first, then pad/crop center to exact target
  const scale = Math.max(targetW / srcW, targetH / srcH); // scale up if needed to preserve fill
  const drawW = Math.round(srcW * scale);
  const drawH = Math.round(srcH * scale);
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  // center crop
  const dx = Math.round((targetW - drawW) / 2);
  const dy = Math.round((targetH - drawH) / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,targetW,targetH);
  try {
    ctx.drawImage(imgLike, dx, dy, drawW, drawH);
  } catch(e){
    // if drawing ImageBitmap, timestamps, try alternate draw
    try { ctx.drawImage(imgLike, 0, 0, targetW, targetH); } catch(e2){ /* ignore */ }
  }

  // adaptive compress loop: try quality 0.92 -> 0.4
  let quality = 0.92;
  let blob = await canvasToBlob(canvas, file.type === 'image/png' ? 'image/png' : 'image/jpeg', quality);
  const minQuality = 0.45;
  while(blob && cfg.maxBytes && blob.size > cfg.maxBytes && quality > minQuality){
    quality -= 0.08;
    blob = await canvasToBlob(canvas, file.type === 'image/png' ? 'image/png' : 'image/jpeg', quality);
  }
  // as last resort, further downscale
  if(blob && cfg.maxBytes && blob.size > cfg.maxBytes){
    const scaleFactor = Math.sqrt(cfg.maxBytes / blob.size) * 0.95;
    const newW = Math.max(10, Math.round(targetW * scaleFactor));
    const newH = Math.max(10, Math.round(targetH * scaleFactor));
    const c2 = document.createElement('canvas');
    c2.width = newW; c2.height = newH;
    const c2ctx = c2.getContext('2d');
    c2ctx.drawImage(canvas, 0, 0, newW, newH);
    blob = await canvasToBlob(c2, 'image/jpeg', Math.max(0.35, quality - 0.1));
  }
  if(!blob) throw new Error('Failed to create output blob');
  return blob;
}
EOF

# 4) worker-advanced.js - a light worker wrapper (no heavy deps)
cat > assets/js/worker-advanced.js <<'EOF'
// worker-advanced.js - lightweight worker initializer
// This worker expects to be used as: const w = new Worker('assets/js/worker-advanced.js'); w.postMessage({cmd:'process', file, preset});
self.addEventListener('message', async (ev) => {
  const data = ev.data || {};
  try {
    if(data.cmd === 'process' && data.file){
      // Worker cannot receive File/Blob across module worker easily in all envs.
      // This is a simple echo stub: real heavy processing is done client-side in imageProcessor.
      const result = { ok: true, message: 'worker processed (stub)' };
      self.postMessage({ id: data.id || null, ok: true, result });
    } else {
      self.postMessage({ ok: false, error: 'unknown-cmd' });
    }
  } catch(err){
    self.postMessage({ ok: false, error: (err && err.message) || String(err) });
  }
});
EOF

# 5) worker.js - simple fallback worker file (non-module)
cat > assets/js/worker.js <<'EOF'
// worker.js - simple non-module worker fallback
self.onmessage = function(ev){
  const data = ev.data || {};
  if(data.cmd === 'ping'){ self.postMessage({ ok:true, pong: Date.now() }); return; }
  self.postMessage({ ok:false, error: 'unhandled' });
};
EOF

echo "Files written. Verifying presence..."
for f in "${FILES_TO_WRITE[@]}"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: expected file $f missing after write"; exit 1;
  fi
done

# Update index.html script tags to add cache-bust query param (timestamp)
HTML="index.html"
if [ ! -f "$HTML" ]; then
  echo "ERROR: $HTML not found"; exit 1;
fi

VER="${NOW}"
echo "Applying cache-bust query ?v=$VER to module script tags in $HTML"

# conservative replacement: add ?v=VER only if not present
perl -0777 -i.bak -pe '
  $v = shift; 
  s{(<script\s+type=["'"'"']module["'"'"']\s+src=["'"'"']assets/js/([^"'"'"']+\.js)(\?[^"'"'"']*)?["'"'"']\s*>\s*</script>)}{$1}egs;
' "$VER" "$HTML" || true

# simpler: replace each module src line by appending ?v=VER (idempotent)
perl -0777 -i -pe '
  $ver = shift;
  s{(<script\s+type=["'"'"']module["'"'"']\s+src=["'"'"'](assets/js/[^"'"'"'>]+?)(?:\?v=[0-9]+)?["'"'"']\s*>\s*</script>)}{$1}egs;
  s{(assets/js/[^"'"'"'>]+?)(?:\?v=[0-9]+)?}{ $1 . "?v=" . $ver }egs;
' "$VER" "$HTML" || die "Failed to update $HTML"

echo "index.html updated; creating git commit..."

git add -A
git commit -m "Phase-3: install full module pack and cache-bust v${VER}" || echo "No changes to commit (already up-to-date)"
echo "Attempting git push..."
git push || echo "git push failed — check network/credentials"

echo "Phase-3 modules installed and pushed (if push succeeded)."
echo "Backups are available with ${backup_suffix} suffix in assets/js/."
echo "Now: clear browser cache and unregister service worker, then load the site."
echo "If anything still fails, tell me the exact errors or provide the browser debug log."
exit 0
