/* validation-and-resize.js
   Handles file validation, presets, resizing + iterative compression,
   preview, and simple UI helpers.
*/
(function(){
  const ALLOWED = ['image/jpeg','image/jpg','image/png'];
  const MAX_UPLOAD = 5 * 1024 * 1024; // 5 MB
  const PRESETS = {
    nsdl: {w: 276, h: 394, maxKb: 50},
    uti:  {w: 213, h: 213, maxKb: 30}
  };

  function el(id){ return document.getElementById(id); }
  function showError(msg){
    const e = el('error-message');
    if(e){ e.style.display='block'; e.textContent = msg; }
    else alert(msg);
  }
  function clearError(){
    const e = el('error-message');
    if(e){ e.style.display='none'; e.textContent = ''; }
  }
  function showProgress(on){
    const p = el('progress');
    if(p) p.style.display = on ? 'block' : 'none';
  }

  function validateFile(file){
    if(!file) throw new Error('No file selected.');
    if(!ALLOWED.includes(file.type)) throw new Error('Only JPG or PNG are allowed.');
    if(file.size > MAX_UPLOAD) throw new Error('File too large. Max 5MB.');
    return true;
  }

  function loadImage(file){
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = ()=> res(img);
      img.onerror = ()=> rej(new Error('Invalid or corrupted image file.'));
      img.src = URL.createObjectURL(file);
    });
  }

  async function resizeAndCompress(file, targetW, targetH, targetBytes){
    validateFile(file);
    showProgress(true);
    try{
      const img = await loadImage(file);
      const canvas = document.createElement('canvas');
      canvas.width = targetW; canvas.height = targetH;
      const ctx = canvas.getContext('2d');

      // Cover-style crop (center)
      const aspectSrc = img.width / img.height;
      const aspectDst = targetW / targetH;
      let sx=0, sy=0, sw=img.width, sh=img.height;
      if (aspectSrc > aspectDst) {
        sw = img.height * aspectDst;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / aspectDst;
        sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);

      // Compress iteratively
      let quality = 0.92;
      for(let i=0;i<12;i++){
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
        if(blob.size <= targetBytes) { showProgress(false); return blob; }
        quality -= 0.07;
        if(quality < 0.20) break;
      }
      // Final attempt
      const finalBlob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', Math.max(0.18, quality)));
      if(finalBlob.size > targetBytes) throw new Error('Could not reach target size. Try cropping more or a different preset.');
      showProgress(false);
      return finalBlob;
    }catch(e){
      showProgress(false);
      throw e;
    }
  }

  // hook UI when DOM ready
  document.addEventListener('DOMContentLoaded', function(){
    const input = el('upload-input');
    const presetSelect = el('preset-select');
    const previewOrig = el('orig-preview');
    const previewRes = el('res-preview');
    const downloadBtn = el('download-btn');

    if(!input) return;

    input.addEventListener('change', async function(e){
      clearError();
      const file = input.files && input.files[0];
      if(!file) return;
      try{
        validateFile(file);
        previewOrig.src = URL.createObjectURL(file);
      }catch(err){
        showError(err.message);
        return;
      }
      // auto-process current preset
      const key = presetSelect ? presetSelect.value : 'nsdl';
      const preset = PRESETS[key] || PRESETS['nsdl'];
      try{
        showProgress(true);
        const blob = await resizeAndCompress(file, preset.w, preset.h, preset.maxKb * 1024);
        previewRes.src = URL.createObjectURL(blob);
        downloadBtn.href = previewRes.src;
        downloadBtn.download = `${key}-pan.jpg`;
        showProgress(false);
      }catch(err){
        showError(err.message || 'Processing failed.');
      }
    });
  });

  // expose for debugging
  window.PAN_RESIZE = { PRESETS, resizeAndCompress, validateFile };
})();
