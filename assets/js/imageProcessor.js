/* assets/js/imageProcessor.js - Phase2 updated: tries Worker first, falls back to main-thread */
export const PRESETS = {
  nsdl: { width: 276, height: 394, maxBytes: 50 * 1024 },
  uti: { width: 213, height: 213, maxBytes: 30 * 1024 }
};

export async function loadImageBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch (e) {}
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function drawCover(ctx, img, targetW, targetH){
  const srcW = img.width || img.naturalWidth;
  const srcH = img.height || img.naturalHeight;
  const srcRatio = srcW/srcH;
  const tgtRatio = targetW/targetH;
  let sx=0, sy=0, sW=srcW, sH=srcH;
  if (srcRatio > tgtRatio){
    sW = srcH * tgtRatio; sx = (srcW - sW)/2;
  } else {
    sH = srcW / tgtRatio; sy = (srcH - sH)/2;
  }
  ctx.clearRect(0,0,targetW,targetH);
  ctx.drawImage(img, sx, sy, sW, sH, 0, 0, targetW, targetH);
}

async function compressMainThread(canvas, targetBytes, mime='image/jpeg') {
  let quality = 0.92;
  let blob = await new Promise(res => canvas.toBlob(res, mime, quality));
  let tries = 0;
  while (blob && blob.size > targetBytes && tries < 12) {
    tries++;
    quality -= 0.08;
    if (quality < 0.08) quality = 0.08;
    blob = await new Promise(res => canvas.toBlob(res, mime, quality));
    if (quality <= 0.08) break;
  }
  return blob;
}

/**
 * Attempt to process using worker. If worker reports fallback, perform main thread.
 */
export async function processFile(file, presetKey='nsdl', custom=null, progressCb=null) {
  const preset = (presetKey === 'custom' && custom) ? custom : PRESETS[presetKey] || PRESETS.nsdl;
  const targetW = preset.width, targetH = preset.height, maxBytes = preset.maxBytes || (50*1024);

  // Try using worker if supported
  if (window.Worker) {
    try {
      const worker = new Worker('assets/js/worker.js');
      return await new Promise((resolve, reject) => {
        let aborted = false;
        worker.onmessage = async (ev) => {
          const data = ev.data || {};
          if (data.type === 'progress') {
            if (progressCb) progressCb({ progress: data.percent });
          } else if (data.type === 'done') {
            resolve({ blob: data.blob, info: { width: targetW, height: targetH, size: data.blob.size }});
            worker.terminate();
          } else if (data.type === 'fallback') {
            // worker cannot do offscreen, fallback
            worker.terminate();
            if (!aborted) {
              // run main thread flow below
              const result = await processMainThread(file, targetW, targetH, maxBytes);
              resolve(result);
            }
          } else if (data.type === 'error') {
            worker.terminate();
            // fallback to main thread
            const result = await processMainThread(file, targetW, targetH, maxBytes);
            resolve(result);
          }
        };
        // Post transferable file (Blob) if supported
        try {
          worker.postMessage({ type: 'process', file, targetWidth: targetW, targetHeight: targetH, maxBytes });
        } catch (err) {
          worker.terminate();
          processMainThread(file, targetW, targetH, maxBytes).then(resolve).catch(reject);
        }
      });
    } catch (err) {
      // worker failed; fall back
      return await processMainThread(file, targetW, targetH, maxBytes);
    }
  } else {
    // No worker
    return await processMainThread(file, targetW, targetH, maxBytes);
  }
}

async function processMainThread(file, targetW, targetH, maxBytes) {
  const img = await loadImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = targetW; canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  drawCover(ctx, img, targetW, targetH);
  const blob = await compressMainThread(canvas, maxBytes, 'image/jpeg');
  return { blob, info: { width: canvas.width, height: canvas.height, size: blob ? blob.size : 0 }, canvas };
}
