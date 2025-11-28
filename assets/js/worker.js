// worker.js - simple non-module worker fallback
self.onmessage = function(ev){
  const data = ev.data || {};
  if(data.cmd === 'ping'){ self.postMessage({ ok:true, pong: Date.now() }); return; }
  self.postMessage({ ok:false, error: 'unhandled' });
};
