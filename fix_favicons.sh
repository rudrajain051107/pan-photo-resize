#!/usr/bin/env bash
set -e

echo "=== AUTO FAVICON FIX SCRIPT v2 (SVG SUPPORT, SAFE) ==="

# --- Detect project root ---
if [ ! -f "index.html" ]; then
  echo "ERROR: Run this script from your project root (where index.html is)."
  exit 1
fi

# --- Detect logo file (SVG) ---
LOGO=""
if [ -f assets/images/logo.svg ]; then
  LOGO="assets/images/logo.svg"
else
  echo "ERROR: Could not find logo.svg at assets/images/logo.svg"
  echo "Place your logo here:"
  echo "  assets/images/logo.svg"
  exit 1
fi

echo "Using logo file: $LOGO"

# --- Create output folder ---
mkdir -p assets/images/favicons

# --- Convert SVG to large PNG ---
echo "Converting SVG to PNG..."
magick "$LOGO" -resize 1024x1024 assets/images/favicons/logo-large.png

BASE="assets/images/favicons/logo-large.png"

# --- Generate favicon sizes ---
echo "Generating favicon PNG sizes..."
magick "$BASE" -resize 16x16 assets/images/favicons/favicon-16x16.png
magick "$BASE" -resize 32x32 assets/images/favicons/favicon-32x32.png
magick "$BASE" -resize 48x48 assets/images/favicons/favicon-48x48.png
magick "$BASE" -resize 180x180 assets/images/favicons/apple-touch-icon.png

# --- Generate favicon.ico ---
echo "Generating favicon.ico..."
magick assets/images/favicons/favicon-16x16.png \
       assets/images/favicons/favicon-32x32.png \
       assets/images/favicons/favicon-48x48.png \
       favicon.ico

# --- Update index.html ---
echo "Updating index.html favicon tags..."

sed -i '/<\/head>/i \
<!-- AUTO-GENERATED FAVICONS -->\
<link rel="icon" type="image/png" sizes="32x32" href="assets/images/favicons/favicon-32x32.png">\
<link rel="icon" type="image/png" sizes="16x16" href="assets/images/favicons/favicon-16x16.png">\
<link rel="apple-touch-icon" sizes="180x180" href="assets/images/favicons/apple-touch-icon.png">\
<link rel="icon" href="/favicon.ico">\
' index.html

echo "HTML updated."

# --- Commit & push ---
echo "Committing changes..."
git add .
git commit -m "Fix: Auto-generated favicons from SVG (v2 safe script)"
git push

echo "=== DONE: FAVICONS FIXED & DEPLOYED ==="
