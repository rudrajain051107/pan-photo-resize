// assets/js/app-phase3.js
// Phase-3 — robust, Android-safe frontend orchestrator
// Rewritten: load/preview, crop, undo/redo, processing, download, batch ZIP, UI controls.
// Assumes these modules exist in repo: Cropper, validateFile, processFile, cleanImageBlob
import Cropper from './cropper.js';
import { validateFile } from './validator.js';
import { processFile } from './imageProcessor.js';
import { cleanImageBlob } from './fixImage.js';

/* ----- Elements ----- */
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const processBtn = document.getElementById('process-btn');
const resetBtn = document.getElementById('reset-btn');
const downloadZipBtn = document.getElementById('download-zip');
const clearBatchBtn = document.getElementById('clear-batch');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const cropBtn = document.getElementById('crop-btn');
const presetSelect = document.getElementById('preset-select');
const statusEl = document.getElementById('status');
const downloadBtn = document.getElementById('downloadBtn');
const beforeCanvas = document.getElementById('before-canvas');
const afterCanvas  = document.getElementById('after-canvas');
const zoomSlider   = document.querySelector('input[type="range"][id="zoom"]') || null;
const debugLogEl   = document.getElementById('debug-log') || null;

/* ----- State ----- */
let files = [];                 // batch queue (File[])
let currentIndex = 0;           // selected index in files
let currentFile = null;         // File object for preview/processing
let editingImage = null;        // HTMLImageElement or ImageBitmap for preview
let cropper = null;             // Cropper instance (if used)
let cropMode = false;
let historyStack = [];          // dataURL snapshots for undo/redo (before-canvas)
let historyIndex = -1;
let latestProcessedFile = null; // File (processed) for download
const HISTORY_MAX = 20;

/* ----- Helpers ----- */
function logDebug(msg){
  try {
    console.log(msg);
    if(debugLogEl){
      const d = document.createElement('div');
      d.textContent = (new Date()).toLocaleTimeString() + ' — ' + msg;
      debugLogEl.appendChild(d);
      debugLogEl.scrollTop = debugLogEl.scrollHeight;
    }
  } catch(e){ /* ignore */ }
}

function setStatus(text, isError=false){
  if(!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = isError ? 'crimson' : '';
}

/* Draw helpers: bulletproof */
function drawToCanvas(imgLike, canvas){
  try {
    if(!imgLike || !canvas) return false;
    const ctx = canvas.getContext('2d');
    // derive natural sizes for different image types
    const w = imgLike.naturalWidth || imgLike.width || imgLike.bitmapWidth || 400;
    const h = imgLike.naturalHeight || imgLike.height || imgLike.bitmapHeight || Math.max(200, Math.round(w * 0.75));
    // force canvas pixel size (fixes many Android 0x0 issues)
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(imgLike, 0, 0, canvas.width, canvas.height);
    return true;
  } catch(err){
    logDebug('drawToCanvas error: ' + (err && err.message ? err.message : err));
    return false;
  }
}

/* Save current beforeCanvas snapshot into history */
function pushHistory(){
  try {
    const data = beforeCanvas.toDataURL('image/jpeg', 0.9);
    // remove "forward" states if user undid then made change
    if(historyIndex < historyStack.length - 1){
      historyStack.splice(historyIndex + 1);
    }
    historyStack.push(data);
    if(historyStack.length > HISTORY_MAX) historyStack.shift();
    historyIndex = historyStack.length - 1;
    updateUndoRedoButtons();
  } catch(e){
    logDebug('pushHistory failed: ' + e);
  }
}
function updateUndoRedoButtons(){
  undoBtn.disabled = !(historyIndex > 0);
  redoBtn.disabled = !(historyIndex < historyStack.length - 1);
}

function undo(){
  if(!(historyIndex > 0)) return;
  historyIndex--;
  const data = historyStack[historyIndex];
  const img = new Image();
  img.onload = ()=> { drawToCanvas(img, beforeCanvas); };
  img.src = data;
  updateUndoRedoButtons();
}
function redo(){
  if(!(historyIndex < historyStack.length - 1)) return;
  historyIndex++;
  const data = historyStack[historyIndex];
  const img = new Image();
  img.onload = ()=> { drawToCanvas(img, beforeCanvas); };
  img.src = data;
  updateUndoRedoButtons();
}

/* Safe revoke */
function safeRevoke(url){
  try { URL.revokeObjectURL(url); } catch(e){ /* ignore */ }
}

/* Multi-strategy loader (robust for Android) */
async function loadAndPreviewFile(file){
  setStatus('Loading preview...');
  logDebug(`loadAndPreviewFile start: ${file.name || 'unknown'} ${file.type || ''} ${file.size||0} bytes`);
  // reset UI flags
  editingImage = null;
  cropMode = false;
  if(cropper){ try{ cropper = null; } catch(e){} }

  // Guard
  if(!file || file.size === 0){
    setStatus('No file or zero-size', true); return;
  }

  // small helper strategies
  const tryWithObjectURL = (blob) => new Promise((resolve,reject)=>{
    try {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = ()=>{ safeRevoke(url); resolve(img); };
      img.onerror = async (e)=>{
        safeRevoke(url);
        reject(new Error('objectURL decode failed'));
      };
      img.src = url;
    } catch(e){ reject(e); }
  });

  const tryWithDataURL = (blob) => new Promise((resolve,reject)=>{
    try {
      const fr = new FileReader();
      fr.onload = ()=> {
        const img = new Image();
        img.onload = ()=> resolve(img);
        img.onerror = ()=> reject(new Error('dataURL decode failed'));
        img.src = fr.result;
      };
      fr.onerror = (e)=> reject(e);
      fr.readAsDataURL(blob);
    } catch(e){ reject(e); }
  });

  const tryWithBitmap = async (blob) => {
    if(!('createImageBitmap' in window)) throw new Error('no createImageBitmap');
    const bmp = await createImageBitmap(blob);
    return bmp;
  };

  // rebuild blob (force re-encode) fallback
  const rebuildBlob = async (orig) => {
    try {
      const ab = await orig.arrayBuffer();
      const arr = new Uint8Array(ab);
      return new Blob([arr], { type: orig.type || 'image/jpeg' });
    } catch(e){
      throw e;
    }
  };

  // Try A: object URL -> Image
  try {
    const img = await tryWithObjectURL(file);
    if(drawToCanvas(img, beforeCanvas)){
      editingImage = img;
      pushHistory();
      setStatus(`Loaded ${file.name}`);
      return;
    }
  } catch(e){
    logDebug('Strategy A failed: ' + (e && e.message || e));
  }

  // Try B: dataURL
  try {
    const img = await tryWithDataURL(file);
    if(drawToCanvas(img, beforeCanvas)){
      editingImage = img;
      pushHistory();
      setStatus(`Loaded ${file.name} (dataURL)`);
      return;
    }
  } catch(e){
    logDebug('Strategy B failed: ' + (e && e.message || e));
  }

  // Try C: ImageBitmap
  try {
    const bmp = await tryWithBitmap(file);
    // draw ImageBitmap
    const ctx = beforeCanvas.getContext('2d');
    beforeCanvas.width = bmp.width || Math.max(200, bmp.width || 200);
    beforeCanvas.height = bmp.height || Math.max(200, bmp.height || 200);
    ctx.clearRect(0,0,beforeCanvas.width,beforeCanvas.height);
    ctx.drawImage(bmp, 0, 0, beforeCanvas.width, beforeCanvas.height);
    try{ bmp.close && bmp.close(); }catch(e){}
    editingImage = null;
    pushHistory();
    setStatus(`Loaded ${file.name} (bitmap)`);
    return;
  } catch(e){
    logDebug('Strategy C failed: ' + (e && e.message || e));
  }

  // Try D: rebuild then retry A/B/C
  try {
    const rebuilt = await rebuildBlob(file);
    // A
    try {
      const img = await tryWithObjectURL(rebuilt);
      if(drawToCanvas(img, beforeCanvas)){
        editingImage = img; pushHistory(); setStatus(`Loaded ${file.name} (rebuilt)`); return;
      }
    } catch(e){ logDebug('Rebuilt-A failed'); }
    // B
    try {
      const img = await tryWithDataURL(rebuilt);
      if(drawToCanvas(img, beforeCanvas)){
        editingImage = img; pushHistory(); setStatus(`Loaded ${file.name} (rebuilt dataURL)`); return;
      }
    } catch(e){ logDebug('Rebuilt-B failed'); }
    // C
    try {
      const bmp = await tryWithBitmap(rebuilt);
      const ctx = beforeCanvas.getContext('2d');
      beforeCanvas.width = bmp.width || 200; beforeCanvas.height = bmp.height || 200;
      ctx.drawImage(bmp,0,0,beforeCanvas.width,beforeCanvas.height);
      try{ bmp.close && bmp.close(); }catch(e){}
      editingImage = null; pushHistory(); setStatus(`Loaded ${file.name} (rebuilt bitmap)`); return;
    } catch(e){ logDebug('Rebuilt-C failed'); }
  } catch(e){
    logDebug('Rebuild failed: ' + e);
  }

  setStatus('Failed to load image', true);
  logDebug('All decoding strategies failed');
}

/* ----- File selection / drop ----- */
fileInput && fileInput.addEventListener('change', async (e)=>{
  const f = e.target.files?.[0];
  if(!f){ setStatus('No file selected', true); return; }
  // try repair for JPEG small corruption events
  if(f.type === 'image/jpeg' && f.size > 0 && f.size < 100){
    setStatus('File appears corrupted (too small)', true); return;
  }
  try {
    if(f.type === 'image/jpeg'){
      setStatus('Attempting JPEG repair...');
      try {
        const repaired = await cleanImageBlob(f);
        currentFile = repaired instanceof Blob ? new File([repaired], f.name, { type: 'image/jpeg' }) : f;
      } catch(e){
        currentFile = f;
        logDebug('JPEG repair failed: ' + e);
      }
    } else {
      currentFile = f;
    }
    // put file into batch list as well
    files = [ currentFile ];
    currentIndex = 0;
    clearBatchBtn.disabled = false;
    downloadZipBtn.disabled = files.length === 0;
    // preview
    await loadAndPreviewFile(currentFile);
    processBtn.disabled = false;
    cropBtn.disabled = false;
  } catch(e){
    setStatus('Error handling file', true);
    logDebug(e);
  }
});

dropZone && dropZone.addEventListener('dragover', (ev)=>{ ev.preventDefault(); dropZone.classList.add('dragover'); });
dropZone && dropZone.addEventListener('dragleave', (ev)=>{ ev.preventDefault(); dropZone.classList.remove('dragover'); });
dropZone && dropZone.addEventListener('drop', async (ev)=>{
  ev.preventDefault(); dropZone.classList.remove('dragover');
  const list = Array.from(ev.dataTransfer?.files || []);
  if(list.length === 0) return;
  // validate & keep only images
  files = list.filter(f => validateFile(f).valid);
  if(files.length === 0){ setStatus('No valid images dropped', true); return; }
  currentIndex = 0; currentFile = files[0];
  clearBatchBtn.disabled = false;
  downloadZipBtn.disabled = false;
  await loadAndPreviewFile(currentFile);
  processBtn.disabled = false;
  cropBtn.disabled = false;
});

/* ----- Crop (toggle) ----- */
cropBtn && cropBtn.addEventListener('click', ()=>{
  if(!editingImage && !currentFile){ setStatus('No image to crop', true); return; }
  if(!cropper){
    cropper = new Cropper(beforeCanvas);
  }
  if(!cropMode){
    // start a default crop area or rely on Cropper internal default
    try {
      const w = Math.min( Math.round(beforeCanvas.width * 0.6), 300 );
      const h = Math.min( Math.round(beforeCanvas.height * 0.6), 300 );
      cropper.start({ x: 20, y: 20, w: w, h: h });
    } catch(e){}
    cropMode = true;
    cropBtn.textContent = 'Apply Crop';
    setStatus('Crop mode: adjust and click Apply Crop');
  } else {
    // apply crop using cropper.rect (conservative: check presence)
    try {
      const r = cropper && cropper.rect;
      if(!r){ setStatus('No crop rectangle found', true); cropMode=false; cropBtn.textContent='Crop'; return; }
      // draw cropped region to beforeCanvas
      const ctx = beforeCanvas.getContext('2d');
      const temp = document.createElement('canvas');
      temp.width = r.w; temp.height = r.h;
      const tctx = temp.getContext('2d');
      tctx.drawImage(beforeCanvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      // replace beforeCanvas
      beforeCanvas.width = temp.width; beforeCanvas.height = temp.height;
      ctx.clearRect(0,0,beforeCanvas.width,beforeCanvas.height);
      ctx.drawImage(temp,0,0);
      // reset editingImage and history
      editingImage = null;
      pushHistory();
      setStatus('Crop applied');
    } catch(e){
      logDebug('Crop apply failed: ' + e);
      setStatus('Crop failed', true);
    }
    cropMode = false;
    cropBtn.textContent = 'Crop';
  }
});

/* ----- Undo / Redo ----- */
undoBtn && undoBtn.addEventListener('click', ()=>{ undo(); setStatus('Undid'); });
redoBtn && redoBtn.addEventListener('click', ()=>{ redo(); setStatus('Redid'); });

/* ----- Reset / Clear Batch ----- */
resetBtn && resetBtn.addEventListener('click', ()=>{
  try {
    const ctx = beforeCanvas.getContext('2d'); ctx.clearRect(0,0,beforeCanvas.width,beforeCanvas.height);
    const ctx2 = afterCanvas.getContext('2d'); ctx2.clearRect(0,0,afterCanvas.width,afterCanvas.height);
  } catch(e){}
  files = []; currentFile = null; editingImage = null; latestProcessedFile = null;
  historyStack = []; historyIndex = -1; updateUndoRedoButtons();
  processBtn.disabled = true; downloadBtn.disabled = true; downloadZipBtn.disabled = true; clearBatchBtn.disabled = true;
  setStatus('Reset complete');
});

/* Clear batch (keep preview) */
clearBatchBtn && clearBatchBtn.addEventListener('click', ()=>{
  files = []; clearBatchBtn.disabled = true; downloadZipBtn.disabled = true;
  setStatus('Batch cleared');
});

/* ----- Zoom slider (CSS scale preview) ----- */
if(zoomSlider){
  zoomSlider.addEventListener('input', ()=> {
    const v = parseFloat(zoomSlider.value);
    // map slider [0..100] to scale [0.5..2.0] for example (adjustable)
    const scale = 0.5 + (v/100) * 1.5;
    beforeCanvas.style.transformOrigin = 'top left';
    beforeCanvas.style.transform = `scale(${scale})`;
  });
}

/* ----- Processing (single) ----- */
processBtn && processBtn.addEventListener('click', async ()=>{
  if(!currentFile){ setStatus('Upload a file first', true); return; }
  setStatus('Processing...');
  processBtn.disabled = true; downloadBtn.disabled = true;
  try {
    // Determine preset (string key)
    const preset = presetSelect ? presetSelect.value : 'nsdl';
    const resultBlob = await processFile(currentFile, preset);
    if(!resultBlob || !(resultBlob instanceof Blob)){ throw new Error('processFile did not return Blob'); }
    // store File for download
    const outName = currentFile.name ? ('processed-' + currentFile.name) : ('processed.jpg');
    latestProcessedFile = new File([resultBlob], outName, { type: resultBlob.type || 'image/jpeg' });
    window._latestProcessedFile = latestProcessedFile; // global helper
    // preview processed image
    let previewOk = false;
    try {
      const url = URL.createObjectURL(resultBlob);
      const img = new Image();
      img.onload = ()=> { drawToCanvas(img, afterCanvas); safeRevoke(url); previewOk = true; setStatus('Done'); };
      img.onerror = async ()=>{
        safeRevoke(url);
        // fallback to bitmap
        try {
          if(typeof createImageBitmap === 'function'){
            const bmp = await createImageBitmap(resultBlob);
            drawToCanvas(bmp, afterCanvas);
            try{ bmp.close && bmp.close(); }catch(e){}
            previewOk = true; setStatus('Done');
          } else {
            setStatus('Processed but preview failed', false);
          }
        } catch(e){
          setStatus('Processed but preview failed', false);
        }
      };
      img.src = url;
    } catch(e){
      logDebug('Processed preview error: ' + e);
      setStatus('Processed but preview failed', false);
    }
    downloadBtn.disabled = false;
  } catch(err){
    logDebug('Processing error: ' + err);
    setStatus('Processing error', true);
  } finally {
    processBtn.disabled = false;
  }
});

/* ----- Download single file ----- */
downloadBtn && downloadBtn.addEventListener('click', ()=>{
  const file = latestProcessedFile || window._latestProcessedFile;
  if(!file){ setStatus('No processed file to download', true); return; }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name || 'processed.jpg';
  document.body.appendChild(a);
  a.click();
  a.remove();
  safeRevoke(url);
  setStatus('Download started');
});

/* ----- Download ZIP (batch) ----- */
downloadZipBtn && downloadZipBtn.addEventListener('click', async ()=>{
  if(!files || files.length === 0){ setStatus('No batch files to process', true); return; }
  setStatus('Processing batch – creating ZIP...');
  downloadZipBtn.disabled = true; clearBatchBtn.disabled = true;
  try {
    // lazy-check for JSZip available
    if(typeof JSZip === 'undefined'){ setStatus('JSZip not available', true); downloadZipBtn.disabled = false; return; }
    const zip = new JSZip();
    for(let i=0;i<files.length;i++){
      const f = files[i];
      setStatus(`Processing ${i+1}/${files.length}: ${f.name}`);
      try {
        const blob = await processFile(f, presetSelect ? presetSelect.value : 'nsdl');
        // ensure blob is blob
        if(!(blob instanceof Blob)) throw new Error('processFile returned non-blob');
        zip.file(`processed-${f.name}`, blob);
      } catch(err){
        logDebug('Batch item failed: ' + (err && err.message || err));
        // still continue next files
      }
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pan-photos-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    safeRevoke(url);
    setStatus('ZIP ready — download started');
  } catch(e){
    logDebug('Batch ZIP error: ' + e);
    setStatus('Batch processing failed', true);
  } finally {
    downloadZipBtn.disabled = false; clearBatchBtn.disabled = false;
  }
});

/* ----- Initial setup ----- */
(function init(){
  processBtn.disabled = true;
  downloadBtn.disabled = true;
  downloadZipBtn.disabled = true;
  clearBatchBtn.disabled = true;
  cropBtn.disabled = true;
  undoBtn.disabled = true;
  redoBtn.disabled = true;
  setStatus('Ready');
  // ensure canvases visible and a minimum size
  try {
    beforeCanvas.style.display = 'block';
    afterCanvas.style.display = 'block';
    if(beforeCanvas.width === 0) { beforeCanvas.width = 320; beforeCanvas.height = 240; }
    if(afterCanvas.width === 0) { afterCanvas.width = 320; afterCanvas.height = 240; }
  } catch(e){}
})();
