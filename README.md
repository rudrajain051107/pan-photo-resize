# PAN Photo Resize

Free client-side tool to resize PAN card photos to official specs (NSDL/UTI). No uploads — processing occurs in your browser.

Contact: jainstools051107@gmail.com
PAN Photo Resize — Official NSDL/UTI PAN Card Photo Resizer  
Free, secure, client-side tool to resize PAN card photos to official government specifications.

All image processing happens locally in your browser — nothing is uploaded anywhere.

🔥 FEATURES

OFFICIAL PAN PRESETS (2025 Updated)
- NSDL: 276 × 394 px (≤ 50 KB)
- UTI: 213 × 213 px (≤ 30 KB)
- Custom mode supported

SECURITY
- 100% client-side
- No uploads
- No tracking
- Full privacy

PROCESSING ENGINE
- Validates JPG/PNG + detects corruption
- Max upload size: 5MB
- Center-crop (passport style)
- Iterative compression until file meets KB limit
- Before/After preview
- One-click download

UI/UX
- Realtime validation and errors
- Processing indicator
- Mobile-friendly UI
- Cookie consent banner
- ARIA accessibility

SEO + METADATA
- Open Graph preview
- JSON-LD schema
- robots.txt and sitemap.xml
- vercel.json security headers

📁 PROJECT STRUCTURE

pan-photo-resize/
│
├── index.html — main UI
├── about.html
├── contact.html
├── privacy.html
├── terms.html
├── report.html
├── 404.html
│
├── assets/
│   ├── preview.png
│   └── js/
│       └── validation-and-resize.js
│
├── blog/
│
├── vercel.json
├── robots.txt
├── sitemap.xml
│
├── LICENSE
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
└── .gitignore

🧠 HOW IT WORKS

- HTML5 Canvas handles all resizing + compression
- Reads the uploaded file and validates:
  - Type (JPG/PNG)
  - Size (<5MB)
  - Corruption
- Auto applies NSDL/UTI preset or custom
- Crops using aspect ratio detection
- Compresses iteratively until:
  - NSDL = ≤ 50 KB
  - UTI = ≤ 30 KB
- Outputs downloadable blob URL
- 100% browser-side = full privacy

📦 DEVELOPER SETUP

To clone the project:
git clone https://github.com/rudrajain051107/pan-photo-resize

Then enter the folder:
cd pan-photo-resize

To test locally:
Open index.html in any browser.

🌐 LIVE TOOL

https://pan-photo-resize.vercel.app

🤝 CONTRIBUTING

1. Fork the repository
2. Create a new branch:
   git checkout -b feature-name
3. Make your changes
4. Commit your changes:
   git commit -m "feat: description of change"
5. Push the branch:
   git push origin feature-name
6. Open a Pull Request on GitHub

📜 LICENSE

MIT License.

📬 CONTACT

For suggestions or help:
Email: jainstools051107@gmail.com

⭐ SUPPORT THIS PROJECT

If this tool helped you, please star the repository on GitHub.
It motivates further development ❤️
