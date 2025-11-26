/* assets/js/app.js */
import initUI from './ui.js';
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/service-worker.js').catch(err => console.warn('SW registration failed', err));
}
window.addEventListener('DOMContentLoaded', ()=>{ initUI(); });
