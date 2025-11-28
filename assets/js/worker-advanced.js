// worker-advanced.js - lightweight worker initializer
// This worker expects to be used as: const w = new Worker('assets/js/worker-advanced.js'); w.postMessage({cmd:'process', file, preset});
self.addEventListener('message', async (ev) => {
  const data = ev.data || {};
  try {
    if(data.cmd === 'process' && data.file){
      // Worker cannot receive File/Blob across module worker easily in all envs.
      // This is a simple echo stub: real heavy processing is done client-side in imageProcessor.
      const result = { ok: true, message: 'worker processed (stub)' };
      self.postMessage({ id: data.id || null, ok: true, result });
    } else {
      self.postMessage({ ok: false, error: 'unknown-cmd' });
    }
  } catch(err){
    self.postMessage({ ok: false, error: (err && err.message) || String(err) });
  }
});
