/* assets/js/imageProcessor.js */
export const PRESETS = {
  nsdl: { width: 276, height: 394, maxBytes: 50 * 1024 },
  uti: { width: 213, height: 213, maxBytes: 30 * 1024 }
};

export async function loadImageBitmap(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file); } catch(e) {}
  }
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=(err)=>reject(err);
    img.src=URL.createObjectURL(file);
  });
}

export function drawCover(ctx,img,targetW,targetH){
  const srcW = img.width || img.naturalWidth;
  const srcH = img.height || img.naturalHeight;
  const srcRatio = srcW/srcH, tgtRatio = targetW/targetH;
  let sx=0,sy=0,sW=srcW,sH=srcH;
  if(srcRatio>tgtRatio){ sW = srcH * tgtRatio; sx=(srcW-sW)/2; } else { sH=srcW/tgtRatio; sy=(srcH-sH)/2; }
  ctx.clearRect(0,0,targetW,targetH);
  ctx.drawImage(img,sx,sy,sW,sH,0,0,targetW,targetH);
}

export async function compressCanvas(canvas,targetBytes,mime='image/jpeg'){
  let quality=0.92;
  let blob = await new Promise(res=>canvas.toBlob(res,mime,quality));
  let tries=0;
  while(blob && blob.size>targetBytes && tries<12){
    tries++; quality-=0.08; if(quality<0.08) quality=0.08;
    blob = await new Promise(res=>canvas.toBlob(res,mime,quality));
    if(quality<=0.08) break;
  }
  return blob;
}

export async function processFile(file,presetKey='nsdl',custom=null,progressCb=null){
  const bitmap = await loadImageBitmap(file);
  const preset = (presetKey==='custom' && custom) ? custom : PRESETS[presetKey] || PRESETS.nsdl;
  const targetW = preset.width; const targetH = preset.height; const maxBytes = preset.maxBytes || (50*1024);
  const canvas = document.createElement('canvas'); canvas.width = targetW; canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  drawCover(ctx,bitmap,targetW,targetH);
  const mime='image/jpeg';
  const blob = await compressCanvas(canvas,maxBytes,mime);
  const info = { width:canvas.width, height:canvas.height, size: blob? blob.size : 0 };
  if(progressCb) progressCb({done:true,info});
  return { blob, info, canvas };
}
