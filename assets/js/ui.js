/* assets/js/ui.js */
import { validateFile } from './validator.js';
import { processFile } from './imageProcessor.js';

const fileInput=document.getElementById('file-input');
const dropZone=document.getElementById('drop-zone');
const presetSelect=document.getElementById('preset-select');
const customControls=document.getElementById('custom-controls');
const processBtn=document.getElementById('process-btn');
const resetBtn=document.getElementById('reset-btn');
const statusEl=document.getElementById('status');
const beforeCanvas=document.getElementById('before-canvas');
const afterCanvas=document.getElementById('after-canvas');
const zoomSlider=document.getElementById('zoom-slider');
const rotateLeftBtn=document.getElementById('rotate-left');
const rotateRightBtn=document.getElementById('rotate-right');
const flipHBtn=document.getElementById('flip-horizontal');
const flipVBtn=document.getElementById('flip-vertical');

let currentFile=null, currentImage=null, rotation=0, flipH=false, flipV=false, zoom=1;

function setStatus(msg,isError=false){ statusEl.textContent=msg; statusEl.style.color=isError?'crimson':''; }

function applyTransformsToPreview(){
  if(!currentImage) return;
  const ctx=beforeCanvas.getContext('2d'); const ratio=window.devicePixelRatio||1;
  const cw=beforeCanvas.clientWidth, ch=beforeCanvas.clientHeight;
  beforeCanvas.width=Math.floor(cw*ratio); beforeCanvas.height=Math.floor(ch*ratio);
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.clearRect(0,0,cw,ch);
  ctx.save(); ctx.translate(cw/2,ch/2);
  const rad=rotation*Math.PI/180; ctx.rotate(rad);
  ctx.scale(flipH? -zoom:zoom, flipV? -zoom:zoom);
  const iw=currentImage.width||currentImage.naturalWidth, ih=currentImage.height||currentImage.naturalHeight;
  const scale=Math.min(cw/iw, ch/ih);
  const drawW=iw*scale/zoom, drawH=ih*scale/zoom;
  ctx.drawImage(currentImage, -drawW/2, -drawH/2, drawW, drawH);
  ctx.restore();
}

async function handleFileChosen(file){
  setStatus('Validating file...');
  const res=validateFile(file);
  if(!res.valid){ setStatus(res.errors.join(' '), true); processBtn.disabled=true; return; }
  currentFile=file;
  const img=new Image();
  img.onload=()=>{ currentImage=img; rotation=0; flipH=false; flipV=false; zoom=1; applyTransformsToPreview(); setStatus(`Loaded ${file.name} — ${(file.size/1024).toFixed(0)} KB`); processBtn.disabled=false; };
  img.onerror=()=> setStatus('Failed to load image.', true);
  img.src = URL.createObjectURL(file);
}

function handleDropEvent(e){ e.preventDefault(); dropZone.classList.remove('dragover'); const file = e.dataTransfer ? e.dataTransfer.files[0] : (e.target.files? e.target.files[0] : null); if(file) handleFileChosen(file); }
function preventDefaults(e){ e.preventDefault(); e.stopPropagation(); }

function wireUI(){
  ['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, (e)=>{ preventDefaults(e); dropZone.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, (e)=>{ preventDefaults(e); dropZone.classList.remove('dragover'); }));
  dropZone.addEventListener('drop', handleDropEvent);
  fileInput.addEventListener('change', (e)=> handleFileChosen(e.target.files[0]));
  presetSelect.addEventListener('change', (e)=>{ customControls.hidden = e.target.value !== 'custom'; });
  rotateLeftBtn.addEventListener('click', ()=>{ rotation = (rotation - 90) % 360; applyTransformsToPreview(); });
  rotateRightBtn.addEventListener('click', ()=>{ rotation = (rotation + 90) % 360; applyTransformsToPreview(); });
  flipHBtn.addEventListener('click', ()=>{ flipH = !flipH; applyTransformsToPreview(); });
  flipVBtn.addEventListener('click', ()=>{ flipV = !flipV; applyTransformsToPreview(); });
  zoomSlider.addEventListener('input', (e)=>{ zoom = parseFloat(e.target.value); applyTransformsToPreview(); });

  processBtn.addEventListener('click', async ()=>{
    if(!currentFile) return setStatus('Please upload an image first.', true);
    setStatus('Processing...'); processBtn.disabled=true;
    try {
      const presetKey = presetSelect.value;
      let custom=null;
      if(presetKey==='custom'){
        const w=parseInt(document.getElementById('custom-width').value,10);
        const h=parseInt(document.getElementById('custom-height').value,10);
        if(!w||!h){ setStatus('Enter valid custom width & height', true); processBtn.disabled=false; return; }
        custom={ width:w, height:h, maxBytes:200*1024 };
      }
      const result = await processFile(currentFile, presetKey, custom, (progress)=>{ /* progress callback */ });
      if(!result.blob){ setStatus('Processing failed (no output).', true); processBtn.disabled=false; return; }
      setStatus(`Processed — ${Math.round(result.info.size/1024)} KB`);
      const url = URL.createObjectURL(result.blob);
      const img = new Image();
      img.onload = ()=>{
        const ctx = afterCanvas.getContext('2d'); const cw = afterCanvas.clientWidth; const ch = afterCanvas.clientHeight;
        const ratio = window.devicePixelRatio || 1; afterCanvas.width = Math.floor(cw*ratio); afterCanvas.height = Math.floor(ch*ratio);
        ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,cw,ch);
        const iw = img.naturalWidth, ih = img.naturalHeight; const scale = Math.min(cw/iw, ch/ih);
        ctx.drawImage(img, 0,0,iw,ih, (cw-iw*scale)/2, (ch-ih*scale)/2, iw*scale, ih*scale); URL.revokeObjectURL(url);
      };
      img.src = url;
      const a = document.createElement('a'); a.href = url; a.download = `pan_resized_${Date.now()}.jpg`; document.body.appendChild(a); a.click(); a.remove();
    } catch(err){ console.error(err); setStatus('Processing error. See console for details.', true); } finally { processBtn.disabled=false; }
  });

  resetBtn.addEventListener('click', ()=>{
    currentFile=null; currentImage=null; processBtn.disabled=true;
    const ctx1=beforeCanvas.getContext('2d'); ctx1.clearRect(0,0,beforeCanvas.width,beforeCanvas.height);
    const ctx2=afterCanvas.getContext('2d'); ctx2.clearRect(0,0,afterCanvas.width,afterCanvas.height);
    setStatus('Reset complete.');
  });

  dropZone.addEventListener('keydown', (e) => { if(e.key==='Enter' || e.key===' ') { fileInput.click(); e.preventDefault(); }});
}

export default function init(){ wireUI(); }
