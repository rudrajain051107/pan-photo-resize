/* cropper.js - simple crop rectangle with handles, touch support */
export default class Cropper {
  constructor(containerCanvas) {
    this.canvas = containerCanvas;
    this.ctx = this.canvas.getContext('2d');
    this.rect = null; // {x,y,w,h}
    this.dragging = false;
    this.handleSize = 12;
    this.mode = null;
    this._initEvents();
  }
  _initEvents(){
    this.canvas.addEventListener('pointerdown', e=> this._onDown(e));
    window.addEventListener('pointermove', e=> this._onMove(e));
    window.addEventListener('pointerup', e=> this._onUp(e));
  }
  _pos(e){
    const r=this.canvas.getBoundingClientRect();
    return {x:(e.clientX - r.left), y:(e.clientY - r.top)};
  }
  start(rect){
    // rect in canvas coordinates
    this.rect = Object.assign({}, rect);
    this.render();
  }
  _onDown(e){
    if(!this.rect) return;
    const p=this._pos(e);
    // check handle or inside
    const h=this.handleSize;
    const hit = this._hitTest(p);
    if(hit){
      this.mode = hit;
      this.dragging = true;
      this.startP = p;
    }
  }
  _onMove(e){
    if(!this.dragging) return;
    const p=this._pos(e);
    const dx=p.x - this.startP.x;
    const dy=p.y - this.startP.y;
    this.startP = p;
    switch(this.mode){
      case 'inside': this.rect.x += dx; this.rect.y += dy; break;
      case 'tl': this.rect.x += dx; this.rect.y += dy; this.rect.w -= dx; this.rect.h -= dy; break;
      case 'tr': this.rect.y += dy; this.rect.w += dx; this.rect.h -= dy; break;
      case 'bl': this.rect.x += dx; this.rect.w -= dx; this.rect.h += dy; break;
      case 'br': this.rect.w += dx; this.rect.h += dy; break;
    }
    // clamp min size
    if(this.rect.w < 20) this.rect.w = 20;
    if(this.rect.h < 20) this.rect.h = 20;
    this.render();
  }
  _onUp(){
    this.dragging=false; this.mode=null;
  }
  _hitTest(p){
    const r=this.rect;
    const s=this.handleSize;
    if(!r) return null;
    // handles
    const handles = {
      tl: {x:r.x, y:r.y},
      tr: {x:r.x + r.w, y: r.y},
      bl: {x:r.x, y: r.y + r.h},
      br: {x: r.x + r.w, y: r.y + r.h}
    };
    for(let k in handles){
      const h=handles[k];
      if(Math.abs(p.x - h.x) <= s && Math.abs(p.y - h.y) <= s) return k;
    }
    // inside?
    if(p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) return 'inside';
    return null;
  }
  render(){
    const ctx=this.ctx, c=this.canvas;
    ctx.clearRect(0,0,c.width,c.height);
    // dim
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0,0,c.width,c.height);
    if(!this.rect) return;
    // clear rect
    ctx.clearRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
    // border
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
    // handles
    ctx.fillStyle = '#ffffff';
    const s=this.handleSize;
    [[this.rect.x, this.rect.y],[this.rect.x+this.rect.w,this.rect.y],[this.rect.x,this.rect.y+this.rect.h],[this.rect.x+this.rect.w,this.rect.y+this.rect.h]]
      .forEach(h=> ctx.fillRect(h[0]-s/2, h[1]-s/2, s, s));
  }
  getCropBox(){ return this.rect ? Object.assign({}, this.rect) : null; }
}
