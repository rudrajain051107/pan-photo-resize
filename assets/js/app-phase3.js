/* app-phase3.js - FIXED FULL VERSION */

/* IMPORTS */
import Cropper from './cropper.js';
import { validateFile } from './validator.js';
import { processFile } from './imageProcessor.js';
import { cleanImageBlob } from './fixImage.js';

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
    try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Fix Android Chrome decode bug
        const w = img.naturalWidth;
        const h = img.naturalHeight;

        if (!w || !h) {
            console.log("⚠️ decode failed inside drawImageToCanvas");
            throw new Error("naturalWidth missing");
        }

        // Resize canvas safely
        canvas.width = w;
        canvas.height = h;

        // Actually draw
        ctx.drawImage(img, 0, 0, w, h);

        console.log("✔ drawImageToCanvas OK");
    }
    catch (err){
        console.log("❌ drawImage error:", err);
        const debug = document.getElementById("debug-log");
        if(debug){
            debug.innerHTML += "<div>drawImage FAILED - " + err + "</div>";
        }
        throw err;
    }
}

function loadAndPreviewFile(file){
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = ()=>{
        editingImage = img;
        drawImageToCanvas(img, beforeCanvas);
        setStatus("Loaded " + file.name);

        if(cropper){
            cropper.start({
                x:20, y:20,
                w:Math.min(200, beforeCanvas.width-40),
                h:Math.min(200, beforeCanvas.height-40)
            });
        }

        URL.revokeObjectURL(url);
    };

    img.onerror =()=>{
        setStatus("Failed to load image", true);
    };

    img.src = url;
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
