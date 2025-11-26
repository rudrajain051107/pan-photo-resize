/* assets/js/validator.js */
export function validateFile(file, options = {}) {
  const maxSize = options.maxSizeBytes || 10 * 1024 * 1024; // 10MB
  if (!file) return { valid:false, errors:["No file selected."] };
  const allowed = ['image/jpeg','image/png','image/webp'];
  if (!allowed.includes(file.type)) return { valid:false, errors:["Unsupported file type. Use JPG/PNG/WebP."] };
  if (file.size > maxSize) return { valid:false, errors:[`File too large. Max ${(maxSize/1024/1024).toFixed(1)} MB`] };
  return { valid:true, errors:[], size:file.size };
}
