#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

echo
echo "=== APPLY-UPGRADES (Termux patched) ==="
echo

# Ensure git identity exists
git config --global user.name "Rudra Jain"
git config --global user.email "jainstools051107@gmail.com"

# Use Termux temp directory
export TMPDIR=$PREFIX/tmp
mkdir -p $TMPDIR

echo "[1] Creating backup branch..."
git fetch origin || true
git checkout -B backup-before-high-priority-upgrades
git push -u origin backup-before-high-priority-upgrades || true

echo "[2] Creating working branch..."
git checkout -B fix/high-priority-upgrades

############################################
# STEP 3 — Update contact email
############################################
echo "[3] Updating contact email..."
git ls-files | gawk '/\.(html|htm|md)$/ {print $0}' | while read -r f; do
  sed -i 's/krish41825c@gmail.com/jainstools051107@gmail.com/g' "$f"
done

git add -A
git commit -m "fix: update contact email to jainstools051107@gmail.com"

############################################
# STEP 4 — Add SEO META
############################################
echo "[4] Adding SEO meta tags..."

cat > "$TMPDIR/seo_meta_block" <<'META'
<title>PAN Photo Resize Tool — Resize PAN card photo to government specs | Free & Secure</title>
<meta name="description" content="Instantly resize PAN card photos to official dimensions and size (JPG, 50KB). 100% client-side, private, no uploads.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="PAN Photo Resize Tool — Free & Secure">
<meta property="og:description" content="Resize PAN card photos to government specs quickly. Works offline — no upload.">
<meta property="og:image" content="https://yourdomain.com/assets/preview.png">
<meta name="twitter:card" content="summary_large_image">
META

git ls-files '*.html' '*.htm' | while read -r f; do
  if ! grep -q 'og:title' "$f"; then
    gawk -v meta="$(sed 's/"/\\"/g' "$TMPDIR/seo_meta_block")" '
      BEGIN{added=0}
      {
        if(!added && tolower($0) ~ /<head[^>]*>/){
          print; print meta; added=1; next
        }
        print
      }' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  fi
done

git add -A
git commit -m "feat(seo): add SEO meta + OG tags"

############################################
# STEP 5 — UI error/progress container
############################################
echo "[5] Adding error/progress UI..."

cat > "$TMPDIR/ui_block" <<'UI'
<!-- Accessible error/progress -->
<div id="user-feedback" style="padding:8px 12px;max-width:700px;margin:0 auto;">
  <div id="error-message" role="alert" aria-live="polite" style="display:none;color:red;margin-bottom:8px"></div>
  <div id="progress" aria-hidden="true" style="display:none;margin-bottom:8px">Processing…</div>
</div>
UI

git ls-files '*.html' '*.htm' | while read -r f; do
  gawk -v ui="$(sed 's/"/\\"/g' "$TMPDIR/ui_block")" '
    BEGIN{inserted=0}
    {
      if(!inserted && tolower($0) ~ /<body[^>]*>/){
        print; print ui; inserted=1; next
      }
      print
    }' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done

git add -A
git commit -m "fix(ui): add accessible error/progress container"

############################################
# STEP 6 — Create validation.js
############################################
echo "[6] Creating validation.js..."
mkdir -p assets/js
cat > assets/js/validation.js <<'JS'
(function(){
  const MAX_SIZE = 5 * 1024 * 1024;
  const ALLOWED = ["image/jpeg","image/jpg","image/png"];

  function showError(msg){
    const e = document.getElementById("error-message");
    if(e){ e.style.display="block"; e.textContent=msg; }
  }
  function clearError(){
    const e = document.getElementById("error-message");
    if(e){ e.style.display="none"; e.textContent=""; }
  }
  function showProgress(on){
    const p = document.getElementById("progress");
    if(p){ p.style.display = on ? "block" : "none"; }
  }

  window.PanResizeHelpers = { MAX_SIZE, ALLOWED, showError, clearError, showProgress };

  document.addEventListener("change", function(e){
    const input = e.target;
    if(input && input.type === "file"){
      clearError();
      const f = input.files[0];
      if(!f) return;
      if(!ALLOWED.includes(f.type)){ showError("Upload JPG or PNG only."); input.value=""; }
      if(f.size > MAX_SIZE){ showError("File too large. Max 5MB."); input.value=""; }
    }
  });
})();
JS

git add -A
git commit -m "feat(upload): add validation.js"

############################################
# STEP 7 — Include validation.js in HTML
############################################
echo "[7] Inserting validation.js include..."
git ls-files '*.html' '*.htm' | while read -r f; do
  if ! grep -q "validation.js" "$f"; then
    gawk '
      BEGIN{done=0}
      {
        if(!done && tolower($0) ~ /<\/body>/){
          print "  <script src=\"/assets/js/validation.js\" defer></script>"
          done=1
        }
        print
      }' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  fi
done

git add -A
git commit -m "chore(script): include validation.js"

############################################
# STEP 8 — Privacy policy update
############################################
echo "[8] Updating privacy policy..."
if [ ! -f privacy.html ]; then
  cat > privacy.html <<'HTML'
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body>
<h1>Privacy Policy</h1>
<p>This tool processes images locally in your browser. No files are uploaded. Third-party ads (Google/AdSense) may use cookies.</p>
</body></html>
HTML
else
  gawk '
    BEGIN{added=0}
    {
      if(!added && tolower($0) ~ /<\/body>/){
        print "<section><h2>Cookies & Client-Side</h2><p>All processing is local in your browser. Ads may use cookies.</p></section>"
        added=1
      }
      print
    }' privacy.html > privacy.html.tmp && mv privacy.html.tmp privacy.html
fi

git add -A
git commit -m "chore(legal): update privacy"

############################################
# STEP 9 — Cookie consent banner
############################################
echo "[9] Adding cookie consent..."

cat > "$TMPDIR/cookie_block" <<'COOKIE'
<!-- Cookie Consent -->
<div id="cookie-consent" style="position:fixed;bottom:10px;left:10px;right:10px;background:#fff;padding:12px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:9999;">
  This site uses cookies for ads. <button id="accept-cookie">OK</button>
</div>
<script>
if(!localStorage.getItem('cookies_accepted')){
  document.getElementById('cookie-consent').style.display='block';
}
document.getElementById('accept-cookie').onclick=function(){
  localStorage.setItem('cookies_accepted','1');
  document.getElementById('cookie-consent').style.display='none';
}
</script>
COOKIE

git ls-files '*.html' '*.htm' | while read -r f; do
  if ! grep -q "cookie-consent" "$f"; then
    gawk -v ck="$(sed 's/"/\\"/g' "$TMPDIR/cookie_block")" '
      BEGIN{added=0}
      {
        if(!added && tolower($0) ~ /<\/body>/){
          print ck; added=1
        }
        print
      }' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  fi
done

git add -A
git commit -m "feat(legal): add cookie consent banner"

echo
echo "=== DONE: All high priority upgrades applied ==="
echo "Push with:"
echo "git push -u origin fix/high-priority-upgrades"
echo
exit 0
