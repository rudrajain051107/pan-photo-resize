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
    const ctx = canvas.getContext('2d');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img, 0, 0);
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

/* FILE INPUT HANDLER — FIXED WITH JPEG REPAIR */
fileInput.addEventListener('change', async e=>{
    const list = Array.from(e.target.files || []);
    if(list.length === 0) return;

    // Filter valid files
    files = list.filter(f => validateFile(f).valid);
    if(files.length === 0){
        setStatus("No valid images in selection", true);
        return;
    }

    downloadZipBtn.disabled = false;
    clearBatchBtn.disabled = false;

    console.log("Attempting JPEG repair...");

    // JPEG repair patch
    try {
        const safeBlob = await cleanImageBlob(files[0]);
        console.log("cleanImageBlob returned:", safeBlob);

        currentFile = new File([safeBlob], files[0].name, { type: "image/jpeg" });
        console.log("Repaired File created:", currentFile);
    } catch(err){
        console.error("JPEG repair failed:", err);
        setStatus("Image corrupted or unsupported", true);
        return;
    }

    console.log("Passing repaired file to preview...");
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
