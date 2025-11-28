/* app-phase3.js - main orchestrator (Phase 3)
   - Assumes index.html has elements with ids used below:
     file-input, drop-zone, process-btn, download-btn, batch-zip-btn,
     before-canvas, after-canvas, preset-select, quality-range,
     undo-btn, redo-btn, crop-btn, status
   - Uses modules: Cropper (cropper.js) and Validator (validator.js)
   - Uses imageProcessor.processFileMain and processFileWorkerAvailable
*/
import Cropper from './cropper.js';
import Validator from './validator.js';
import { processFileMain, processFileWorkerAvailable } from './imageProcessor.js';

// small helper (safe revoke) — keep in UI layer
function safeRevoke(url){ try { URL.revokeObjectURL(url); } catch(e) { /* ignore */ } }

const el = id => document.getElementById(id);

// Elements
const fileInput = el('file-input');
const dropZone = el('drop-zone');
const processBtn = el('process-btn');
const downloadBtn = el('download-btn');
const batchZipBtn = el('batch-zip-btn');
const statusEl = el('status');
const beforeCanvas = el('before-canvas');
const afterCanvas = el('after-canvas');
const presetSelect = el('preset-select');
const qualityRange = el('quality-range');
const undoBtn = el('undo-btn');
const redoBtn = el('redo-btn');
const cropBtn = el('crop-btn');

const validator = new Validator({ maxSizeMB: 10, allowedTypes: ['image/jpeg','image/png'] });

// Presets — editable
const PRESETS = {
  'NSDL (276×394)': { w: 276, h: 394, maxBytes: 50000 },
  'UTI (213×213)': { w: 213, h: 213, maxBytes: 30000 },
  'Aadhaar (600×600)': { w: 600, h: 600, maxBytes: 150000 },
  'Passport (413×531)': { w: 413, h: 531, maxBytes: 100000 },
  'Custom': null
};

// app state
let files = [];               // {file, name}
let currentIndex = -1;
let currentImageBitmap = null;
let cropper = null;
let historyStack = [], historyIndex = -1;
const HISTORY_MAX = 20;

function logStatus(msg, err=false){
  if(!statusEl) return;
  statusEl.textContent = msg;
  statusEl.style.color = err ? 'crimson' : '';
}

// history helpers
function pushHistory(state){
  if (historyIndex < historyStack.length - 1) historyStack.splice(historyIndex + 1);
  historyStack.push(JSON.parse(JSON.stringify(state)));
  if (historyStack.length > HISTORY_MAX) historyStack.shift();
  historyIndex = historyStack.length - 1;
  updateUndoRedo();
}
function undoHistory(){
  if (historyIndex <= 0) return null;
  historyIndex--;
  updateUndoRedo();
  return JSON.parse(JSON.stringify(historyStack[historyIndex]));
}
function redoHistory(){
  if (historyIndex >= historyStack.length - 1) return null;
  historyIndex++;
  updateUndoRedo();
  return JSON.parse(JSON.stringify(historyStack[historyIndex]));
}
function updateUndoRedo(){
  if(undoBtn) undoBtn.disabled = !(historyIndex > 0);
  if(redoBtn) redoBtn.disabled = !(historyIndex < historyStack.length - 1);
}

// Draw image to canvas (keeps aspect ratio and limits to 1024 width)
function drawImageToCanvas(imgBitmap, canvas){
  if(!canvas || !imgBitmap) return;
  const ctx = canvas.getContext('2d');
  const maxW = 1024;
  const iw = imgBitmap.naturalWidth || imgBitmap.width || imgBitmap.width;
  const ih = imgBitmap.naturalHeight || imgBitmap.height || imgBitmap.height;
  const scale = Math.min(1, maxW / iw);
  const cw = Math.round(iw * scale);
  const ch = Math.round(ih * scale);
  canvas.width = cw;
  canvas.height = ch;
  ctx.clearRect(0,0,cw,ch);
  ctx.drawImage(imgBitmap, 0, 0, cw, ch);
}

// Safe image decoding using createImageBitmap when available
async function loadImageBitmapFromFile(file){
  try {
    if (window.createImageBitmap) {
      try {
        return await createImageBitmap(file);
      } catch(e) {
        // fallback to Image element if createImageBitmap fails
      }
    }
    // fallback
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = ()=> resolve(img);
      img.onerror = ()=> reject(new Error('Image decode failed'));
      img.src = URL.createObjectURL(file);
    });
  } catch(err) {
    // final fallback try
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = ()=> resolve(img);
      img.onerror = ()=> reject(new Error('Image decode failed'));
      img.src = URL.createObjectURL(file);
    });
  }
}

// Load & preview single file
async function loadAndPreviewFile(fileObj){
  try{
    logStatus('Loading image...');
    const file = fileObj.file;
    const imgBitmap = await loadImageBitmapFromFile(file);
    currentImageBitmap = imgBitmap;
    drawImageToCanvas(imgBitmap, beforeCanvas);
    // init cropper
    if(!cropper) cropper = new Cropper(beforeCanvas);
    cropper.start({ x: 0, y: 0, w: beforeCanvas.width, h: beforeCanvas.height });
    pushHistory({ type: 'preview', timestamp: Date.now(), width: beforeCanvas.width, height: beforeCanvas.height });
    logStatus('Preview ready');
  }catch(e){
    console.error(e);
    logStatus('Image failed to load or decode', true);
  }
}

// Process current file (uses worker if available)
async function processCurrentFile(){
  if(currentIndex < 0 || !files[currentIndex]) { logStatus('No file selected', true); return; }
  const fileObj = files[currentIndex];
  const presetName = presetSelect ? presetSelect.value : 'Custom';
  const preset = PRESETS[presetName] || null;
  const quality = qualityRange ? Number(qualityRange.value) : 0.92;
  logStatus('Processing...');
  const cropRect = cropper && cropper.getRect ? cropper.getRect() : null;
  const useWorker = processFileWorkerAvailable();
  try {
    const res = await processFileMain({
      file: fileObj.file,
      preset,
      quality,
      cropRect,
      useWorker
    });
    let finalObj = res;
    if (res instanceof Blob) finalObj = { blob: res };
    if (!finalObj || !finalObj.blob) { logStatus('Processing returned no blob', true); return; }
    const afterBitmap = await loadImageBitmapFromFile(finalObj.blob);
    drawImageToCanvas(afterBitmap, afterCanvas);
    pushHistory({ type:'processed', fileName: fileObj.name, time: Date.now() });
    logStatus('Processing complete');
    downloadBtn.disabled = false;
    downloadBtn.dataset.blobUrl = URL.createObjectURL(finalObj.blob);
    downloadBtn.dataset.fileName = (fileObj.name || 'output.jpg').replace(/\.[^.]+$/, '') + '_resized.jpg';
  } catch (err) {
    console.error(err);
    logStatus('Processing failed: ' + (err.message || err), true);
  }
}

// Batch -> zip
async function downloadBatchZip(){
  if (typeof JSZip === 'undefined') {
    logStatus('JSZip not loaded', true);
    return;
  }
  logStatus('Preparing batch zip...');
  const zip = new JSZip();
  for (let i=0;i<files.length;i++){
    try{
      const f = files[i];
      const res = await processFileMain({ file: f.file, preset: PRESETS[presetSelect.value] || null, quality: 0.92, useWorker: processFileWorkerAvailable() });
      const obj = res instanceof Blob ? { blob: res } : res;
      if (obj && obj.blob) {
        zip.file((f.name || `file${i}`).replace(/\.[^.]+$/,'') + '.jpg', obj.blob);
      }
    }catch(e){
      console.warn('Batch item failed', e);
    }
  }
  const content = await zip.generateAsync({ type: 'blob' }, meta => {
    logStatus(`Zipping: ${Math.round(meta.percent)}%`);
  });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pan-photos.zip';
  a.click();
  setTimeout(()=>safeRevoke(url), 60_000);
  logStatus('Batch ready');
}

// Drag & drop setup
function setupDragDrop(){
  if(!dropZone) return;
  ['dragenter','dragover'].forEach(evt=> dropZone.addEventListener(evt, e => { e.preventDefault(); dropZone.classList.add('drag-over'); }));
  ['dragleave','drop'].forEach(evt=> dropZone.addEventListener(evt, e => { e.preventDefault(); dropZone.classList.remove('drag-over'); }));
  dropZone.addEventListener('drop', async e => {
    const dt = e.dataTransfer;
    if(!dt) return;
    const fls = Array.from(dt.files || []);
    await handleFilesAdded(fls);
  });
}

// handle file input selection
async function handleFilesAdded(fileList){
  for(const f of fileList){
    try{
      const v = validator.validate(f);
      if(!v.ok) { logStatus(v.msg, true); continue; }
      files.push({ file: f, name: f.name });
    }catch(e){ console.error(e); }
  }
  if(files.length>0){
    currentIndex = 0;
    await loadAndPreviewFile(files[currentIndex]);
    processBtn.disabled = false;
    batchZipBtn.disabled = files.length < 2;
  }
}

// UI wiring
function wireUi(){
  if (fileInput) fileInput.addEventListener('change', async e => {
    const fls = Array.from(e.target.files || []);
    await handleFilesAdded(fls);
  });
  if (processBtn) processBtn.addEventListener('click', processCurrentFile);
  if (batchZipBtn) batchZipBtn.addEventListener('click', downloadBatchZip);
  if (downloadBtn) downloadBtn.addEventListener('click', () => {
    const url = downloadBtn.dataset.blobUrl;
    const name = downloadBtn.dataset.fileName || 'output.jpg';
    if (!url) { logStatus('Nothing to download', true); return; }
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(()=>safeRevoke(url), 60_000);
  });
  if (undoBtn) undoBtn.addEventListener('click', () => {
    const s = undoHistory();
    if (s) logStatus('Undo performed');
  });
  if (redoBtn) redoBtn.addEventListener('click', () => {
    const s = redoHistory();
    if (s) logStatus('Redo performed');
  });
  if (cropBtn) cropBtn.addEventListener('click', () => {
    if (cropper && cropper.commit) {
      cropper.commit();
      pushHistory({ type:'crop', time: Date.now(), rect: cropper.getRect() });
    }
  });
  setupDragDrop();
}

// init presets dropdown
function initPresets(){
  if(!presetSelect) return;
  presetSelect.innerHTML = '';
  Object.keys(PRESETS).forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    presetSelect.appendChild(opt);
  });
}

// init
(function init(){
  initPresets();
  wireUi();
  logStatus('Ready');
})();

export { loadAndPreviewFile, processCurrentFile, pushHistory, undoHistory, redoHistory };
