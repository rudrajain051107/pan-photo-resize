/* imageProcessor.js Phase-3 improvements */
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

function drawCoverToCtx(ctx,img,targetW,targetH){
  const srcW = img.width || img.naturalWidth;
  const srcH = img.height || img.naturalHeight;
  const srcRatio = srcW/srcH, tgtRatio = targetW/targetH;
  let sx=0,sy=0,sW=srcW,sH=srcH;
  if(srcRatio>tgtRatio){ sW = srcH * tgtRatio; sx=(srcW-sW)/2; } else { sH=srcW/tgtRatio; sy=(srcH-sH)/2; }
  ctx.clearRect(0,0,targetW,targetH);
  ctx.drawImage(img,sx,sy,sW,sH,0,0,targetW,targetH);
}

async function compressCanvasToBlob(canvas,targetBytes,mime='image/jpeg') {
  let quality=0.92;
  let blob = await new Promise(res=>canvas.toBlob(res,mime,quality));
  let tries=0;
  while(blob && blob.size>targetBytes && tries<12){
    tries++; quality = Math.max(0.08, quality - 0.08);
    blob = await new Promise(res=>canvas.toBlob(res,mime,quality));
  }
  return blob;
}

async function processMainThread(file,targetW,targetH,maxBytes,progressCb){
  const img = await loadImageBitmap(file);
  const canvas = document.createElement('canvas'); canvas.width=targetW; canvas.height=targetH;
  const ctx = canvas.getContext('2d');
  drawCoverToCtx(ctx,img,targetW,targetH);
  const blob = await compressCanvasToBlob(canvas,maxBytes,'image/jpeg');
  return { blob, info:{width:canvas.width,height:canvas.height,size:blob?blob.size:0}, canvas };
}

export async function processFile(file,presetKey='nsdl',custom=null,progressCb=null){
  const preset = (presetKey==='custom' && custom) ? custom : PRESETS[presetKey] || PRESETS.nsdl;
  const targetW = preset.width, targetH = preset.height, maxBytes = preset.maxBytes || (50*1024);

  // try worker
  if(window.Worker){
    try{
      const w = new Worker('assets/js/worker-advanced.js');
      return await new Promise((resolve,reject)=>{
        let handled=false;
        w.onmessage = async (ev)=>{
          const d = ev.data || {};
          if(d.type === 'done'){
		 handled=true;
		 resolve({blob: d.blob, info:{width:targetW,height:targetH,size:d.blob.size}}); w.terminate(); }
          else if(d.type==='progress'){ if(progressCb) progressCb({progress:d.percent}); }
          else if(d.type==='fallback'){ w.terminate(); const r= await processMainThread(file,targetW,targetH,maxBytes,progressCb); resolve(r.blob); }
          else if(d.type==='error'){ w.terminate(); const r= await processMainThread(file,targetW,targetH,maxBytes,progressCb); resolve(r.blob); }
        };
        try{ w.postMessage({cmd:'process', blob: file, targetW: targetW, targetH: targetH, maxBytes}); }catch(e){ w.terminate(); processMainThread(file,targetW,targetH,maxBytes,progressCb).then(resolve).catch(reject); }
      });
	}catch(e){
  	const r = await processMainThread(file,targetW,targetH,maxBytes,progressCb);
  	return r.blob;
	}
	}else {
  	const r = await processMainThread(file,targetW,targetH,maxBytes,progressCb);
  	return r.blob;
	}
}
