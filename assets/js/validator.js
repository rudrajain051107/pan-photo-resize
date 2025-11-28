/* validator.js */
export default class Validator {
  constructor({ maxSizeMB = 10, allowedTypes = ['image/jpeg','image/png'] } = {}){
    this.maxSizeMB = maxSizeMB;
    this.allowedTypes = allowedTypes;
  }
  validate(file){
    if(!file) return { ok:false, msg:'No file' };
    if (this.allowedTypes.length && !this.allowedTypes.includes(file.type)) {
      return { ok:false, msg:'Unsupported file type. Use JPG or PNG.' };
    }
    const sizeMB = file.size / (1024*1024);
    if (sizeMB > this.maxSizeMB) return { ok:false, msg: `Max file size ${this.maxSizeMB}MB exceeded (${sizeMB.toFixed(2)}MB)` };
    return { ok:true, msg:'OK' };
  }
}
