/* app-phase3.js - Robust Phase-3 orchestrator (preview, controls, processing)
   Replaces previous fragile preview logic with multi-strategy decoder (FileReader / objectURL / ImageBitmap / rebuild)
   Ensures UI controls are wired & enabled.
   Keep imageProcessor.js and other modules as-is; this file expects processFile(file, preset) to return a Promise<Blob>.
*/
import Cropper from './cropper.js';
import { validateFile } from './validator.js';
import { processFile } from './imageProcessor.js';
import { cleanImageBlob } from './fixImage.js'; // optional; if missing, code falls back

/* DOM elements */
const $ = id => document.getElementById(id);
const fileInput = $('file-input');
const dropZone = $('drop-zone');
const processBtn = $('process-btn');
const resetBtn = $('reset-btn');
const downloadZipBtn = $('download-zip');
const clearBatchBtn = $('clear-batch');
const undoBtn = $('undo-btn');
const redoBtn = $('redo-btn');
const cropBtn = $('crop-btn');
const presetSelect = $('preset-select');
const statusEl = $('status');
const downloadBtn = $('downloadBtn');
const beforeCanvas = $('before-canvas');
const afterCanvas = $('after-canvas');
const zoomSlider = document.querySelector('input[type="range"]#zoom') || null;
const debugLogEl = $('debug-log') || null;

/* state */
let files = [];
let currentFile = null;
let editingImage = null; // HTMLImageElement or ImageBitmap
let cropper = null;
let cropMode = false;
let historyStack = [];
let historyIndex = -1;
let latestProcessedFile = null;
const HISTORY_MAX = 20;

/* helpers */
function logDebug(msg){
  try {
    console.log(msg);
    if(debugLogEl){
      const d = document.createElement('div');
      d.textContent = new Date().toLocaleTimeString() + ' — ' + msg;
      debugLogEl.appendChild(d);
      debugLogEl.scrollTop = debugLogEl.scrollHeight;
    }
  } catch(e){}
}
function setStatus(text, isError=false){
  if(!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = isError ? 'crimson' : '';
}
function safeRevoke(url){ try{ URL.revokeObjectURL(url); }catch(e){} }

/* draw helper - supports HTMLImageElement and ImageBitmap */
function drawToCanvas(imgLike, canvas){
  try{
    if(!imgLike || !canvas) return false;
    const ctx = canvas.getContext('2d');
    const w = imgLike.naturalWidth || imgLike.width || imgLike.bitmapWidth || 400;
    const h = imgLike.naturalHeight || imgLike.height || imgLike.bitmapHeight || Math.max(200, Math.round(w*0.75));
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(imgLike, 0, 0, canvas.width, canvas.height);
    return true;
  }catch(e){
    logDebug('drawToCanvas error: ' + (e && e.message ? e.message : e));
    return false;
  }
}

/* History (undo/redo) - store dataURLs */
function pushHistory(){
  try{
    const data = beforeCanvas.toDataURL('image/jpeg', 0.9);
    if(historyIndex < historyStack.length - 1){
      historyStack.splice(historyIndex + 1);
    }
    historyStack.push(data);
    if(historyStack.length > HISTORY_MAX) historyStack.shift();
    historyIndex = historyStack.length - 1;
    updateUndoRedoButtons();
  }catch(e){ logDebug('pushHistory error: ' + e); }
}
function updateUndoRedoButtons(){
  if(undoBtn) undoBtn.disabled = !(historyIndex > 0);
  if(redoBtn) redoBtn.disabled = !(historyIndex < historyStack.length - 1);
}
function undo(){
  if(!(historyIndex > 0)) return;
  historyIndex--;
  const data = historyStack[historyIndex];
  const img = new Image();
  img.onload = ()=> drawToCanvas(img, beforeCanvas);
  img.src = data;
  updateUndoRedoButtons();
}
function redo(){
  if(!(historyIndex < historyStack.length - 1)) return;
  historyIndex++;
  const data = historyStack[historyIndex];
  const img = new Image();
  img.onload = ()=> drawToCanvas(img, beforeCanvas);
  img.src = data;
  updateUndoRedoButtons();
}

/* Multi-strategy image loader (robust) */
async function loadAndPreviewFile(file){
  setStatus('Loading preview...');
  logDebug(`loadAndPreviewFile: ${file?.name || 'unknown'} size=${file?.size||0}`);
  editingImage = null;
  cropMode = false;

  if(!file || file.size === 0){
    setStatus('No file or zero-size', true);
    return;
  }

  // Strategy A: object URL -> Image
  const tryWithObjectURL = (blob) => new Promise((resolve,reject)=>{
    try {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = ()=>{ safeRevoke(url); resolve({type:'img', img}); };
      img.onerror = (e)=>{ safeRevoke(url); reject(new Error('objectURL decode failed')); };
      img.src = url;
    } catch(e){ reject(e); }
  });

  // Strategy B: FileReader -> dataURL -> Image
  const tryWithDataURL = (blob) => new Promise((resolve,reject)=>{
    try {
      const fr = new FileReader();
      fr.onload = ()=> {
        const img = new Image();
        img.onload = ()=> resolve({type:'img', img});
        img.onerror = ()=> reject(new Error('dataURL decode failed'));
        img.src = fr.result;
      };
      fr.onerror = (e)=> reject(e);
      fr.readAsDataURL(blob);
    } catch(e){ reject(e); }
  });

  // Strategy C: createImageBitmap
  const tryWithBitmap = async (blob) => {
    if(typeof createImageBitmap !== 'function') throw new Error('createImageBitmap missing');
    const bmp = await createImageBitmap(blob);
    return {type:'bitmap', bmp};
  };

  // Strategy D: rebuild Blob from ArrayBuffer (force re-encode)
  const rebuildBlob = async (orig) => {
    const ab = await orig.arrayBuffer();
    const arr = new Uint8Array(ab);
    return new Blob([arr], { type: orig.type || 'image/jpeg' });
  };

  // Attempt sequence: objectURL -> dataURL -> bitmap -> rebuild -> retry
  try {
    try {
      const r = await tryWithObjectURL(file);
      if(r.type === 'img' && drawToCanvas(r.img, beforeCanvas)){
        editingImage = r.img;
        pushHistory();
        setStatus(`Loaded ${file.name}`);
        return;
      }
    } catch(e){ logDebug('A failed: ' + e); }

    try {
      const r = await tryWithDataURL(file);
      if(r.type === 'img' && drawToCanvas(r.img, beforeCanvas)){
        editingImage = r.img;
        pushHistory();
        setStatus(`Loaded ${file.name} (dataURL)`);
        return;
      }
    } catch(e){ logDebug('B failed: ' + e); }

    try {
      const r = await tryWithBitmap(file);
      // draw bitmap
      const ctx = beforeCanvas.getContext('2d');
      beforeCanvas.width = r.bmp.width || Math.max(200, r.bmp.width || 200);
      beforeCanvas.height = r.bmp.height || Math.max(200, r.bmp.height || 200);
      ctx.clearRect(0,0,beforeCanvas.width,beforeCanvas.height);
      ctx.drawImage(r.bmp, 0, 0, beforeCanvas.width, beforeCanvas.height);
      try{ r.bmp.close && r.bmp.close(); }catch(e){}
      editingImage = null;
      pushHistory();
      setStatus(`Loaded ${file.name} (bitmap)`);
      return;
    } catch(e){ logDebug('C failed: ' + e); }

    // rebuild and retry A/B/C
    try {
      const rebuilt = await rebuildBlob(file);
      // A rebuilt
      try {
        const r = await tryWithObjectURL(rebuilt);
        if(r.type === 'img' && drawToCanvas(r.img, beforeCanvas)){
          editingImage = r.img; pushHistory(); setStatus(`Loaded ${file.name} (rebuilt)`); return;
        }
      } catch(e){ logDebug('Rebuilt-A failed'); }

      // B rebuilt
      try {
        const r = await tryWithDataURL(rebuilt);
        if(r.type === 'img' && drawToCanvas(r.img, beforeCanvas)){
          editingImage = r.img; pushHistory(); setStatus(`Loaded ${file.name} (rebuilt dataURL)`); return;
        }
      } catch(e){ logDebug('Rebuilt-B failed'); }

      // C rebuilt
      try {
        const r = await tryWithBitmap(rebuilt);
        const ctx = beforeCanvas.getContext('2d');
        beforeCanvas.width = r.bmp.width || 200; beforeCanvas.height = r.bmp.height || 200;
        ctx.drawImage(r.bmp, 0, 0, beforeCanvas.width, beforeCanvas.height);
        try{ r.bmp.close && r.bmp.close(); }catch(e){}
        editingImage = null; pushHistory(); setStatus(`Loaded ${file.name} (rebuilt bitmap)`); return;
      } catch(e){ logDebug('Rebuilt-C failed'); }
    } catch(e){ logDebug('rebuild failed: ' + e); }

    setStatus('Failed to load image', true);
    logDebug('All decoding strategies failed for this file');

  } catch(err){
    console.error('loadAndPreviewFile caught', err);
    setStatus('Failed to load image', true);
    logDebug('loadAndPreviewFile fatal: ' + err);
  }
}

/* File input handler */
if(fileInput){
  fileInput.addEventListener('change', async (e)=>{
    const f = e.target.files?.[0];
    if(!f){ setStatus('No file selected', true); return; }
    // quick validation: 10MB cap (UI/UX request)
    if(f.size > 10 * 1024 * 1024){ setStatus('File too large (max 10MB)', true); return; }
    // optional JPEG repair
    if(f.type === 'image/jpeg'){
      try { setStatus('Attempting JPEG repair...'); const repaired = await cleanImageBlob(f); currentFile = repaired instanceof Blob ? new File([repaired], f.name, {type:'image/jpeg'}) : f; }
      catch(e){ logDebug('JPEG repair failed: ' + e); currentFile = f; }
    } else { currentFile = f; }
    files = [currentFile];
    clearBatchBtn && (clearBatchBtn.disabled = false);
    downloadZipBtn && (downloadZipBtn.disabled = files.length === 0);
    await loadAndPreviewFile(currentFile);
    processBtn && (processBtn.disabled = false);
    cropBtn && (cropBtn.disabled = false);
  });
}

/* Drag+drop */
if(dropZone){
  dropZone.addEventListener('dragover', ev=>{ ev.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', ev=>{ ev.preventDefault(); dropZone.classList.remove('dragover'); });
  dropZone.addEventListener('drop', async ev=>{
    ev.preventDefault(); dropZone.classList.remove('dragover');
    const list = Array.from(ev.dataTransfer?.files || []);
    if(list.length === 0) return;
    // keep only valid types
    files = list.filter(f=> validateFile(f).valid);
    if(files.length === 0){ setStatus('No valid images dropped', true); return; }
    currentFile = files[0]; clearBatchBtn && (clearBatchBtn.disabled = false); downloadZipBtn && (downloadZipBtn.disabled = false);
    await loadAndPreviewFile(currentFile);
    processBtn && (processBtn.disabled = false);
    cropBtn && (cropBtn.disabled = false);
  });
}

/* Crop toggle/apply */
if(cropBtn){
  cropBtn.addEventListener('click', ()=>{
    if(!currentFile && !editingImage){ setStatus('No image to crop', true); return; }
    if(!cropper) cropper = new Cropper(beforeCanvas);
    if(!cropMode){
      // start crop
      try {
        const w = Math.min(Math.round(beforeCanvas.width*0.6), 600);
        const h = Math.min(Math.round(beforeCanvas.height*0.6), 600);
        cropper.start({ x: 10, y: 10, w, h });
      } catch(e){ logDebug('Crop start issue: '+e); }
      cropMode = true; cropBtn.textContent='Apply Crop'; setStatus('Crop mode: adjust and click Apply Crop');
    } else {
      try {
        const r = cropper && cropper.rect;
        if(!r){ setStatus('No crop rect', true); cropMode=false; cropBtn.textContent='Crop'; return; }
        const temp = document.createElement('canvas'); temp.width=r.w; temp.height=r.h;
        const tctx = temp.getContext('2d');
        tctx.drawImage(beforeCanvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        beforeCanvas.width = temp.width; beforeCanvas.height = temp.height;
        const ctx = beforeCanvas.getContext('2d'); ctx.clearRect(0,0,beforeCanvas.width,beforeCanvas.height); ctx.drawImage(temp,0,0);
        editingImage = null; pushHistory(); setStatus('Crop applied');
      } catch(e){ logDebug('Crop apply failed: ' + e); setStatus('Crop failed', true); }
      cropMode=false; cropBtn.textContent='Crop';
    }
  });
}

/* Undo/Redo wiring */
undoBtn && undoBtn.addEventListener('click', ()=>{ undo(); setStatus('Undid'); });
redoBtn && redoBtn.addEventListener('click', ()=>{ redo(); setStatus('Redid'); });

/* Reset/clear */
resetBtn && resetBtn.addEventListener('click', ()=>{
  try{ beforeCanvas.getContext('2d').clearRect(0,0,beforeCanvas.width,beforeCanvas.height); afterCanvas.getContext('2d').clearRect(0,0,afterCanvas.width,afterCanvas.height);}catch(e){}
  files=[]; currentFile=null; editingImage=null; latestProcessedFile=null; historyStack=[]; historyIndex=-1; updateUndoRedoButtons();
  processBtn && (processBtn.disabled=true); downloadBtn && (downloadBtn.disabled=true); downloadZipBtn && (downloadZipBtn.disabled=true); clearBatchBtn && (clearBatchBtn.disabled=true);
  setStatus('Reset complete');
});

/* Clear batch (keep preview) */
clearBatchBtn && clearBatchBtn.addEventListener('click', ()=>{ files=[]; clearBatchBtn.disabled=true; downloadZipBtn.disabled=true; setStatus('Batch cleared'); });

/* Zoom slider: CSS scale */
if(zoomSlider){
  zoomSlider.addEventListener('input', ()=> {
    const v = parseFloat(zoomSlider.value || 50);
    const scale = 0.5 + (v/100) * 1.5;
    beforeCanvas.style.transformOrigin = 'top left';
    beforeCanvas.style.transform = `scale(${scale})`;
  });
}

/* Processing (single) */
processBtn && processBtn.addEventListener('click', async ()=>{
  if(!currentFile){ setStatus('Upload a file first', true); return; }
  setStatus('Processing...');
  processBtn.disabled = true; downloadBtn.disabled = true;
  try {
    const preset = presetSelect ? presetSelect.value : 'nsdl';
    const result = await processFile(currentFile, preset);
    // Accept either Blob or File; prefer Blob
    const blob = (result instanceof Blob) ? result : (result && result.blob instanceof Blob ? result.blob : null);
    if(!blob){ throw new Error('processFile did not return a Blob'); }
    const outName = (currentFile && currentFile.name) ? ('processed-' + currentFile.name) : ('processed.jpg');
    latestProcessedFile = new File([blob], outName, { type: blob.type || 'image/jpeg' });
    window._latestProcessedFile = latestProcessedFile;
    // preview processed blob
    let previewed = false;
    try {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = ()=> { drawToCanvas(img, afterCanvas); safeRevoke(url); previewed=true; setStatus('Done'); };
      img.onerror = async ()=>{
        safeRevoke(url);
        try { if(typeof createImageBitmap === 'function'){ const bmp = await createImageBitmap(blob); drawToCanvas(bmp, afterCanvas); try{bmp.close&&bmp.close()}catch(e){} previewed=true; setStatus('Done'); } }
        catch(e){ setStatus('Processed but preview failed', false); }
      };
      img.src = url;
    } catch(e){ logDebug('Processed preview error: ' + e); setStatus('Processed but preview failed', false); }
    downloadBtn && (downloadBtn.disabled=false);
  } catch(err){
    logDebug('Processing error: ' + err);
    setStatus('Processing error', true);
  } finally {
    processBtn.disabled = false;
  }
});

/* Download single */
downloadBtn && downloadBtn.addEventListener('click', ()=>{
  const file = latestProcessedFile || window._latestProcessedFile;
  if(!file){ setStatus('No processed file to download', true); return; }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href=url; a.download = file.name || 'processed.jpg';
  document.body.appendChild(a); a.click(); a.remove(); safeRevoke(url); setStatus('Download started');
});

/* Download ZIP (batch) */
downloadZipBtn && downloadZipBtn.addEventListener('click', async ()=>{
  if(!files || files.length===0){ setStatus('No batch files to process', true); return; }
  try{
    if(typeof JSZip === 'undefined'){ setStatus('JSZip not available', true); return; }
    setStatus('Processing batch — creating ZIP...');
    downloadZipBtn.disabled = true;
    const zip = new JSZip();
    for(let i=0;i<files.length;i++){
      const f = files[i];
      setStatus(`Processing ${i+1}/${files.length}: ${f.name}`);
      try {
        const blob = await processFile(f, presetSelect ? presetSelect.value : 'nsdl');
        const b = (blob instanceof Blob)? blob : (blob && blob.blob instanceof Blob ? blob.blob : null);
        if(!b) throw new Error('processFile returned non-blob');
        zip.file(`processed-${f.name}`, b);
      } catch(e){ logDebug('Batch item failed: ' + e); }
    }
    const content = await zip.generateAsync({ type:'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pan-photos-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    safeRevoke(url);
    setStatus('ZIP ready — download started');
  }catch(e){ logDebug('Batch error: '+e); setStatus('Batch failed', true); } finally { downloadZipBtn.disabled = false; clearBatchBtn && (clearBatchBtn.disabled = false); }
});

/* initialize UI state */
(function init(){
  processBtn && (processBtn.disabled = true);
  downloadBtn && (downloadBtn.disabled = true);
  downloadZipBtn && (downloadZipBtn.disabled = true);
  clearBatchBtn && (clearBatchBtn.disabled = true);
  cropBtn && (cropBtn.disabled = true);
  undoBtn && (undoBtn.disabled = true);
  redoBtn && (redoBtn.disabled = true);
  setStatus('Ready');
  try {
    if(beforeCanvas) { beforeCanvas.style.display='block'; if(!beforeCanvas.width){ beforeCanvas.width=320; beforeCanvas.height=240; } }
    if(afterCanvas) { afterCanvas.style.display='block'; if(!afterCanvas.width){ afterCanvas.width=320; afterCanvas.height=240; } }
  } catch(e){}
})();
