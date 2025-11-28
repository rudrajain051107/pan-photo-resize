/* app-phase3.js - FULL Phase-3 Orchestrator (imports only; modules separate) */

/* IMPORTS */
import Cropper from './cropper.js';
import { validateFile } from './validator.js';
import { processFile } from './imageProcessor.js';
import { cleanImageBlob } from './fixImage.js';

/* DEBUG HELPERS */
function logDebug(msg){
  try {
    console.log(msg);
    const el = document.getElementById && document.getElementById('debug-log');
    if(el){
      const d = document.createElement('div');
      d.textContent = (new Date()).toLocaleTimeString() + ' — ' + msg;
      el.appendChild(d);
      el.scrollTop = el.scrollHeight;
    }
  } catch(e){}
}

/* DOM ELEMENTS */
const fileInput     = document.getElementById('file-input');
const dropZone      = document.getElementById('drop-zone');
const processBtn    = document.getElementById('process-btn');
const resetBtn      = document.getElementById('reset-btn');
const downloadZipBtn= document.getElementById('download-zip');
const clearBatchBtn = document.getElementById('clear-batch');
const undoBtn       = document.getElementById('undo-btn');
const redoBtn       = document.getElementById('redo-btn');
const cropBtn       = document.getElementById('crop-btn');
const presetSelect  = document.getElementById('preset-select');
const statusEl      = document.getElementById('status');
const downloadBtn   = document.getElementById('downloadBtn');
const beforeCanvas  = document.getElementById('before-canvas');
const afterCanvas   = document.getElementById('after-canvas');
const zoomSlider    = document.querySelector('input[type="range"][id="zoom"]') || null;

/* STATE */
let files = [];
let currentFile = null;
let editingImage = null; // HTMLImageElement or ImageBitmap
let cropper = null;
let cropMode = false;
let historyStack = [];
let historyIndex = -1;
let latestProcessedFile = null;
const HISTORY_MAX = 20;

/* UTIL: status */
function setStatus(text, isError=false){
  if(!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = isError ? 'crimson' : '';
}

/* UTIL: safe revoke */
function safeRevoke(url){ try{ URL.revokeObjectURL(url); } catch(e){} }

/* DRAW helper - supports HTMLImageElement & ImageBitmap */
function drawToCanvas(imgLike, canvas){
  try {
    if(!imgLike || !canvas) return false;
    const ctx = canvas.getContext('2d');
    const w = imgLike.naturalWidth || imgLike.width || imgLike.bitmapWidth || 400;
    const h = imgLike.naturalHeight || imgLike.height || imgLike.bitmapHeight || Math.max(200, Math.round(w*0.75));
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    ctx.clearRect(0,0,canvas.width, canvas.height);
    ctx.drawImage(imgLike, 0, 0, canvas.width, canvas.height);
    return true;
  } catch(err){
    logDebug('drawToCanvas error: ' + (err && err.message ? err.message : err));
    return false;
  }
}

/* History (undo/redo) */
function pushHistory(){
  try {
    const snapshot = beforeCanvas.toDataURL('image/jpeg', 0.9);
    if(historyIndex < historyStack.length - 1) historyStack.splice(historyIndex + 1);
    historyStack.push(snapshot);
    if(historyStack.length > HISTORY_MAX) historyStack.shift();
    historyIndex = historyStack.length - 1;
    updateUndoRedoButtons();
  } catch(e){ logDebug('pushHistory failed: '+e); }
}
function updateUndoRedoButtons(){
  try {
    if(undoBtn) undoBtn.disabled = !(historyIndex > 0);
    if(redoBtn) redoBtn.disabled = !(historyIndex < historyStack.length - 1);
  } catch(e){}
}
function undo(){
  if(!(historyIndex > 0)) return;
  historyIndex--;
  const img = new Image();
  img.onload = ()=> { drawToCanvas(img, beforeCanvas); };
  img.src = historyStack[historyIndex];
  updateUndoRedoButtons();
}
function redo(){
  if(!(historyIndex < historyStack.length - 1)) return;
  historyIndex++;
  const img = new Image();
  img.onload = ()=> { drawToCanvas(img, beforeCanvas); };
  img.src = historyStack[historyIndex];
  updateUndoRedoButtons();
}

/* Multi-strategy loader: objectURL, dataURL, imageBitmap, rebuild */
async function loadAndPreviewFile(file){
  setStatus('Loading preview...');
  logDebug(`loadAndPreviewFile: ${file && file.name} ${file && file.type} ${file && file.size}`);

  editingImage = null; cropMode=false;
  if(cropper){ try{ cropper=null }catch(e){} }

  if(!file || file.size === 0){ setStatus('No file or zero-size', true); return; }

  const tryObjectURL = (blob) => new Promise((res, rej)=>{
    try {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = ()=>{ safeRevoke(url); res(img); };
      img.onerror = ()=>{ safeRevoke(url); rej(new Error('objectURL failed')); };
      img.src = url;
    } catch(e) { rej(e); }
  });

  const tryDataURL = (blob) => new Promise((res, rej)=>{
    try {
      const fr = new FileReader();
      fr.onload = ()=> {
        const img = new Image();
        img.onload = ()=> res(img);
        img.onerror = ()=> rej(new Error('dataURL decode failed'));
        img.src = fr.result;
      };
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    } catch(e){ rej(e); }
  });

  const tryBitmap = async (blob) => {
    if(typeof createImageBitmap === 'undefined') throw new Error('no createImageBitmap');
    const bmp = await createImageBitmap(blob);
    return bmp;
  };

  const rebuildBlob = async (orig) => {
    const ab = await orig.arrayBuffer();
    const ua = new Uint8Array(ab);
    return new Blob([ua], { type: orig.type || 'image/jpeg' });
  };

  // Try sequence
  try {
    try {
      const img = await tryObjectURL(file);
      if(drawToCanvas(img, beforeCanvas)){ editingImage = img; pushHistory(); setStatus(`Loaded ${file.name}`); return; }
    } catch(e){ logDebug('Strategy objectURL failed: '+e); }

    try {
      const img = await tryDataURL(file);
      if(drawToCanvas(img, beforeCanvas)){ editingImage = img; pushHistory(); setStatus(`Loaded ${file.name} (dataURL)`); return; }
    } catch(e){ logDebug('Strategy dataURL failed: '+e); }

    try {
      const bmp = await tryBitmap(file);
      const ctx = beforeCanvas.getContext('2d');
      beforeCanvas.width = bmp.width || Math.max(200, bmp.width || 200);
      beforeCanvas.height = bmp.height || Math.max(200, bmp.height || 200);
      ctx.clearRect(0,0,beforeCanvas.width,beforeCanvas.height);
      ctx.drawImage(bmp, 0, 0, beforeCanvas.width, beforeCanvas.height);
      try{ bmp.close && bmp.close(); }catch(e){}
      editingImage = null; pushHistory(); setStatus(`Loaded ${file.name} (bitmap)`); return;
    } catch(e){ logDebug('Strategy bitmap failed: '+e); }

    // rebuild and retry
    try {
      const rebuilt = await rebuildBlob(file);
      try {
        const img = await tryObjectURL(rebuilt);
        if(drawToCanvas(img, beforeCanvas)){ editingImage = img; pushHistory(); setStatus(`Loaded ${file.name} (rebuilt)`); return; }
      } catch(e){ logDebug('Rebuilt objectURL failed'); }
      try {
        const img = await tryDataURL(rebuilt);
        if(drawToCanvas(img, beforeCanvas)){ editingImage = img; pushHistory(); setStatus(`Loaded ${file.name} (rebuilt dataURL)`); return; }
      } catch(e){ logDebug('Rebuilt dataURL failed'); }
      try {
        const bmp = await tryBitmap(rebuilt);
        const ctx = beforeCanvas.getContext('2d');
        beforeCanvas.width = bmp.width || 200; beforeCanvas.height = bmp.height || 200;
        ctx.drawImage(bmp, 0, 0, beforeCanvas.width, beforeCanvas.height);
        try{ bmp.close && bmp.close(); }catch(e){}
        editingImage = null; pushHistory(); setStatus(`Loaded ${file.name} (rebuilt bitmap)`); return;
      } catch(e){ logDebug('Rebuilt bitmap failed'); }
    } catch(e){ logDebug('Rebuild failed: '+e); }

    setStatus('Failed to load image', true);
  } catch(err){
    console.error('loadAndPreviewFile fatal:', err);
    setStatus('Failed to load image', true);
  }
}

/* File input handler */
fileInput && fileInput.addEventListener('change', async (ev)=>{
  const f = ev.target.files?.[0];
  if(!f){ setStatus('No file selected', true); return; }
  // protect against tiny corrupted files
  if(f.size < 50){ setStatus('Corrupted input — select another', true); return; }

  try {
    if(f.type === 'image/jpeg' && f.size > 0){
      setStatus('Attempting JPEG repair...');
      try {
        const repaired = await cleanImageBlob(f);
        currentFile = repaired instanceof Blob ? new File([repaired], f.name, { type: 'image/jpeg' }) : f;
      } catch(e){
        currentFile = f;
        logDebug('JPEG repair failed: '+e);
      }
    } else {
      currentFile = f;
    }
    files = [ currentFile ];
    await loadAndPreviewFile(currentFile);
    processBtn && (processBtn.disabled = false);
    cropBtn && (cropBtn.disabled = false);
  } catch(e){
    setStatus('Error handling file', true);
    logDebug(e);
  }
});

/* Drag & drop */
dropZone && dropZone.addEventListener('dragover', e=>{ e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone && dropZone.addEventListener('dragleave', e=>{ e.preventDefault(); dropZone.classList.remove('dragover'); });
dropZone && dropZone.addEventListener('drop', async (e)=>{
  e.preventDefault(); dropZone.classList.remove('dragover');
  const list = Array.from(e.dataTransfer?.files || []);
  if(list.length === 0) return;
  files = list.filter(f => validateFile(f).valid);
  if(files.length === 0){ setStatus('No valid images dropped', true); return; }
  currentFile = files[0];
  await loadAndPreviewFile(currentFile);
  processBtn && (processBtn.disabled = false);
  cropBtn && (cropBtn.disabled = false);
});

/* Crop button - toggle apply */
cropBtn && cropBtn.addEventListener('click', ()=>{
  if(!editingImage && !currentFile){ setStatus('No image to crop', true); return; }
  if(!cropper){
    cropper = new Cropper(beforeCanvas);
  }
  if(!cropMode){
    try {
      const w = Math.min(Math.round(beforeCanvas.width * 0.6), 300);
      const h = Math.min(Math.round(beforeCanvas.height * 0.6), 300);
      cropper.start({ x: 20, y: 20, w, h });
    } catch(e){}
    cropMode = true;
    cropBtn.textContent = 'Apply Crop';
    setStatus('Crop mode: adjust then click Apply Crop');
  } else {
    try {
      const r = cropper && cropper.rect;
      if(!r){ setStatus('No crop rectangle found', true); cropMode=false; cropBtn.textContent='Crop'; return; }
      const temp = document.createElement('canvas');
      temp.width = r.w; temp.height = r.h;
      const tctx = temp.getContext('2d');
      tctx.drawImage(beforeCanvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      // replace beforeCanvas content
      beforeCanvas.width = temp.width; beforeCanvas.height = temp.height;
      const ctx = beforeCanvas.getContext('2d');
      ctx.clearRect(0,0,beforeCanvas.width,beforeCanvas.height);
      ctx.drawImage(temp, 0, 0);
      editingImage = null;
      pushHistory();
      setStatus('Crop applied');
    } catch(e){
      logDebug('Crop apply failed: '+e);
      setStatus('Crop failed', true);
    }
    cropMode = false;
    cropBtn.textContent = 'Crop';
  }
});

/* Undo/Redo wiring */
undoBtn && undoBtn.addEventListener('click', ()=>{ undo(); setStatus('Undid'); });
redoBtn && redoBtn.addEventListener('click', ()=>{ redo(); setStatus('Redid'); });

/* Reset / clear */
resetBtn && resetBtn.addEventListener('click', ()=>{
  try { beforeCanvas.getContext('2d').clearRect(0,0,beforeCanvas.width,beforeCanvas.height); }catch(e){}
  try { afterCanvas.getContext('2d').clearRect(0,0,afterCanvas.width,afterCanvas.height); }catch(e){}
  files = []; currentFile = null; editingImage=null; latestProcessedFile=null;
  historyStack=[]; historyIndex=-1; updateUndoRedoButtons();
  processBtn && (processBtn.disabled = true); downloadBtn && (downloadBtn.disabled = true);
  downloadZipBtn && (downloadZipBtn.disabled = true); clearBatchBtn && (clearBatchBtn.disabled = true);
  cropBtn && (cropBtn.disabled = true);
  setStatus('Reset complete');
});

/* Clear batch */
clearBatchBtn && clearBatchBtn.addEventListener('click', ()=>{
  files = []; clearBatchBtn.disabled = true; downloadZipBtn.disabled = true; setStatus('Batch cleared');
});

/* Zoom slider - CSS scale */
if(zoomSlider){
  zoomSlider.addEventListener('input', ()=> {
    const v = parseFloat(zoomSlider.value);
    const scale = 0.5 + (v/100) * 1.5;
    beforeCanvas.style.transformOrigin = 'top left';
    beforeCanvas.style.transform = `scale(${scale})`;
  });
}

/* Process single image */
processBtn && processBtn.addEventListener('click', async ()=>{
  if(!currentFile){ setStatus('Upload a file first', true); return; }
  setStatus('Processing...');
  processBtn.disabled = true; downloadBtn && (downloadBtn.disabled = true);
  try {
    const preset = presetSelect ? presetSelect.value : 'nsdl';
    const resultBlob = await processFile(currentFile, preset);
    if(!resultBlob || !(resultBlob instanceof Blob)) throw new Error('processFile did not return Blob');
    const outName = currentFile.name ? ('processed-' + currentFile.name) : 'processed.jpg';
    latestProcessedFile = new File([resultBlob], outName, { type: resultBlob.type || 'image/jpeg' });
    window._latestProcessedFile = latestProcessedFile;

    // preview processed
    try {
      const url = URL.createObjectURL(resultBlob);
      const img = new Image();
      img.onload = ()=> { drawToCanvas(img, afterCanvas); safeRevoke(url); setStatus('Done'); };
      img.onerror = async ()=>{
        safeRevoke(url);
        try { if(typeof createImageBitmap === 'function'){ const bmp = await createImageBitmap(resultBlob); drawToCanvas(bmp, afterCanvas); try{bmp.close&&bmp.close()}catch(e){}; setStatus('Done'); } else setStatus('Processed but preview failed', false); }
        catch(e){ setStatus('Processed but preview failed', false); }
      };
      img.src = url;
    } catch(e){ logDebug('Processed preview error: '+e); setStatus('Processed but preview failed', false); }

    downloadBtn && (downloadBtn.disabled = false);
  } catch(err){
    logDebug('Processing error: '+err);
    setStatus('Processing error', true);
  } finally { processBtn.disabled = false; }
});

/* Download single processed file */
downloadBtn && downloadBtn.addEventListener('click', ()=>{
  const f = latestProcessedFile || window._latestProcessedFile;
  if(!f){ setStatus('No processed file', true); return; }
  const url = URL.createObjectURL(f);
  const a = document.createElement('a');
  a.href = url; a.download = f.name || 'processed.jpg'; document.body.appendChild(a); a.click(); a.remove(); safeRevoke(url);
  setStatus('Download started');
});

/* Batch ZIP download */
downloadZipBtn && downloadZipBtn.addEventListener('click', async ()=>{
  if(!files || files.length === 0){ setStatus('No batch files to process', true); return; }
  setStatus('Processing batch — building ZIP...');
  downloadZipBtn.disabled = true; clearBatchBtn.disabled = true;
  try {
    if(typeof JSZip === 'undefined'){ setStatus('JSZip not available', true); downloadZipBtn.disabled=false; return; }
    const zip = new JSZip();
    for(let i=0;i<files.length;i++){
      const f = files[i];
      setStatus(`Processing ${i+1}/${files.length}: ${f.name}`);
      try {
        const blob = await processFile(f, presetSelect ? presetSelect.value : 'nsdl');
        if(!(blob instanceof Blob)) throw new Error('processFile returned non-blob');
        zip.file(`processed-${f.name}`, blob);
      } catch(e){ logDebug('Batch item failed: '+(e && e.message||e)); }
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url; a.download = `pan-photos-${Date.now()}.zip`; document.body.appendChild(a); a.click(); a.remove(); safeRevoke(url);
    setStatus('ZIP ready — download started');
  } catch(e){ logDebug('Batch ZIP error: '+e); setStatus('Batch processing failed', true); }
  finally { downloadZipBtn.disabled = false; clearBatchBtn.disabled = false; }
});

/* INIT */
(function init(){
  try {
    processBtn && (processBtn.disabled = true);
    downloadBtn && (downloadBtn.disabled = true);
    downloadZipBtn && (downloadZipBtn.disabled = true);
    clearBatchBtn && (clearBatchBtn.disabled = true);
    cropBtn && (cropBtn.disabled = true);
    undoBtn && (undoBtn.disabled = true);
    redoBtn && (redoBtn.disabled = true);
    setStatus('Ready');
    if(beforeCanvas){
      beforeCanvas.style.display = 'block';
      if(!beforeCanvas.width) { beforeCanvas.width = 320; beforeCanvas.height = 240; }
    }
    if(afterCanvas){
      afterCanvas.style.display = 'block';
      if(!afterCanvas.width) { afterCanvas.width = 320; afterCanvas.height = 240; }
    }
  } catch(e){ logDebug('init error: '+e); }
})();
// redeploy_fix 1764353057
