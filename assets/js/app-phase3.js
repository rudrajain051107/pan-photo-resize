/* app-phase3.js - main orchestrator (Phase3) */
import Cropper from './cropper.js';
import { validateFile } from './validator.js';
import { processFile } from './imageProcessor.js';
import { cleanImageBlob } from './fixImage.js';

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

const beforeCanvas = document.getElementById('before-canvas');
const afterCanvas = document.getElementById('after-canvas');

let files = []; // File list for batch
let currentIndex = 0;
let currentFile = null;
let undoStack = [], redoStack = [];
let cropper = null;
let editingImage = null;

function setStatus(txt, isError=false){ statusEl.textContent = txt; statusEl.style.color = isError ? 'crimson':''; }

function resetState(){
  files = []; currentIndex = 0; currentFile = null; undoStack=[]; redoStack=[];
  downloadZipBtn.disabled = true; clearBatchBtn.disabled=true;
  processBtn.disabled = true; undoBtn.disabled=true; redoBtn.disabled=true;
  beforeCanvas.getContext('2d').clearRect(0,0,beforeCanvas.width,beforeCanvas.height);
  afterCanvas.getContext('2d').clearRect(0,0,afterCanvas.width,afterCanvas.height);
  setStatus('Reset complete.');
}

function drawImageToCanvas(img, canvas){
  const ctx = canvas.getContext('2d');
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cw*ratio); canvas.height = Math.floor(ch*ratio);
  ctx.setTransform(ratio,0,0,ratio,0,0);
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const srcRatio = iw/ih, tgtRatio = cw/ch;
  let sx=0, sy=0, sW=iw, sH=ih;
  if(srcRatio > tgtRatio){ sW = ih * tgtRatio; sx=(iw-sW)/2; } else { sH = iw / tgtRatio; sy=(ih-sH)/2; }
  ctx.clearRect(0,0,cw,ch);
  ctx.drawImage(img, sx, sy, sW, sH, 0, 0, cw, ch);
}

function loadAndPreviewFile(file){
  const img = new Image();
  img.onload = ()=>{
    editingImage = img;
    drawImageToCanvas(img, beforeCanvas);
    setStatus(`Loaded ${file.name} (${Math.round(file.size/1024)} KB)`);
    processBtn.disabled = false;
    undoStack=[]; redoStack=[];
    undoBtn.disabled=true; redoBtn.disabled=true;
    // init cropper overlay on beforeCanvas
    if(!cropper) cropper = new Cropper(beforeCanvas);
    cropper.start({x:20,y:20,w:Math.min(200,beforeCanvas.width-40), h: Math.min(200, beforeCanvas.height-40)});
  };
  img.src = URL.createObjectURL(file);
}

fileInput.addEventListener('change', e=>{
  const list = Array.from(e.target.files || []);
  if(list.length === 0) return;
  // filter validateFile
  files = list.filter(f=> validateFile(f).valid);
  if(files.length === 0){ setStatus('No valid images in selection', true); return; }
  downloadZipBtn.disabled = false; clearBatchBtn.disabled = false;

  // load first file preview
// ==== JPEG auto-repair patch =====

console.log("Attempting JPEG repair...");

try {
    const safeBlob = await cleanImageBlob(files[0]);
    currentFile = new File([safeBlob], files[0].name, { type: "image/jpeg" });
    console.log("JPEG repaired successfully");
} catch (err) {
    console.error("JPEG repair failed:", err);
    statusEl.textContent = "Image corrupted or unsupported";
    return;
}

console.log("Passing repaired file to loadAndPreviewFile...");

// =================================
loadAndPreviewFile(currentFile);
});

dropZone.addEventListener('dragover', e=>{ e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', e=>{ dropZone.classList.remove('dragover'); });
dropZone.addEventListener('drop', e=>{ e.preventDefault(); dropZone.classList.remove('dragover'); const f = e.dataTransfer.files; if(f.length) { files = Array.from(f); files = files.filter(f=> validateFile(f).valid); if(files.length){ currentIndex=0; currentFile=files[0]; loadAndPreviewFile(currentFile); downloadZipBtn.disabled=false; clearBatchBtn.disabled=false; } } });

processBtn.addEventListener('click', async ()=>{
  if(!currentFile) return setStatus('Upload a file first', true);
  setStatus('Processing...');
  processBtn.disabled = true;
  try{
    const presetKey = presetSelect.value;
    const result = await processFile(currentFile, presetKey, null, (p)=>{ /* progress */ });
    if(!result.blob){ setStatus('Processing failed', true); processBtn.disabled=false; return; }
    // show after
    const outUrl = URL.createObjectURL(result.blob);
    const outImg = new Image();
    outImg.onload = ()=>{
      drawImageToCanvas(outImg, afterCanvas);
      URL.revokeObjectURL(outUrl);
    };
    outImg.src = outUrl;
    // push to undo stack
    undoStack.push({file:currentFile, blob: result.blob});
    undoBtn.disabled = false;
    // auto-download
    const a=document.createElement('a'); a.href=outUrl; a.download=`pan_resized_${Date.now()}.jpg`; document.body.appendChild(a); a.click(); a.remove();
    setStatus(`Done — ${Math.round(result.info.size/1024)} KB`);
  }catch(err){
    console.error(err); setStatus('Processing error', true);
  }finally{ processBtn.disabled = false; }
});

downloadZipBtn.addEventListener('click', async ()=>{
  if(files.length === 0) return;
  setStatus('Processing batch into ZIP...');
  const zip = new JSZip();
  for(let i=0;i<files.length;i++){
    const f = files[i];
    try {
      const r = await processFile(f, presetSelect.value, null, ()=>{});
      if(r && r.blob) {
        const arr = await r.blob.arrayBuffer();
        zip.file(`pan_resized_${i+1}.jpg`, arr);
      }
    } catch(e){ console.error(e); }
  }
  const content = await zip.generateAsync({type:'blob'});
  const url = URL.createObjectURL(content);
  const a=document.createElement('a'); a.href=url; a.download='batch_pan_resized.zip'; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  setStatus('Batch download ready.');
});

clearBatchBtn.addEventListener('click', ()=> resetState());

undoBtn.addEventListener('click', ()=>{
  if(undoStack.length === 0) return;
  const last = undoStack.pop();
  redoStack.push(last);
  redoBtn.disabled = false;
  if(undoStack.length === 0) undoBtn.disabled = true;
  // for preview, if last.blob exists show it
  if(redoStack.length) {
    const b = redoStack[redoStack.length-1].blob;
    const url = URL.createObjectURL(b);
    const img = new Image(); img.onload = ()=> { drawImageToCanvas(img, afterCanvas); URL.revokeObjectURL(url); }; img.src = url;
  }
});

redoBtn.addEventListener('click', ()=>{
  if(redoStack.length === 0) return;
  const item = redoStack.pop();
  undoStack.push(item);
  undoBtn.disabled = false;
  if(redoStack.length === 0) redoBtn.disabled = true;
  const url = URL.createObjectURL(item.blob);
  const img = new Image(); img.onload = ()=> { drawImageToCanvas(img, afterCanvas); URL.revokeObjectURL(url); }; img.src = url;
});

// crop button opens simple crop UI and then applies crop before processing
cropBtn.addEventListener('click', ()=>{
  if(!cropper || !editingImage) return;
  const box = cropper.getCropBox();
  if(!box) return alert('Crop box not set');
  // Convert canvas cropping params to Blob -> create new File for processing
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = box.w; tempCanvas.height = box.h;
  const tctx = tempCanvas.getContext('2d');
  // Need to map box coords to source image coordinates; we use a simple approximation (center-cover)
  // draw using the full image scaled to beforeCanvas then copy region
  const cw = beforeCanvas.clientWidth, ch = beforeCanvas.clientHeight;
  const iw = editingImage.naturalWidth, ih = editingImage.naturalHeight;
  const srcRatio = iw/ih, tgtRatio = cw/ch;
  let sx=0, sy=0, sW=iw, sH=ih;
  if(srcRatio > tgtRatio){ sW = ih * tgtRatio; sx=(iw-sW)/2; } else { sH = iw / tgtRatio; sy=(ih-sH)/2; }
  // compute scale from source region to canvas region
  const scaleX = sW / cw, scaleY = sH / ch;
  const srcX = Math.round(sx + box.x * scaleX);
  const srcY = Math.round(sy + box.y * scaleY);
  const srcW = Math.round(box.w * scaleX);
  const srcH = Math.round(box.h * scaleY);
  tctx.drawImage(editingImage, srcX, srcY, srcW, srcH, 0,0, box.w, box.h);
  tempCanvas.toBlob(blob=>{
    // replace currentFile with new Blob for processing
    currentFile = new File([blob], 'cropped.jpg', {type:'image/jpeg'});
    loadAndPreviewFile(currentFile);
    setStatus('Crop applied.');
  }, 'image/jpeg', 0.98);
});

// keyboard shortcuts
window.addEventListener('keydown', (e)=>{
  if(e.ctrlKey && e.key === 'z') { undoBtn.click(); }
  if(e.ctrlKey && e.key === 'y') { redoBtn.click(); }
});

window.addEventListener('DOMContentLoaded', ()=>{ /* nothing special */ });
