/* cropper.js - minimal cropper with handles and touch support
   Usage:
     const cropper = new Cropper(canvasElement);
     cropper.start({ x:0, y:0, w:canvas.width, h:canvas.height });
     cropper.getRect() -> {x,y,w,h}
     cropper.commit() -> applies any internal state
*/
export default class Cropper {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rect = null;
    this.dragging = false;
    this.handleSize = 12;
    this.activeHandle = null;
    this.startP = null;
    this.listeners();
  }
  listeners(){
    const onDown = e => { e.preventDefault(); this._onDown(e); };
    const onMove = e => { if(this.dragging) this._onMove(e); };
    const onUp = e => { this.dragging=false; this.activeHandle=null; };
    this.canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  start(rect){
    this.rect = Object.assign({}, rect || { x:0, y:0, w: this.canvas.width, h: this.canvas.height });
    this.render();
  }
  getRect(){ return Object.assign({}, this.rect); }
  commit(){ /* placeholder if UI needs commit action */ }
  _pos(e){
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (this.canvas.width / r.width), y: (e.clientY - r.top) * (this.canvas.height / r.height) };
  }
  _hitHandle(p){
    const h = this.handleSize;
    const r = this.rect;
    if(!r) return null;
    const handles = {
      tl: { x: r.x, y: r.y },
      tr: { x: r.x + r.w, y: r.y },
      bl: { x: r.x, y: r.y + r.h },
      br: { x: r.x + r.w, y: r.y + r.h },
      inside: null
    };
    for(const k of ['tl','tr','bl','br']){
      const hc = handles[k];
      if (p.x >= hc.x - h && p.x <= hc.x + h && p.y >= hc.y - h && p.y <= hc.y + h) return k;
    }
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return 'inside';
    return null;
  }
  _onDown(e){
    const p = this._pos(e);
    const hit = this._hitHandle(p);
    if(hit){
      this.activeHandle = hit;
      this.dragging = true;
      this.startP = p;
    }
  }
  _onMove(e){
    if(!this.dragging) return;
    const p = this._pos(e);
    const dx = p.x - this.startP.x, dy = p.y - this.startP.y;
    const r = this.rect;
    if (this.activeHandle === 'inside'){
      r.x += dx; r.y += dy;
    } else if (this.activeHandle === 'tl'){
      r.x += dx; r.y += dy; r.w -= dx; r.h -= dy;
    } else if (this.activeHandle === 'tr'){
      r.y += dy; r.w += dx; r.h -= dy;
    } else if (this.activeHandle === 'bl'){
      r.x += dx; r.w -= dx; r.h += dy;
    } else if (this.activeHandle === 'br'){
      r.w += dx; r.h += dy;
    }
    if (r.w < 10) r.w = 10;
    if (r.h < 10) r.h = 10;
    if (r.x < 0) r.x = 0;
    if (r.y < 0) r.y = 0;
    if (r.x + r.w > this.canvas.width) r.x = this.canvas.width - r.w;
    if (r.y + r.h > this.canvas.height) r.y = this.canvas.height - r.h;
    this.startP = p;
    this.render();
  }
  render(){
    if(!this.ctx || !this.rect) return;
    const { x,y,w,h } = this.rect;
    this.ctx.save();
    this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    this.ctx.fillStyle = 'rgba(0,0,0,0.35)';
    this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
    this.ctx.clearRect(x,y,w,h);
    this.ctx.strokeStyle = '#00f';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x+1,y+1,w-2,h-2);
    this.ctx.fillStyle = '#fff';
    const s = this.handleSize;
    [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].forEach(([hx,hy])=>{
      this.ctx.fillRect(hx - s/2, hy - s/2, s, s);
      this.ctx.strokeRect(hx - s/2, hy - s/2, s, s);
    });
    this.ctx.restore();
  }
}
