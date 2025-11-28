/* worker-advanced.js - simple worker
   Receives: { id, opts: { fileBuffer, otherFields... } }
   Posts: { id, success: true, result: { blob: Blob } } or { id, success:false, error: "..." }
*/
self.onmessage = async (e) => {
  const { id, opts } = e.data || {};
  try {
    const fileBuffer = opts && opts.fileBuffer;
    const blob = new Blob([fileBuffer], { type: opts.fileType || 'image/jpeg' });
    if (self.OffscreenCanvas && typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        // Simple passthrough: perform crop/preset if opts provided (basic)
        let outCanvas = canvas;
        if (opts && opts.preset && opts.preset.w && opts.preset.h) {
          const target = new OffscreenCanvas(opts.preset.w, opts.preset.h);
          const tctx = target.getContext('2d');
          tctx.fillStyle = '#fff';
          tctx.fillRect(0,0,opts.preset.w, opts.preset.h);
          tctx.drawImage(canvas, 0, 0, opts.preset.w, opts.preset.h);
          outCanvas = target;
        }
        const q = (opts && opts.quality) ? opts.quality : 0.92;
        const outBlob = await outCanvas.convertToBlob({ type: opts.preset && opts.preset.mime || 'image/jpeg', quality: q });
        // Transfer blob not possible; postMessage with transferable is not used for blob typically
        self.postMessage({ id, success: true, result: { blob: outBlob } });
      } catch (err) {
        self.postMessage({ id, success: false, error: String(err) });
      }
    } else {
      // No OffscreenCanvas or missing API - return raw blob for main thread to process
      self.postMessage({ id, success: true, result: { blob } });
    }
  } catch (err) {
    self.postMessage({ id, success: false, error: String(err) });
  }
};
