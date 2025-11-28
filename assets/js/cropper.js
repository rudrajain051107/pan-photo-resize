// cropper.js - lightweight cropper used by Phase-3 app
export default class Cropper {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rect = null; // {x,y,w,h}
    this.drag = null;
    this.handleSize = 10;
    this._bind();
  }
  _bind() {
    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this.canvas.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
  }
  start(rect) {
    if(!rect) {
      rect = { x: 20, y: 20, w: Math.min(200, this.canvas.width-40), h: Math.min(200, this.canvas.height-40) };
    }
    this.rect = Object.assign({}, rect);
    this.draw();
  }
  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    this.rect = null;
  }
  draw() {
    if(!this.rect) return;
    const ctx = this.ctx;
    // overlay
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6,4]);
    ctx.strokeRect(this.rect.x + 0.5, this.rect.y + 0.5, this.rect.w, this.rect.h);
    // draw handles
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    const s = this.handleSize;
    [[this.rect.x,this.rect.y],[this.rect.x+this.rect.w,this.rect.y],[this.rect.x,this.rect.y+this.rect.h],[this.rect.x+this.rect.w,this.rect.y+this.rect.h]].forEach(h=>{
      ctx.fillRect(h[0]-s/2, h[1]-s/2, s, s);
    });
    ctx.restore();
  }
  _hitHandle(p) {
    const s = this.handleSize;
    const r = this.rect;
    if(!r) return null;
    const handles = [
      {name:'nw', x:r.x, y:r.y},
      {name:'ne', x:r.x+r.w, y:r.y},
      {name:'sw', x:r.x, y:r.y+r.h},
      {name:'se', x:r.x+r.w, y:r.y+r.h}
    ];
    for(const h of handles){
      if(Math.abs(p.x - h.x) <= s && Math.abs(p.y - h.y) <= s) return h.name;
    }
    if(p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) return 'move';
    return null;
  }
  _onDown(e){
    if(!this.rect) return;
    const r = this.canvas.getBoundingClientRect();
    const p = { x: e.clientX - r.left, y: e.clientY - r.top };
    const hit = this._hitHandle(p);
    if(hit){
      this.drag = {mode: hit, start: p, orig: Object.assign({}, this.rect)};
    }
  }
  _onMove(e){
    if(!this.drag) return;
    const r = this.canvas.getBoundingClientRect();
    const p = { x: e.clientX - r.left, y: e.clientY - r.top };
    const d = { x: p.x - this.drag.start.x, y: p.y - this.drag.start.y };
    const orig = this.drag.orig;
    switch(this.drag.mode){
      case 'move':
        this.rect.x = Math.max(0, Math.min(orig.x + d.x, this.canvas.width - orig.w));
        this.rect.y = Math.max(0, Math.min(orig.y + d.y, this.canvas.height - orig.h));
        break;
      case 'nw':
        this.rect.x = Math.max(0, orig.x + d.x);
        this.rect.y = Math.max(0, orig.y + d.y);
        this.rect.w = Math.max(10, orig.w - d.x);
        this.rect.h = Math.max(10, orig.h - d.y);
        break;
      case 'ne':
        this.rect.y = Math.max(0, orig.y + d.y);
        this.rect.w = Math.max(10, orig.w + d.x);
        this.rect.h = Math.max(10, orig.h - d.y);
        break;
      case 'sw':
        this.rect.x = Math.max(0, orig.x + d.x);
        this.rect.w = Math.max(10, orig.w - d.x);
        this.rect.h = Math.max(10, orig.h + d.y);
        break;
      case 'se':
        this.rect.w = Math.max(10, orig.w + d.x);
        this.rect.h = Math.max(10, orig.h + d.y);
        break;
    }
    // redraw: assume external UI will redraw canvas image then call cropper.draw()
    // but attempt to draw overlay on top
    this.draw();
  }
  _onUp(){
    this.drag = null;
  }
}
