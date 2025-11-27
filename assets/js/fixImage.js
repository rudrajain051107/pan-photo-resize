/* fixImage.js - JPEG auto-repair */

export async function cleanImageBlob(file){
    return new Promise((resolve, reject)=>{
        try {
            const url = URL.createObjectURL(file);
            const img = new Image();

            img.onload = ()=>{
                // re-encode clean JPEG
                const c = document.createElement('canvas');
                c.width = img.naturalWidth;
                c.height = img.naturalHeight;

                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);

                c.toBlob(blob=>{
                    if(blob) resolve(blob);
                    else reject("Failed to re-encode image");
                }, "image/jpeg", 0.95);

                URL.revokeObjectURL(url);
            };

            img.onerror = ()=>{
                reject("Image decode failed – corrupted JPEG");
            };

            img.src = url;
        } catch(e){
            reject(e);
        }
    });
}
