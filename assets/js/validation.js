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
