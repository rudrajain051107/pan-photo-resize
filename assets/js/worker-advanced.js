/* worker-advanced.js - improved worker with OffscreenCanvas detection */
self.onmessage = async (ev) => {
  try{
    const data = ev.data || {};
    if(data.cmd === 'process'){
      const {blob, targetW, targetH, maxBytes} = data;
      // try OffscreenCanvas
      if(typeof OffscreenCanvas !== 'undefined'){
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(targetW, targetH);
        const ctx = canvas.getContext('2d');
        // draw cover
        const sw = bitmap.width, sh = bitmap.height;
        const srcRatio = sw/sh, tgtRatio = targetW/targetH;
        let sx=0, sy=0, sW=sw, sH=sh;
        if(srcRatio > tgtRatio){ sW = sh * tgtRatio; sx = (sw - sW)/2; } else { sH = sw / tgtRatio; sy = (sh - sH)/2; }
        ctx.drawImage(bitmap, sx, sy, sW, sH, 0, 0, targetW, targetH);
        // compress iterative
        let quality = 0.92;
        let blobOut = await canvas.convertToBlob({type:'image/jpeg', quality});
        let tries = 0;
        while(blobOut.size > maxBytes && tries < 12){
          tries++; quality = Math.max(0.08, quality - 0.08);
          blobOut = await canvas.convertToBlob({type:'image/jpeg', quality});
          self.postMessage({type:'progress', percent: Math.min(99, Math.round((1-quality)*100))});
        }
        self.postMessage({type:'done', blob: blobOut}, [blobOut]);
        return;
      } else {
        // fallback: return 'fallback' – main thread will handle
        self.postMessage({type:'fallback'});
      }
    }
  }catch(err){
    self.postMessage({type:'error', message: err.message || String(err)});
  }
};
