/* imageProcessor.js
   - Provides processFileMain(options) which returns either:
     - a Blob (legacy), or
     - an object { blob: Blob, width, height, mime } (preferred)
   - Options:
     { file: File|Blob, preset: {w,h,maxBytes} | null, quality: 0.92, cropRect: {x,y,w,h} | null, useWorker: boolean }
   - Exports processFileMain and processFileWorkerAvailable()
*/

async function safeCreateImageBitmap(blob){
  if (window.createImageBitmap) {
    try { return await createImageBitmap(blob); } catch(e){ /* fallback below */ }
  }
  // fallback
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = ()=> resolve(img);
    img.onerror = ()=> reject(new Error('Image decode failed'));
    img.src = URL.createObjectURL(blob);
  });
}

function guessMimeFromFile(file){
  if (!file) return 'image/jpeg';
  if (file.type) return file.type;
  return 'image/jpeg';
}

function autoScaleAndCrop(canvas, targetW, targetH) {
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,targetW,targetH);
  const sw = canvas.width, sh = canvas.height;
  const sr = sw / sh;
  const tr = targetW / targetH;
  let dw, dh, dx, dy;
  if (sr > tr) {
    dh = targetH;
    dw = Math.round(dh * sr);
    dx = Math.round((targetW - dw) / 2);
    dy = 0;
  } else {
    dw = targetW;
    dh = Math.round(dw / sr);
    dx = 0;
    dy = Math.round((targetH - dh) / 2);
  }
  ctx.drawImage(canvas, 0, 0, sw, sh, dx, dy, dw, dh);
  return out;
}

function canvasToBlob(canvas, mime='image/jpeg', quality=0.92){
  return new Promise((resolve, reject)=>{
    if (!canvas.toBlob) {
      try {
        const dataUrl = canvas.toDataURL(mime, quality);
        const bstr = atob(dataUrl.split(',')[1]);
        const n = bstr.length;
        const u8 = new Uint8Array(n);
        for (let i=0;i<n;i++) u8[i] = bstr.charCodeAt(i);
        resolve(new Blob([u8], { type: mime }));
      } catch(e){ reject(e); }
      return;
    }
    canvas.toBlob(b => { if(b) resolve(b); else reject(new Error('toBlob failed')); }, mime, quality);
  });
}

async function processBlobInMainThread(blob, opts){
  const bmp = await safeCreateImageBitmap(blob);
  const tmp = document.createElement('canvas');
  tmp.width = bmp.naturalWidth || bmp.width;
  tmp.height = bmp.naturalHeight || bmp.height;
  const ctx = tmp.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  if (opts.cropRect && typeof opts.cropRect === 'object'){
    const c = document.createElement('canvas');
    c.width = opts.cropRect.w;
    c.height = opts.cropRect.h;
    const cctx = c.getContext('2d');
    cctx.drawImage(tmp, opts.cropRect.x, opts.cropRect.y, opts.cropRect.w, opts.cropRect.h, 0, 0, opts.cropRect.w, opts.cropRect.h);
    tmp.width = c.width; tmp.height = c.height;
    ctx.clearRect(0,0,tmp.width,tmp.height);
    ctx.drawImage(c,0,0);
  }
  let destCanvas = tmp;
  if (opts.preset && opts.preset.w && opts.preset.h){
    destCanvas = autoScaleAndCrop(tmp, opts.preset.w, opts.preset.h);
  }
  const mime = guessMimeFromFile(opts.file);
  let q = (typeof opts.quality === 'number') ? opts.quality : 0.92;
  let blobOut = await canvasToBlob(destCanvas, mime, q);
  if (opts.preset && opts.preset.maxBytes){
    let minQ = 0.2, maxQ = q, best = blobOut;
    for (let i=0;i<8 && blobOut.size > opts.preset.maxBytes; i++){
      maxQ = q; q = (minQ + maxQ)/2;
      blobOut = await canvasToBlob(destCanvas, mime, q);
      if (blobOut.size <= opts.preset.maxBytes) { best = blobOut; break; }
      minQ = minQ + (q - minQ) * 0.2;
    }
    blobOut = best;
  }
  return { blob: blobOut, width: destCanvas.width, height: destCanvas.height, mime };
}

// Worker availability detection (simple)
function processFileWorkerAvailable(){
  return !!window.Worker && !!window.OffscreenCanvas;
}

function processFileViaWorker(opts){
  return new Promise((resolve, reject) => {
    try{
      const worker = new Worker('/assets/js/worker-advanced.js');
      const id = 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
      worker.onmessage = (ev) => {
        const { id: mid, success, result, error } = ev.data || {};
        if (mid !== id) return;
        worker.terminate();
        if (success) {
          if (result && result.blob) {
            resolve(result);
          } else if (result && result.type === 'blob') {
            resolve(result.blob);
          } else {
            resolve(result);
          }
        } else {
          reject(new Error(error || 'Worker processing failed'));
        }
      };
      const fr = new FileReader();
      fr.onload = () => {
        const ab = fr.result;
        try {
          worker.postMessage({ id, opts: Object.assign({}, opts, { fileBuffer: ab }), transfer: true }, [ab]);
        } catch (err) {
          worker.terminate();
          reject(err);
        }
      };
      fr.onerror = (e) => {
        worker.terminate();
        reject(e);
      };
      fr.readAsArrayBuffer(opts.file);
    }catch(e){
      reject(e);
    }
  });
}

async function processFileMain(opts){
  if (!opts || !opts.file) throw new Error('Missing file in processFileMain');
  if (opts.useWorker && processFileWorkerAvailable()) {
    try {
      return await processFileViaWorker(opts);
    } catch(e){
      console.warn('Worker failed, falling back to main thread', e);
      return await processBlobInMainThread(opts.file, opts);
    }
  } else {
    return await processBlobInMainThread(opts.file, opts);
  }
}

export { processFileMain, processFileWorkerAvailable };
