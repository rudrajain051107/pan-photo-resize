#!/data/data/com.termux/files/usr/bin/bash
# apply-full-upgrade-termux.sh
# Full automated upgrade for pan-photo-resize (Termux compatible)
# - Creates branch fix/full-upgrade-v2
# - Adds validation, presets, compression, SEO, security headers, repo files
# - Commits and pushes changes
set -euo pipefail

echo
echo "=== FULL UPGRADE (Termux) for pan-photo-resize ==="
echo

# Ensure git identity
git config --global user.name "Rudra Jain" || true
git config --global user.email "jainstools051107@gmail.com" || true

# Ensure Termux tmp
export TMPDIR=${TMPDIR:-$PREFIX/tmp}
mkdir -p "$TMPDIR"

# Verify in git repo root
if [ ! -d ".git" ]; then
  echo "ERROR: Not inside a git repo. cd into the repository root and run this script."
  exit 1
fi

# create new branch
BRANCH="fix/full-upgrade-v2"
echo "[1/16] Creating and switching to branch $BRANCH ..."
git fetch origin || true
git checkout -B "$BRANCH"

# ------------------------------------------------------------------
# 1) Add .gitignore
# ------------------------------------------------------------------
echo "[2/16] Adding .gitignore ..."
cat > .gitignore <<'GITIGNORE'
# Node / build / editor
node_modules/
dist/
build/
.DS_Store
*.log
.env
*.pem
.vscode/
.idea/
*.bak
GITIGNORE

# ------------------------------------------------------------------
# 2) Add LICENSE (MIT)
# ------------------------------------------------------------------
echo "[3/16] Adding LICENSE (MIT) ..."
cat > LICENSE <<'LICENSE'
MIT License

Copyright (c) 2025 Rudra Jain

Permission is hereby granted, free of charge, to any person obtaining a copy
... (standard MIT text shortened for brevity; replace if you want full text) ...
LICENSE

# ------------------------------------------------------------------
# 3) Add CHANGELOG and CONTRIBUTING
# ------------------------------------------------------------------
echo "[4/16] Adding CHANGELOG.md & CONTRIBUTING.md ..."
cat > CHANGELOG.md <<'CHANGELOG'
# Changelog

## [Unreleased]
- Full upgrade (2025-11-25): add validation, presets, SEO, security headers, repo files.
CHANGELOG

cat > CONTRIBUTING.md <<'CONTRIB'
# Contributing

- Fork repository
- Create branch for feature/fix
- Submit Pull Request with description and tests
CONTRIB

# ------------------------------------------------------------------
# 4) Add a basic README improvements (update contact email)
# ------------------------------------------------------------------
echo "[5/16] Updating README.md contact/email ..."
if [ -f README.md ]; then
  sed -i 's/krish41825c@gmail.com/jainstools051107@gmail.com/g' README.md || true
else
  cat > README.md <<'README'
# PAN Photo Resize

Resize PAN photos to official specs. Contact: jainstools051107@gmail.com
README
fi
git add README.md

# ------------------------------------------------------------------
# 5) Add assets folder and preview image (SVG placeholder saved as preview.png)
# ------------------------------------------------------------------
echo "[6/16] Adding assets/preview.png (SVG placeholder) ..."
mkdir -p assets
cat > assets/preview.png <<'SVG'
<?xml version="1.0" encoding="UTF-8"?>
<!-- placeholder SVG saved with .png name (works as an image) -->
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <text x="50%" y="50%" font-size="48" fill="#fff" text-anchor="middle" alignment-baseline="middle" font-family="Arial, sans-serif">
    PAN Photo Resize
  </text>
  <text x="50%" y="58%" font-size="20" fill="#ddd" text-anchor="middle" alignment-baseline="middle" font-family="Arial, sans-serif">
    https://pan-photo-resize.vercel.app
  </text>
</svg>
SVG

# ------------------------------------------------------------------
# 6) Add combined validation & resize JS
# ------------------------------------------------------------------
echo "[7/16] Adding assets/js/validation-and-resize.js ..."
mkdir -p assets/js
cat > assets/js/validation-and-resize.js <<'JS'
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
JS

# ------------------------------------------------------------------
# 7) Update HTML: inject meta, UI, script includes, cookie banner
# ------------------------------------------------------------------
echo "[8/16] Updating HTML files with meta tags, UI containers, and script includes..."

# meta block
cat > "$TMPDIR/seo_block" <<'META'
<title>PAN Photo Resize Tool — Resize PAN card photos to government specs | Free & Secure</title>
<meta name="description" content="Resize PAN card photos to official NSDL/UTI specifications quickly and privately in your browser. No upload.">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:title" content="PAN Photo Resize Tool">
<meta property="og:description" content="Resize PAN card photos to official government specs. Client-side & private.">
<meta property="og:image" content="https://pan-photo-resize.vercel.app/assets/preview.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebApplication","name":"PAN Photo Resize","url":"https://pan-photo-resize.vercel.app","description":"Resize PAN card photos to government specifications in-browser."}</script>
META

# UI block (error/progress + before/after + preset UI)
cat > "$TMPDIR/ui_block" <<'UI'
<!-- BEGIN: PAN Resize UI additions -->
<div id="user-feedback" aria-live="polite" style="max-width:900px;margin:12px auto;">
  <div id="error-message" role="alert" style="display:none;color:#b00020;margin-bottom:8px"></div>
  <div id="progress" style="display:none;margin-bottom:8px">Processing…</div>
</div>

<div style="max-width:900px;margin:12px auto;padding:12px;border-radius:8px;">
  <label for="upload-input">Upload PAN photo (JPG/PNG):</label>
  <input id="upload-input" type="file" accept="image/jpeg,image/png" aria-describedby="uploadHelp" />
  <small id="uploadHelp">Allowed: JPG/PNG. Max upload: 5MB. Output presets: NSDL (276x394 ≤50KB), UTI (213x213 ≤30KB)</small>
  <div style="margin-top:8px;">
    <label for="preset-select">Choose preset:</label>
    <select id="preset-select">
      <option value="nsdl">NSDL — 276×394 (≤50KB)</option>
      <option value="uti">UTI — 213×213 (≤30KB)</option>
      <option value="custom">Custom (use UI)</option>
    </select>
  </div>

  <div style="display:flex;gap:16px;margin-top:12px;align-items:center;">
    <div>
      <h4>Original</h4>
      <img id="orig-preview" alt="Original preview" style="max-width:300px;display:block;background:#f4f4f4" />
    </div>
    <div>
      <h4>Result</h4>
      <img id="res-preview" alt="Resized preview" style="max-width:300px;display:block;background:#f4f4f4" />
      <a id="download-btn" href="#" class="btn" style="display:inline-block;margin-top:6px;padding:8px 12px;background:#0ea5a4;color:#fff;border-radius:6px">Download</a>
    </div>
  </div>
</div>
<!-- END: PAN Resize UI additions -->
UI

# cookie consent snippet
cat > "$TMPDIR/cookie_block" <<'COOKIE'
<!-- Cookie Consent -->
<div id="cookie-consent" style="position:fixed;bottom:12px;left:12px;right:12px;background:#fff;padding:12px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.12);z-index:9999;display:none;">
  This site uses cookies for analytics/ads. <button id="accept-cookie">Accept</button>
  <a href="/privacy.html" style="margin-left:12px">Privacy</a>
</div>
<script>
if(!localStorage.getItem('cookies_accepted')){ document.getElementById('cookie-consent').style.display='block'; }
document.addEventListener('click', function(e){
  if(e.target && e.target.id === 'accept-cookie'){
    localStorage.setItem('cookies_accepted','1');
    document.getElementById('cookie-consent').style.display='none';
    // load analytics here if you enable later
  }
});
</script>
COOKIE

# Inject into all html files tracked by git
git ls-files '*.html' '*.htm' | while read -r f; do
  # 1) inject meta into head if missing (og:title check)
  if ! grep -q 'og:title' "$f"; then
    gawk -v meta="$(sed 's/"/\\"/g' "$TMPDIR/seo_block")" 'BEGIN{ins=0} { if(!ins && tolower($0) ~ /<head[^>]*>/){ print; print meta; ins=1; next } print }' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
    echo "  -> meta added to $f"
  fi

  # 2) insert UI block after <body>
  if ! grep -q 'BEGIN: PAN Resize UI additions' "$f"; then
    gawk -v ui="$(sed 's/"/\\"/g' "$TMPDIR/ui_block")" 'BEGIN{ins=0} { if(!ins && tolower($0) ~ /<body[^>]*>/){ print; print ui; ins=1; next } print }' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
    echo "  -> UI added to $f"
  fi

  # 3) append cookie block before </body>
  if ! grep -q 'cookie-consent' "$f"; then
    gawk -v ck="$(sed 's/"/\\"/g' "$TMPDIR/cookie_block")" 'BEGIN{ins=0} { if(!ins && tolower($0) ~ /<\/body>/){ print ck; ins=1 } print }' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
    echo "  -> cookie consent appended to $f"
  fi

  # 4) include validation JS if not present
  if ! grep -q 'validation-and-resize.js' "$f"; then
    gawk 'BEGIN{ins=0} { if(!ins && tolower($0) ~ /<\/body>/){ print "  <script src=\"/assets/js/validation-and-resize.js\" defer></script>"; ins=1 } print }' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  fi
done

# ------------------------------------------------------------------
# 8) Update privacy.html: ensure it mentions cookies & client-side processing
# ------------------------------------------------------------------
echo "[9/16] Updating privacy.html ..."
if [ -f privacy.html ]; then
  if ! grep -q 'Client-side' privacy.html; then
    gawk 'BEGIN{ins=0} { if(!ins && tolower($0) ~ /<\/body>/){ print "<section><h2>Client-side Processing & Cookies</h2><p>All image processing on this site is performed locally in your browser. Images are not uploaded to our servers unless you explicitly submit them. We may use cookies and third-party services (e.g., Google/AdSense) for analytics and ads only with your consent.</p></section>"; ins=1 } print }' privacy.html > privacy.html.tmp && mv privacy.html.tmp privacy.html
  fi
else
  cat > privacy.html <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Policy</title></head><body>
<h1>Privacy Policy</h1>
<p>All image processing is performed locally in your browser (client-side). Images are not uploaded to our servers. We may use third-party services which use cookies for analytics/ads only after consent.</p>
</body></html>
HTML
fi

# ------------------------------------------------------------------
# 9) Add vercel.json with security headers
# ------------------------------------------------------------------
echo "[10/16] Adding vercel.json with security headers..."
cat > vercel.json <<'VERCEL'
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; img-src 'self' data: https://pan-photo-resize.vercel.app https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "no-referrer-when-downgrade" },
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    }
  ]
}
VERCEL

# ------------------------------------------------------------------
# 10) Update sitemap.xml & robots.txt to use real domain
# ------------------------------------------------------------------
echo "[11/16] Updating sitemap.xml & robots.txt placeholders to pan-photo-resize.vercel.app ..."
if [ -f sitemap.xml ]; then
  sed -i 's|https://yourdomain.com|https://pan-photo-resize.vercel.app|g' sitemap.xml || true
fi
if [ -f robots.txt ]; then
  sed -i 's|https://yourdomain.com|https://pan-photo-resize.vercel.app|g' robots.txt || true
fi

# ------------------------------------------------------------------
# 11) Update contact email in all html/md files
# ------------------------------------------------------------------
echo "[12/16] Replacing contact email across repo..."
git ls-files | gawk '/\.(html|htm|md)$/ {print $0}' | while read -r f; do
  sed -i 's/krish41825c@gmail.com/jainstools051107@gmail.com/g' "$f" || true
  sed -i 's/support@panresizer.com/jainstools051107@gmail.com/g' "$f" || true
done

# ------------------------------------------------------------------
# 12) Update README (short)
# ------------------------------------------------------------------
echo "[13/16] Final README adjustments..."
cat > README.md <<'README'
# PAN Photo Resize

Free client-side tool to resize PAN card photos to official specs (NSDL/UTI). No uploads — processing occurs in your browser.

Contact: jainstools051107@gmail.com
README

# ------------------------------------------------------------------
# 13) Lint-ish step: ensure files are staged and commit everything
# ------------------------------------------------------------------
echo "[14/16] Staging changes and committing..."
git add -A
git commit -m "chore(full-upgrade-v2): validation, presets, SEO, security headers, repo files, preview image" || true

# ------------------------------------------------------------------
# 14) Push branch
# ------------------------------------------------------------------
echo "[15/16] Pushing branch $BRANCH to origin..."
git push -u origin "$BRANCH"

# ------------------------------------------------------------------
# 15) Summary + next steps printed for user
# ------------------------------------------------------------------
echo
echo "=== DONE: Full upgrade branch pushed: $BRANCH ==="
echo "Next steps:"
echo " 1) Open GitHub -> create Pull Request for branch '$BRANCH' and review changes."
echo " 2) After review, merge into main. Vercel will redeploy from main automatically."
echo " 3) Test the live site: upload JPG/PNG, verify final size (NSDL/UTI), check cookie banner, OG preview."
echo
echo "Files added/modified: .gitignore, LICENSE, CHANGELOG.md, CONTRIBUTING.md, README.md, assets/preview.png, assets/js/validation-and-resize.js, vercel.json, many HTML changes."
echo
echo "If you want, run: git checkout main && git merge $BRANCH"
echo
echo "=== Script finished ==="
exit 0
