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
