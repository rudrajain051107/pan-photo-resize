/* app-phase3.js - FIXED FULL VERSION */

/* IMPORTS */
import Cropper from './cropper.js';
import { validateFile } from './validator.js';
import { processFile } from './imageProcessor.js';
import { cleanImageBlob } from './fixImage.js';

/* HARDCORE DEBUG LOGGER */
function deepDebugImage(url){
    return new Promise(res=>{
        try {
            const img = new Image();
            img.crossOrigin = "anonymous";

            img.onload = ()=>{ 
                console.log("HARDCORE: onload OK -", img.naturalWidth, img.naturalHeight);
                res({ok:true});
            };

            img.onerror = (e)=>{
                console.log("HARDCORE: onerror triggered", e);
                console.log("HARDCORE: URL =", url);

                // Try decoding via fetch + blob + bitmap
                fetch(url).then(r=>r.blob()).then(b=>{
                    console.log("HARDCORE: Blob fetched:", b.type, b.size);

                    return createImageBitmap(b);
                }).then(bmp=>{
                    console.log("HARDCORE: createImageBitmap SUCCESS: ", bmp.width, bmp.height);
                    res({ok:true});
                }).catch(err=>{
                    console.log("HARDCORE: createImageBitmap FAILED:", err);
                    res({ok:false,err});
                });
            };

            img.src = url;
        } catch(err){
            console.log("HARDCORE: Unexpected exception:", err);
            res({ok:false, err});
        }
    });
}

/* ELEMENTS */
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const processBtn = document.getElementById('process-btn');
const resetBtn = document.getElementById('reset-btn');
const downloadZipBtn = document.getElementById('download-zip');
const clearBatchBtn = document.getElementById('clear-batch');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const cropBtn = document.getElementById('crop-btn');
const presetSelect = document.getElementById('preset-select');
const statusEl = document.getElementById('status');

const beforeCanvas = document.getElementById('before-canvas');
const afterCanvas = document.getElementById('after-canvas');

/* STATE */
let files = [];
let currentIndex = 0;
let currentFile = null;
let cropper = null;
let editingImage = null;

/* HELPERS */
function setStatus(txt, err=false){
    statusEl.textContent = txt;
    statusEl.style.color = err ? "crimson" : "";
}

function drawImageToCanvas(img, canvas){
    const ctx = canvas.getContext('2d');

    // FIX: Ensure canvas has real size (Android bug)
    const w = img.naturalWidth || 10;
    const h = img.naturalHeight || 10;

    canvas.width = w;
    canvas.height = h;

    console.log(`Drawing image at ${w}x${h}`);

    try {
        ctx.drawImage(img, 0, 0, w, h);
    } catch(err){
        console.error("drawImage failed", err);
    }
}

// Robust loader: try multiple decode strategies until one works
async function loadAndPreviewFile(file){
  const debug = msg => {
    const el = document.getElementById('debug-log');
    if(el) el.appendChild(Object.assign(document.createElement('div'), { textContent: (new Date()).toLocaleTimeString() + ' - ' + msg }));
    console.log(msg);
  };

  setStatus('Loading preview...');
  debug('loadAndPreviewFile: start');

  // helper: draw Image or ImageBitmap into canvas safely
  const drawToCanvas = (imgLike, canvas) => {
    try {
      const ctx = canvas.getContext('2d');
      const w = (imgLike.naturalWidth || imgLike.width || canvas.width || 200);
      const h = (imgLike.naturalHeight || imgLike.height || Math.max(200, Math.round(w * 0.75)));

      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0,0,w,h);
      ctx.drawImage(imgLike, 0, 0, w, h);
      debug(`drawToCanvas OK ${w}x${h}`);
      return true;
    } catch (err) {
      debug('drawToCanvas failed: ' + err);
      console.error(err);
      return false;
    }
  };



// Strategy A: normal Image using blob URL (ANDROID SAFE)
const tryWithImageURL = (blob) => new Promise((resolve, reject) => {
    try {
        const url = URL.createObjectURL(blob);
        const img = new Image();

        img.crossOrigin = "anonymous";

        img.onload = () => {
            console.log("Strategy A: Image() loaded:", img.naturalWidth, img.naturalHeight);
            resolve(img);
        };

        img.onerror = async () => {
            console.warn("Strategy A failed — trying forced decode...");

            try {
                const fixed = await forceDecode(blob);
                console.log("Force decode successful:", fixed);
                resolve(fixed);
            } catch (err) {
                reject("Strategy A + force decode failed: " + err);
            }
        };

        img.src = url;
    } catch (err) {
        reject(err);
    }
});

// HARDCORE fallback: draw via createImageBitmap → Image → canvas
async function forceDecode(blob){
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const fixedBlob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.95));
    return await createImageBitmap(fixedBlob);
}

  // Strategy B: FileReader -> dataURL
  const tryWithDataURL = (blob) => new Promise((resolve, reject) => {
    try {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          debug('Strategy B: dataURL loaded');
          resolve({ type: 'image', img });
        };
        img.onerror = () => {
          debug('Strategy B: dataURL image error');
          reject(new Error('dataURL decode failed'));
        };
        img.src = fr.result;
      };
      fr.onerror = (e) => { debug('Strategy B: FileReader error'); reject(e); };
      fr.readAsDataURL(blob);
    } catch (e) { reject(e); }
  });

  // Strategy C: createImageBitmap
  const tryWithImageBitmap = async (blob) => {
    try {
      if (!('createImageBitmap' in window)) throw new Error('createImageBitmap not available');
      const bmp = await createImageBitmap(blob);
      debug('Strategy C: createImageBitmap OK');
      return { type: 'bitmap', bmp };
    } catch (e) {
      debug('Strategy C: createImageBitmap failed: ' + e);
      throw e;
    }
  };

  // Strategy D: Fetch + rebuild Blob (force rebuild from bytes)
  const rebuildBlobFromArrayBuffer = async (origFile) => {
    try {
      const arrayBuffer = await origFile.arrayBuffer();
      const ba = new Uint8Array(arrayBuffer);
      const rebuilt = new Blob([ba], { type: origFile.type || 'application/octet-stream' });
      debug('Strategy D: rebuilt Blob from ArrayBuffer');
      return rebuilt;
    } catch (e) {
      debug('Strategy D: rebuild failed: ' + e);
      throw e;
    }
  };

  // Try sequence: A -> B -> C -> rebuild -> A/B/C
  try {
    // quick guard
    if(!file || file.size === 0) {
      setStatus('No file or zero-size', true);
      debug('Early exit: zero-size file');
      return;
    }

    debug(`File: ${file.name} | ${file.type} | ${Math.round(file.size/1024)} KB`);

    // 1: Strategy A
    try {
      const r = await tryWithImageURL(file);
      if (drawToCanvas(r.img, beforeCanvas)) {
        editingImage = r.img;
        setStatus(`Loaded ${file.name}`);
        return;
      }
    } catch (e) {
      debug('Strategy A failed, will fallback');
    }

    // 2: Strategy B (FileReader)
    try {
      const r = await tryWithDataURL(file);
      if (drawToCanvas(r.img, beforeCanvas)) {
        editingImage = r.img;
        setStatus(`Loaded ${file.name} (dataURL)`);
        return;
      }
    } catch (e) {
      debug('Strategy B failed, will fallback');
    }

    // 3: Strategy C (ImageBitmap)
    try {
      const r = await tryWithImageBitmap(file);
      // draw ImageBitmap
      const ctx = beforeCanvas.getContext('2d');
      beforeCanvas.width = r.bmp.width || Math.max(200, r.bmp.width);
      beforeCanvas.height = r.bmp.height || Math.max(200, r.bmp.height || 200);
      ctx.drawImage(r.bmp, 0, 0, beforeCanvas.width, beforeCanvas.height);
      debug('Drew ImageBitmap to canvas');
      editingImage = null; // bitmap used
      setStatus(`Loaded ${file.name} (bitmap)`);
      return;
    } catch (e) {
      debug('Strategy C failed, will attempt rebuild');
    }

    // 4: Rebuild blob from arrayBuffer then retry A/B/C
    try {
      const rebuilt = await rebuildBlobFromArrayBuffer(file);

      // try A on rebuilt
      try {
        const r = await tryWithImageURL(rebuilt);
        if (drawToCanvas(r.img, beforeCanvas)) {
          editingImage = r.img;
          setStatus(`Loaded ${file.name} (rebuilt)`);
          return;
        }
      } catch (e) { debug('Rebuilt A failed'); }

      // try B on rebuilt
      try {
        const r = await tryWithDataURL(rebuilt);
        if (drawToCanvas(r.img, beforeCanvas)) {
          editingImage = r.img;
          setStatus(`Loaded ${file.name} (rebuilt dataURL)`);
          return;
        }
      } catch (e) { debug('Rebuilt B failed'); }

      // try C on rebuilt
      try {
        const r = await tryWithImageBitmap(rebuilt);
        const ctx = beforeCanvas.getContext('2d');
        beforeCanvas.width = r.bmp.width || 200;
        beforeCanvas.height = r.bmp.height || 200;
        ctx.drawImage(r.bmp, 0, 0, beforeCanvas.width, beforeCanvas.height);
        debug('Drew rebuilt ImageBitmap to canvas');
        editingImage = null;
        setStatus(`Loaded ${file.name} (rebuilt bitmap)`);
        return;
      } catch (e) { debug('Rebuilt C failed'); }

    } catch (e) {
      debug('Rebuild failed: ' + e);
    }

    // If all attempts fail:
    setStatus('Failed to load image', true);
    debug('ALL decoding strategies failed');
  } catch (err) {
    console.error('loadAndPreviewFile caught', err);
    setStatus('Failed to load image', true);
    debug('loadAndPreviewFile fatal: ' + err);
  }
}

/* ============================================================
   FILE INPUT HANDLER — Android Safe + JPEG Repair
   ============================================================ */

fileInput.addEventListener('change', async (e)=>{
    console.log("🔥 file-input triggered");

    const f = e.target.files?.[0];

    if(!f){
        console.log("❌ No file selected");
        setStatus("No file selected", true);
        return;
    }

    // BLOCK ANDROID'S 0-BYTE BUG
    if(f.size < 100){
        console.log("❌ File too small — corrupted event");
        setStatus("Corrupted input — select again", true);
        return;
    }

    console.log(`🔥 REAL FILE DETECTED: ${f.name} | ${f.type} | ${f.size} bytes`);

    // SAFELY DUPLICATE FILE (fix webkit blob issue)
    let safeFile = f;
    try {
        safeFile = new File([f], f.name, {type: f.type});
        console.log("✔ Safe clone done");
    } catch(err){
        console.log("❌ Clone failed", err);
    }

    let finalFile = safeFile;

    // ONLY FOR JPEG - attempt repair
    if(f.type === "image/jpeg"){
        try {
            setStatus("Repairing JPEG...");
            const repairedBlob = await cleanImageBlob(f);
            finalFile = new File([repairedBlob], f.name, {type: "image/jpeg"});
            console.log("✔ JPEG repair OK");
        } catch(err){
            console.log("❌ JPEG repair failed", err);
        }
    }

    currentFile = finalFile;
    console.log("➡️ Passing file to preview...");
    loadAndPreviewFile(currentFile);
});


/* DRAG + DROP */
dropZone.addEventListener('dragover', e=>{
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', e=>{
    e.preventDefault();
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', async e=>{
    e.preventDefault();
    dropZone.classList.remove('dragover');

    const list = Array.from(e.dataTransfer.files || []);
    if(list.length === 0) return;

    files = list.filter(f => validateFile(f).valid);
    if(files.length === 0){
        setStatus("No valid images dropped", true);
        return;
    }

    console.log("Attempting JPEG repair (drop)...");

    try {
        const safeBlob = await cleanImageBlob(files[0]);
        currentFile = new File([safeBlob], files[0].name, { type: "image/jpeg" });
    } catch(err){
        console.error("JPEG repair failed:", err);
        setStatus("Image corrupted or unsupported", true);
        return;
    }

    loadAndPreviewFile(currentFile);
});

/* PROCESS BUTTON */
processBtn.addEventListener('click', async ()=>{
    if(!currentFile) return setStatus("Upload a file first", true);

    setStatus("Processing...");
    processBtn.disabled = true;

    try {
        const preset = presetSelect.value;
        const resultBlob = await processFile(currentFile, preset);

        const resultURL = URL.createObjectURL(resultBlob);
        const img = new Image();

        img.onload = ()=>{
            drawImageToCanvas(img, afterCanvas);
            setStatus("Done");
            URL.revokeObjectURL(resultURL);
        };

        img.src = resultURL;
    } 
    catch(err){
        console.error(err);
        setStatus("Processing error", true);
    }

    processBtn.disabled = false;
});

/* RESET BUTTON */
resetBtn.addEventListener('click', ()=>{
    beforeCanvas.getContext('2d').clearRect(0,0,beforeCanvas.width,beforeCanvas.height);
    afterCanvas.getContext('2d').clearRect(0,0,afterCanvas.width,afterCanvas.height);
    setStatus("Reset complete");
});

/* INITIAL STATUS */
setStatus("Ready");
