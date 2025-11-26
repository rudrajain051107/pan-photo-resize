// assets/js/worker.js
// Web Worker to perform canvas compression off-main-thread.
// Uses OffscreenCanvas when available, otherwise main thread fallback will be used (worker will attempt to create bitmap).
self.onmessage = async function(e) {
  const { type, file, targetWidth, targetHeight, maxBytes } = e.data || {};
  try {
    if (type === 'process') {
      // create image bitmap from file (File or Blob)
      let bitmap;
      try {
        bitmap = await createImageBitmap(file);
      } catch (err) {
        // Some browsers may not allow createImageBitmap in worker; post error
        self.postMessage({ type: 'error', message: 'createImageBitmap unavailable in worker.' });
        return;
      }
      // OffscreenCanvas path
      let canvas;
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(targetWidth, targetHeight);
        const ctx = canvas.getContext('2d');
        // draw center-cover
        const sx = 0, sy = 0;
        ctx.clearRect(0,0,targetWidth,targetHeight);
        // simple cover: drawImage with scaling
        ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, targetWidth, targetHeight);
        // iterative compression
        let quality = 0.92;
        let blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
        let tries = 0;
        while (blob.size > maxBytes && tries < 12) {
          tries++;
          quality = Math.max(0.08, quality - 0.08);
          blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
          self.postMessage({ type: 'progress', percent: Math.min(99, Math.round((1 - quality) * 100)) });
        }
        self.postMessage({ type: 'done', blob });
      } else {
        // No OffscreenCanvas: fallback - post back so main thread does processing
        self.postMessage({ type: 'fallback', message: 'no_offscreen' });
      }
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
};
