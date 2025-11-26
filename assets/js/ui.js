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
