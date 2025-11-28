// validator.js - simple validation helpers
export function validateFile(file, opts = {}) {
  const maxSize = opts.maxSize || 10 * 1024 * 1024; // 10MB default
  const allowed = opts.types || ['image/jpeg','image/png'];
  const res = { valid: true, errors: [] };
  if(!file) { res.valid = false; res.errors.push('no-file'); return res; }
  if(file.size <= 0) { res.valid = false; res.errors.push('zero-size'); }
  if(file.size > maxSize) { res.valid = false; res.errors.push('too-large'); }
  if(allowed.indexOf(file.type) === -1) { res.valid = false; res.errors.push('invalid-type'); }
  return res;
}
