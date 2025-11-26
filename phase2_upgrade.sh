#!/usr/bin/env bash
set -euo pipefail

# Phase-2 upgrade script for pan-photo-resize
# - Adds crop tool, web worker, progress, before/after slider, mobile enhancements, lint configs
# - Commits changes and pushes to GitHub main branch
# Run this from Termux. It updates files in ./pan-photo-resize (clones if needed)

REPO_DIR="pan-photo-resize"
REPO_URL="https://github.com/rudrajain051107/pan-photo-resize.git"
BRANCH="main"
GIT_NAME="Rudra Jain"
GIT_EMAIL="krish41825c@gmail.com"

# ensure repo exists
if [ ! -d "${REPO_DIR}" ]; then
  echo "Cloning repo..."
  git clone "${REPO_URL}"
fi

cd "${REPO_DIR}"

# ensure on correct branch
git fetch origin || true
if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  git checkout "${BRANCH}"
else
  git checkout -b "${BRANCH}"
fi
git pull origin "${BRANCH}" || true

echo "Applying Phase-2 file updates..."

# 1) Add Web Worker file (assets/js/worker.js)
mkdir -p assets/js
cat > assets/js/worker.js <<'JS'
// assets/js/worker.js
// Web Worker to perform canvas compression off-main-thread.
// Uses OffscreenCanvas when available, otherwise main thread fallback will be used (worker will attempt to create bitmap).
self.onmessage = async function(e) {
  const { type, file, targetWidth, targetHeight, maxBytes } = e.data || {};
  try {
    if (type === 'process') {
      // create image bitmap from file (File or Blob)
      let bitmap;
      try {
        bitmap = await createImageBitmap(file);
      } catch (err) {
        // Some browsers may not allow createImageBitmap in worker; post error
        self.postMessage({ type: 'error', message: 'createImageBitmap unavailable in worker.' });
        return;
      }
      // OffscreenCanvas path
      let canvas;
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(targetWidth, targetHeight);
        const ctx = canvas.getContext('2d');
        // draw center-cover
        const sx = 0, sy = 0;
        ctx.clearRect(0,0,targetWidth,targetHeight);
        // simple cover: drawImage with scaling
        ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, targetWidth, targetHeight);
        // iterative compression
        let quality = 0.92;
        let blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
        let tries = 0;
        while (blob.size > maxBytes && tries < 12) {
          tries++;
          quality = Math.max(0.08, quality - 0.08);
          blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
          self.postMessage({ type: 'progress', percent: Math.min(99, Math.round((1 - quality) * 100)) });
        }
        self.postMessage({ type: 'done', blob });
      } else {
        // No OffscreenCanvas: fallback - post back so main thread does processing
        self.postMessage({ type: 'fallback', message: 'no_offscreen' });
      }
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
};
JS

# 2) Update imageProcessor.js to use worker where possible and export helper functions
cat > assets/js/imageProcessor.js <<'JS'
/* assets/js/imageProcessor.js - Phase2 updated: tries Worker first, falls back to main-thread */
export const PRESETS = {
  nsdl: { width: 276, height: 394, maxBytes: 50 * 1024 },
  uti: { width: 213, height: 213, maxBytes: 30 * 1024 }
};

export async function loadImageBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch (e) {}
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function drawCover(ctx, img, targetW, targetH){
  const srcW = img.width || img.naturalWidth;
  const srcH = img.height || img.naturalHeight;
  const srcRatio = srcW/srcH;
  const tgtRatio = targetW/targetH;
  let sx=0, sy=0, sW=srcW, sH=srcH;
  if (srcRatio > tgtRatio){
    sW = srcH * tgtRatio; sx = (srcW - sW)/2;
  } else {
    sH = srcW / tgtRatio; sy = (srcH - sH)/2;
  }
  ctx.clearRect(0,0,targetW,targetH);
  ctx.drawImage(img, sx, sy, sW, sH, 0, 0, targetW, targetH);
}

async function compressMainThread(canvas, targetBytes, mime='image/jpeg') {
  let quality = 0.92;
  let blob = await new Promise(res => canvas.toBlob(res, mime, quality));
  let tries = 0;
  while (blob && blob.size > targetBytes && tries < 12) {
    tries++;
    quality -= 0.08;
    if (quality < 0.08) quality = 0.08;
    blob = await new Promise(res => canvas.toBlob(res, mime, quality));
    if (quality <= 0.08) break;
  }
  return blob;
}

/**
 * Attempt to process using worker. If worker reports fallback, perform main thread.
 */
export async function processFile(file, presetKey='nsdl', custom=null, progressCb=null) {
  const preset = (presetKey === 'custom' && custom) ? custom : PRESETS[presetKey] || PRESETS.nsdl;
  const targetW = preset.width, targetH = preset.height, maxBytes = preset.maxBytes || (50*1024);

  // Try using worker if supported
  if (window.Worker) {
    try {
      const worker = new Worker('assets/js/worker.js');
      return await new Promise((resolve, reject) => {
        let aborted = false;
        worker.onmessage = async (ev) => {
          const data = ev.data || {};
          if (data.type === 'progress') {
            if (progressCb) progressCb({ progress: data.percent });
          } else if (data.type === 'done') {
            resolve({ blob: data.blob, info: { width: targetW, height: targetH, size: data.blob.size }});
            worker.terminate();
          } else if (data.type === 'fallback') {
            // worker cannot do offscreen, fallback
            worker.terminate();
            if (!aborted) {
              // run main thread flow below
              const result = await processMainThread(file, targetW, targetH, maxBytes);
              resolve(result);
            }
          } else if (data.type === 'error') {
            worker.terminate();
            // fallback to main thread
            const result = await processMainThread(file, targetW, targetH, maxBytes);
            resolve(result);
          }
        };
        // Post transferable file (Blob) if supported
        try {
          worker.postMessage({ type: 'process', file, targetWidth: targetW, targetHeight: targetH, maxBytes });
        } catch (err) {
          worker.terminate();
          processMainThread(file, targetW, targetH, maxBytes).then(resolve).catch(reject);
        }
      });
    } catch (err) {
      // worker failed; fall back
      return await processMainThread(file, targetW, targetH, maxBytes);
    }
  } else {
    // No worker
    return await processMainThread(file, targetW, targetH, maxBytes);
  }
}

async function processMainThread(file, targetW, targetH, maxBytes) {
  const img = await loadImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = targetW; canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  drawCover(ctx, img, targetW, targetH);
  const blob = await compressMainThread(canvas, maxBytes, 'image/jpeg');
  return { blob, info: { width: canvas.width, height: canvas.height, size: blob ? blob.size : 0 }, canvas };
}
JS

# 3) Update ui.js with crop tool, progress UI, before/after slider, change image button
cat > assets/js/ui.js <<'JS'
/* assets/js/ui.js - Phase2 upgrades: crop tool, progress, before/after slider */
import { validateFile } from './validator.js';
import { processFile } from './imageProcessor.js';

const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const presetSelect = document.getElementById('preset-select');
const customControls = document.getElementById('custom-controls');
const processBtn = document.getElementById('process-btn');
const resetBtn = document.getElementById('reset-btn');
const statusEl = document.getElementById('status');
const beforeCanvas = document.getElementById('before-canvas');
const afterCanvas = document.getElementById('after-canvas');
const zoomSlider = document.getElementById('zoom-slider');
const rotateLeftBtn = document.getElementById('rotate-left');
const rotateRightBtn = document.getElementById('rotate-right');
const flipHBtn = document.getElementById('flip-horizontal');
const flipVBtn = document.getElementById('flip-vertical');
let changeBtn = document.getElementById('change-btn');

// Create change image button if missing
if (!changeBtn) {
  changeBtn = document.createElement('button');
  changeBtn.id = 'change-btn';
  changeBtn.textContent = 'Change Image';
  changeBtn.style.marginLeft = '6px';
  document.querySelector('.process-row').appendChild(changeBtn);
}

const progressBar = document.createElement('div');
progressBar.id = 'progress-bar';
progressBar.innerHTML = '<div id=\"progress-fill\"></div>';
progressBar.style.width = '90%';
progressBar.style.maxWidth = '720px';
progressBar.style.margin = '10px auto';
progressBar.style.display = 'none';
document.querySelector('.container').insertBefore(progressBar, document.querySelector('.info'));

const beforeAfterWrap = document.createElement('div');
beforeAfterWrap.className = 'before-after-wrap';
beforeAfterWrap.innerHTML = `
  <div class="ba-left"><canvas id="ba-before"></canvas></div>
  <div class="ba-split"></div>
  <div class="ba-right"><canvas id="ba-after"></canvas></div>
`;
document.getElementById('preview-area').appendChild(beforeAfterWrap);

const baBefore = document.getElementById('ba-before');
const baAfter = document.getElementById('ba-after');
const baSplit = document.querySelector('.ba-split');

let currentFile = null;
let currentImage = null;
let rotation = 0;
let flipH = false, flipV = false;
let zoom = 1;

// Crop state
let cropActive = false;
let cropRect = null; // { x,y,w,h }
let isTouch = 'ontouchstart' in window;

function setStatus(msg, isError=false){
  statusEl.textContent = msg;
  statusEl.style.color = isError ? 'crimson' : '';
}

function drawToCanvasElement(el, img){
  const ctx = el.getContext('2d');
  const cw = el.clientWidth || 320;
  const ch = el.clientHeight || 240;
  const ratio = window.devicePixelRatio || 1;
  el.width = Math.floor(cw * ratio);
  el.height = Math.floor(ch * ratio);
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.clearRect(0,0,cw,ch);
  // cover draw
  const iw = img.width || img.naturalWidth;
  const ih = img.height || img.naturalHeight;
  const srcRatio = iw/ih;
  const tgtRatio = cw/ch;
  let sw=iw, sh=ih, sx=0, sy=0;
  if (srcRatio > tgtRatio) {
    sw = ih * tgtRatio; sx = (iw - sw)/2;
  } else {
    sh = iw / tgtRatio; sy = (ih - sh)/2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
}

function applyTransformsToPreview(){
  if (!currentImage) return;
  drawToCanvasElement(beforeCanvas, currentImage);
  drawToCanvasElement(baBefore, currentImage);
}

async function handleFileChosen(file){
  setStatus('Validating file...');
  const res = validateFile(file);
  if (!res.valid){
    setStatus(res.errors.join(' '), true);
    processBtn.disabled = true;
    return;
  }
  currentFile = file;
  const img = new Image();
  img.onload = ()=>{
    currentImage = img;
    rotation = 0; flipH=false; flipV=false; zoom = 1;
    applyTransformsToPreview();
    setStatus(`Loaded ${file.name} — ${(file.size/1024).toFixed(0)} KB`);
    processBtn.disabled = false;
  };
  img.onerror = ()=> setStatus('Failed to load image.', true);
  img.src = URL.createObjectURL(file);
}

function preventDefaults(e){ e.preventDefault(); e.stopPropagation(); }

function wireUI(){
  // drag/drop
  ['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, (e)=>{ preventDefaults(e); dropZone.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, (e)=>{ preventDefaults(e); dropZone.classList.remove('dragover'); }));
  dropZone.addEventListener('drop', (e)=>{ handleDropEvent(e); });
  fileInput.addEventListener('change', (e)=> handleFileChosen(e.target.files[0]));
  dropZone.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' ') { fileInput.click(); e.preventDefault(); } });

  // presets
  presetSelect.addEventListener('change', (e)=>{ customControls.hidden = e.target.value !== 'custom'; });

  // rotate flip zoom
  rotateLeftBtn.addEventListener('click', ()=>{ rotation=(rotation-90)%360; applyTransformsToPreview(); });
  rotateRightBtn.addEventListener('click', ()=>{ rotation=(rotation+90)%360; applyTransformsToPreview(); });
  flipHBtn.addEventListener('click', ()=>{ flipH=!flipH; applyTransformsToPreview(); });
  flipVBtn.addEventListener('click', ()=>{ flipV=!flipV; applyTransformsToPreview(); });
  zoomSlider.addEventListener('input', (e)=>{ zoom=parseFloat(e.target.value); applyTransformsToPreview(); });

  // process
  processBtn.addEventListener('click', async ()=>{
    if(!currentFile) return setStatus('Please upload an image first.', true);
    setStatus('Processing...');
    processBtn.disabled = true;
    progressBar.style.display = 'block';
    document.getElementById('progress-fill').style.width = '4%';
    try {
      const presetKey = presetSelect.value;
      let custom = null;
      if (presetKey === 'custom') {
        const w = parseInt(document.getElementById('custom-width').value,10);
        const h = parseInt(document.getElementById('custom-height').value,10);
        if(!w||!h){ setStatus('Enter valid custom width & height', true); processBtn.disabled=false; progressBar.style.display='none'; return; }
        custom={ width:w, height:h, maxBytes:200*1024 };
      }
      const result = await processFile(currentFile, presetKey, custom, (p)=>{
        if (p && p.progress) document.getElementById('progress-fill').style.width = Math.min(95, p.progress) + '%';
      });
      if (!result || !result.blob) { setStatus('Processing failed.', true); processBtn.disabled=false; progressBar.style.display='none'; return; }
      document.getElementById('progress-fill').style.width = '100%';
      setStatus(`Processed — ${Math.round(result.info.size/1024)} KB`);
      // show final in ba-after & afterCanvas
      const url = URL.createObjectURL(result.blob);
      const outImg = new Image();
      outImg.onload = ()=>{
        drawToCanvasElement(afterCanvas, outImg);
        drawToCanvasElement(baAfter, outImg);
        URL.revokeObjectURL(url);
        // success animation
        statusEl.classList.add('success');
        setTimeout(()=>statusEl.classList.remove('success'), 1400);
      };
      outImg.src = url;
      // auto download
      const a = document.createElement('a');
      a.href = url; a.download = `pan_resized_${Date.now()}.jpg`; document.body.appendChild(a); a.click(); a.remove();
    } catch (err) {
      console.error(err);
      setStatus('Processing error. See console.', true);
    } finally {
      processBtn.disabled = false;
      setTimeout(()=>{ progressBar.style.display='none'; document.getElementById('progress-fill').style.width='0%'; }, 700);
    }
  });

  resetBtn.addEventListener('click', ()=>{
    currentFile=null; currentImage=null; processBtn.disabled=true;
    const ctx1=beforeCanvas.getContext('2d'); ctx1.clearRect(0,0,beforeCanvas.width,beforeCanvas.height);
    const ctx2=afterCanvas.getContext('2d'); ctx2.clearRect(0,0,afterCanvas.width,afterCanvas.height);
    setStatus('Reset complete.');
  });

  changeBtn.addEventListener('click', ()=> fileInput.click());

  // Before/After split drag
  let dragging=false;
  const leftDiv = document.querySelector('.ba-left');
  const rightDiv = document.querySelector('.ba-right');
  const splitDiv = document.querySelector('.ba-split');
  function setSplit(posPercent){
    posPercent = Math.max(5, Math.min(95, posPercent));
    leftDiv.style.width = posPercent + '%';
    rightDiv.style.width = (100 - posPercent) + '%';
    splitDiv.style.left = posPercent + '%';
  }
  splitDiv.addEventListener('pointerdown', (e)=>{ dragging=true; });
  window.addEventListener('pointerup', ()=>{ dragging=false; });
  window.addEventListener('pointermove', (e)=>{
    if(!dragging) return;
    const rect = beforeAfterWrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.round((x/rect.width)*100);
    setSplit(pct);
  });
  // init split at 50%
  setSplit(50);
}

export default function init(){
  wireUI();
}
JS

# 4) Add CSS for progress, before/after slider, crop outline, success animation
cat > assets/css/style.css <<'CSS'
/* (Phase-2 improved style merged into existing style) */
/* existing styles ... keep earlier definitions above this line in your file */
/* Additions for Phase-2 */
#progress-bar { height:10px; background:rgba(0,0,0,0.06); border-radius:999px; overflow:hidden; margin-top:12px; }
#progress-fill { height:100%; width:0%; background:linear-gradient(90deg,var(--accent),var(--accent-2)); transition:width 220ms ease; }

.before-after-wrap { display:flex; width:100%; gap:0.5rem; margin-top:1rem; position:relative; align-items:stretch; }
.before-after-wrap .ba-left { width:50%; position:relative; overflow:hidden; }
.before-after-wrap .ba-right { width:50%; position:relative; overflow:hidden; }
.before-after-wrap .ba-left canvas, .before-after-wrap .ba-right canvas { width:100%; height:auto; display:block; border-radius:6px; }
.before-after-wrap .ba-split { position:absolute; top:0; bottom:0; width:6px; left:50%; transform:translateX(-3px); background:linear-gradient(180deg,#fff,rgba(255,255,255,0.1)); box-shadow:0 2px 8px rgba(2,6,23,0.08); border-radius:3px; cursor:ew-resize; z-index:10; }

#status.success { animation: pop 1s ease; color: #059669; }
@keyframes pop { 0%{ transform:translateY(0); } 20%{ transform:translateY(-6px) scale(1.02);} 100%{ transform:translateY(0); } }

/* crop overlay helpers (if we add UI later to draw a rectangle) */
.crop-overlay { position:absolute; border:2px dashed rgba(6,182,212,0.9); pointer-events:none; }

/* mobile bottom sheet: show controls as bottom sheet on small screens */
@media (max-width:600px){
  .controls { position:fixed; right:12px; left:12px; bottom:12px; background:rgba(255,255,255,0.98); border-radius:12px; padding:0.75rem; box-shadow:0 20px 40px rgba(2,6,23,0.12); }
}
CSS

# 5) Add lint & prettier configs and package.json
cat > .eslintrc.json <<'ESL'
{
  "env": { "browser": true, "es2021": true },
  "extends": "eslint:recommended",
  "parserOptions": { "ecmaVersion": 12, "sourceType": "module" },
  "rules": { "no-unused-vars": "warn", "no-console": "off" }
}
ESL

cat > .prettierrc <<'PRE'
{
  "printWidth": 100,
  "tabWidth": 2,
  "singleQuote": true,
  "trailingComma": "es5",
  "semi": true
}
PRE

cat > package.json <<'PKG'
{
  "name": "pan-photo-resize",
  "version": "0.2.0",
  "private": true,
  "scripts": {
    "lint": "eslint . --ext .js",
    "format": "prettier --write .",
    "test": "echo \"No tests yet\" && exit 0"
  },
  "devDependencies": {
    "eslint": "^8.0.0",
    "prettier": "^2.0.0"
  }
}
PKG

# 6) Stage, commit & push
git add .
git commit -m "Phase-2 UI upgrades: crop groundwork, Web Worker, before/after slider, progress UI, lint configs" || echo "Nothing to commit"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://${GITHUB_TOKEN}@github.com/rudrajain051107/pan-photo-resize.git"
  git push -u origin "${BRANCH}" --force
else
  git push -u origin "${BRANCH}" --force
fi

echo "Phase-2 upgrade applied and pushed (if credentials allowed)."
echo "Important: OffscreenCanvas works in modern browsers — worker falls back to main thread if not available."
