/* 虚拟化学实验室 —— 画布可视化: 容器动画 (气泡/沉淀/火焰/蒸汽/搅拌/加热板/冰浴) 与滴定曲线 */
(function (g) {
  'use strict';
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  const rgba = (c, a) => 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
  function hex2rgb(h) { h = (h || '#ddd').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0]; }

  // 容器内腔多边形 (归一化 0..1，x 向右，y 向下；底部在 y=1)
  const SHAPES = {
    beaker: { poly: [[.12, .06], [.12, .96], [.88, .96], [.88, .06]], rim: true },
    calor: { poly: [[.12, .06], [.12, .96], [.88, .96], [.88, .06]], rim: true, double: true },
    tube: { poly: [[.34, .02], [.34, .92], [.38, .97], [.5, .99], [.62, .97], [.66, .92], [.66, .02]], rim: true },
    flask: { poly: [[.4, .02], [.4, .3], [.1, .93], [.14, .97], [.86, .97], [.9, .93], [.6, .3], [.6, .02]], rim: true },
    crucible: { poly: [[.14, .3], [.26, .96], [.74, .96], [.86, .3]], rim: true },
  };

  function Viz(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.kind = 'beaker'; this.level = 0; this.c0 = [226, 242, 250]; this.a0 = 0.4; this.c1 = null; this.a1 = null;
    this.t = 1; this.dur = 4; this.playing = false; this.anim = null; this.preview = { solids: [] };
    this.parts = []; this.drops = []; this.settled = []; this.stir = false; this.plate = false; this.ice = false; this.tick = 0;
    this.heatT = 0; this.last = performance.now(); this.onTemp = null; this.cloud = 0;
    const self = this; const loop = (now) => { const dt = Math.min(0.05, (now - self.last) / 1000); self.last = now; self.step(dt); self.draw(); self.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  Viz.prototype.setKind = function (k) { this.kind = SHAPES[k] ? k : 'beaker'; };
  Viz.prototype.setPreview = function (p) { // {level, c, a, solids:[{color,amount}]}
    this.anim = null; this.playing = false; this.t = 1; this.parts = []; this.settled = [];
    this.level = p.level || 0; this.c0 = p.c || [226, 242, 250]; this.a0 = p.a || 0.4; this.c1 = null; this.preview = { solids: p.solids || [] }; this.cloud = 0;
  };
  Viz.prototype.play = function (anim) {
    this.anim = anim; this.t = 0; this.playing = true; this.parts = []; this.settled = []; this.cloud = 0;
    this.level = anim.level; this.c0 = anim.c0 || this.c0; this.a0 = anim.a0 || 0.4; this.c1 = anim.c1 || this.c0; this.a1 = anim.a1 || this.a0;
    this.preview = { solids: (this.preview.solids || []).slice() };
    this.dur = (anim.flame || anim.bubbles.length || anim.precip.length) ? 5 : 2.5;
  };
  Viz.prototype.addDrop = function (color) { this.drops.push({ y: -20, color: color || [200, 200, 220], v: 0 }); };
  Viz.prototype.step = function (dt) {
    this.tick += dt; const A = this.anim;
    if (this.playing) {
      this.t = Math.min(1, this.t + dt / this.dur);
      if (this.t >= 1) { this.playing = false; }
      if (this.onTemp && A) this.onTemp(lerp(A.T0 !== undefined ? A.T0 : 25, A.Tfinal !== undefined && A.Tfinal !== null ? A.Tfinal : 25, ease(Math.min(1, this.t * 1.2))));
    }
    const live = A && (this.playing || this.t >= 1);
    // 粒子: 气泡
    if (A && live && this.t < 1.0) {
      const intens = ease(Math.min(1, this.t * 3)) * (1 - ease(Math.max(0, (this.t - .75) / .25)));
      A.bubbles.forEach(b => { const rate = (6 + 40 * Math.min(1, Math.log10(1 + b.n * 2000) / 3.5)) * intens; if (Math.random() < rate * dt) this.parts.push({ k: 'b', x: .2 + .6 * Math.random(), y: .95, r: 1.5 + Math.random() * 3.5, vy: .12 + Math.random() * .16, col: b.color, ph: Math.random() * 6 }); });
      A.precip.forEach(p => { const rate = 55 * Math.min(1, .25 + Math.log10(1 + p.amount * 200) / 2) * Math.min(1, this.t * 2.5) * (this.t < .9 ? 1 : 0); if (Math.random() < rate * dt) this.parts.push({ k: 'p', x: .18 + .64 * Math.random(), y: .12 + Math.random() * .5, r: 1 + Math.random() * 2.2, vy: .03 + Math.random() * .05, col: p.color, metal: p.metal }); });
      if ((A.steam || A.smoke) && Math.random() < 14 * dt) this.parts.push({ k: A.smoke ? 'smoke' : 'steam', x: .25 + .5 * Math.random(), y: 0, r: 8 + Math.random() * 10, vy: .1 + Math.random() * .1, ph: Math.random() * 6 });
      if (A.flame && this.t < .95 && Math.random() < 30 * dt) this.parts.push({ k: 'f', x: .22 + .56 * Math.random(), y: 0, r: 5 + Math.random() * 9, vy: .25 + Math.random() * .2, col: A.flame.color });
    } else if (A && this.t >= 1 && A.bubbles.length && Math.random() < 1.5 * dt) { /* 余泡 */ this.parts.push({ k: 'b', x: .2 + .6 * Math.random(), y: .95, r: 1.5 + Math.random() * 2, vy: .1, col: A.bubbles[0].color, ph: 0 }); }
    if (A && A.flame && this.t >= 1 && A.flameStay && Math.random() < 12 * dt) this.parts.push({ k: 'f', x: .3 + .4 * Math.random(), y: 0, r: 5 + Math.random() * 7, vy: .25, col: A.flame.color });
    // 更新粒子
    const top = this.liquidTop();
    this.parts.forEach(p => {
      if (p.k === 'b') { p.y -= p.vy * dt; p.x += Math.sin(this.tick * 3 + p.ph) * .002; if (p.y < top) p.dead = true; }
      else if (p.k === 'p') { p.y += p.vy * dt * 2.2; if (p.y > .94) { p.dead = true; this.settle(p); } }
      else if (p.k === 'steam' || p.k === 'smoke') { p.y -= p.vy * dt * 1.5; p.life = (p.life || 0) + dt; p.x += Math.sin(this.tick * 2 + p.ph) * .003; if (p.life > 2.4) p.dead = true; }
      else if (p.k === 'f') { p.y -= p.vy * dt; p.life = (p.life || 0) + dt; if (p.life > 0.7) p.dead = true; }
    });
    this.parts = this.parts.filter(p => !p.dead).slice(-400);
    this.drops.forEach(d => { d.v += 600 * dt; d.y += d.v * dt; });
    this.drops = this.drops.filter(d => d.y < this.cv.height * (1 - this.level * .7));
  };
  Viz.prototype.settle = function (p) { if (this.settled.length < 320) this.settled.push({ x: p.x, h: Math.random(), r: p.r, col: p.col, metal: p.metal }); };
  Viz.prototype.liquidTop = function () { return 0.96 - 0.9 * Math.max(0.02, Math.min(1, this.level)) * (this.kind === 'tube' ? 1 : 1); };
  Viz.prototype.liquidColor = function () {
    if (this.c1 && this.anim) { const e = ease(this.t); return { c: [0, 1, 2].map(i => lerp(this.c0[i], this.c1[i], e)), a: lerp(this.a0, this.a1, e) }; }
    return { c: this.c0, a: this.a0 };
  };
  Viz.prototype.draw = function () {
    const cv = this.cv, c = this.ctx, W = cv.width, H = cv.height; c.clearRect(0, 0, W, H);
    const sh = SHAPES[this.kind] || SHAPES.beaker;
    // 实验台面 / 加热板
    const vx = W * .1, vw = W * .8, vy = 24, vh = H - 70;
    const X = u => vx + u * vw, Y = v => vy + v * vh;
    // 加热板
    c.fillStyle = '#3b4552'; roundRect(c, W * .04, H - 40, W * .92, 22, 6); c.fill();
    c.fillStyle = this.plate ? '#ff6a2b' : '#59636f'; roundRect(c, W * .08, H - 46, W * .84, 8, 4); c.fill();
    if (this.plate) { const gl = c.createLinearGradient(0, H - 46, 0, H - 120); gl.addColorStop(0, 'rgba(255,110,40,.35)'); gl.addColorStop(1, 'rgba(255,110,40,0)'); c.fillStyle = gl; c.fillRect(W * .08, H - 120, W * .84, 74); }
    c.fillStyle = '#d8dee6'; c.beginPath(); c.arc(W * .88, H - 29, 5, 0, 7); c.fill();
    // 冰浴
    if (this.ice) { c.fillStyle = 'rgba(170,220,250,.45)'; roundRect(c, vx - 6, H - 46 - vh * .35, vw + 12, vh * .35, 8); c.fill(); for (let i = 0; i < 9; i++) { c.fillStyle = 'rgba(230,248,255,.85)'; const ix = vx + 4 + i * vw / 9, iy = H - 54 - ((i * 37) % 30); c.save(); c.translate(ix + 8, iy); c.rotate(i * .5); c.fillRect(-7, -7, 14, 14); c.restore(); } }
    // 容器内腔路径
    const path = () => { c.beginPath(); sh.poly.forEach((p, i) => { i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])); }); c.closePath(); };
    const lc = this.liquidColor(); const topV = this.liquidTop();
    c.save(); path(); c.clip();
    // 液体
    if (this.level > 0.001) {
      const lg = c.createLinearGradient(0, Y(topV), 0, Y(1)); lg.addColorStop(0, rgba(lc.c, Math.min(.95, lc.a * .8))); lg.addColorStop(1, rgba(lc.c, Math.min(.98, lc.a + .1)));
      c.fillStyle = lg; const wob = Math.sin(this.tick * 3) * (this.playing ? 1.6 : .5) + (this.stir ? Math.sin(this.tick * 11) * 1.2 : 0);
      c.beginPath(); c.moveTo(0, Y(1) + 5); c.lineTo(0, Y(topV));
      for (let x = 0; x <= W; x += 10) c.lineTo(x, Y(topV) + Math.sin(x * .05 + this.tick * 2.6) * (1 + (this.stir ? 1.6 : 0.4)) + wob * .15);
      c.lineTo(W, Y(1) + 5); c.closePath(); c.fill();
      // 悬浮浑浊度
      if (this.anim && this.anim.precip.length) { const cl = this.cloudAmt(); if (cl > 0) { const pc = hex2rgb(this.anim.precip[0].color); c.fillStyle = rgba(pc, cl * .35); c.fillRect(0, Y(topV), W, Y(1) - Y(topV)); } }
      // 加热 / 温升晕
      if (this.anim && this.anim.heat > 5 && this.playing) { c.fillStyle = 'rgba(255,120,60,' + Math.min(.18, this.anim.heat / 300) * Math.sin(this.t * 3.14) + ')'; c.fillRect(0, Y(topV), W, Y(1) - Y(topV)); }
    }
    // 固体 (试剂)
    const sol = this.currentSolids();
    sol.forEach((s, i) => { const n = 4 + Math.min(12, Math.round(Math.sqrt(s.amount * 40))); const col = s.color; for (let k = 0; k < n; k++) { const ux = .2 + (((k * 53 + i * 31) % 100) / 100) * .6; const r = 3 + ((k * 7 + i * 3) % 5) * (s.metal ? 1.2 : .9) * s.scale; c.fillStyle = col; c.strokeStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(X(ux), Y(.945) - ((k * 5) % 3) * 3, r * 1.3, r, ((k * 17) % 10) / 10, 0, 7); c.fill(); c.stroke(); } });
    // 沉淀层
    if (this.settled.length) { this.settled.forEach(s => { c.fillStyle = s.col; c.globalAlpha = .9; const y = Y(.975) - s.h * Math.min(18, 3 + this.settled.length / 14); c.beginPath(); c.arc(X(.14 + s.x * .72), y, s.r + 1.2, 0, 7); c.fill(); }); c.globalAlpha = 1; }
    // 搅拌子
    if (this.stir) { c.save(); c.translate(X(.5), Y(.9)); c.rotate(this.tick * 14); c.fillStyle = '#f4f4f4'; c.strokeStyle = '#999'; roundRect(c, -24, -4, 48, 8, 4); c.fill(); c.stroke(); c.restore(); }
    // 粒子
    this.parts.forEach(p => {
      const px = X(p.x), py = Y(p.y);
      if (p.k === 'b') { c.strokeStyle = p.col && p.col.indexOf('rgba') === 0 ? p.col : 'rgba(255,255,255,.8)'; c.lineWidth = 1; c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.arc(px, py, p.r, 0, 7); c.fill(); c.stroke(); }
      else if (p.k === 'p') { c.fillStyle = p.col; c.beginPath(); c.arc(px, py, p.r, 0, 7); c.fill(); }
    });
    c.restore();
    // 容器壁
    c.lineWidth = 3; c.strokeStyle = 'rgba(190,225,245,.95)'; path(); c.stroke();
    c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.moveTo(X(sh.poly[0][0]) + 6, Y(.12)); c.lineTo(X(sh.poly[0][0]) + 6, Y(.7)); c.stroke();
    if (sh.double) { c.strokeStyle = 'rgba(190,225,245,.6)'; c.lineWidth = 2; c.strokeRect(X(.07), Y(.04), vw * .86, vh * .95); }
    if (sh.rim) { c.lineWidth = 3; c.strokeStyle = 'rgba(210,235,250,.95)'; c.beginPath(); c.moveTo(X(sh.poly[0][0]) - 7, Y(sh.poly[0][1])); c.lineTo(X(sh.poly[0][0]), Y(sh.poly[0][1])); const L = sh.poly[sh.poly.length - 1]; c.moveTo(X(L[0]), Y(L[1])); c.lineTo(X(L[0]) + 7, Y(L[1])); c.stroke(); }
    // 刻度
    if (this.kind !== 'crucible') { c.fillStyle = 'rgba(220,235,245,.7)'; c.font = '10px sans-serif'; c.strokeStyle = 'rgba(220,235,245,.6)'; c.lineWidth = 1; for (let i = 1; i <= 5; i++) { const yy = Y(.96 - i * .17); const x0 = X(sh.poly[1][0]); c.beginPath(); c.moveTo(x0 + 1, yy); c.lineTo(x0 + 9 + (i % 2) * 6, yy); c.stroke(); } }
    // 火焰 / 蒸汽 (容器上方)
    this.parts.forEach(p => {
      const px = X(p.x), py = Y(topV < .3 ? topV : .25) - (p.k === 'f' ? 0 : 0) - (p.y) * (p.k === 'f' ? vh * .9 : vh * 1.1) * 0; 
      if (p.k === 'steam' || p.k === 'smoke') { const a = Math.max(0, .5 - (p.life || 0) / 5); const yy = Y(topV) - (p.life || 0) * 70; c.fillStyle = p.k === 'smoke' ? 'rgba(220,220,220,' + a + ')' : 'rgba(255,255,255,' + a + ')'; c.beginPath(); c.arc(px, yy, p.r + (p.life || 0) * 9, 0, 7); c.fill(); }
      else if (p.k === 'f') { const life = (p.life || 0) / .7; const yy = Y(Math.min(topV, .9)) - life * vh * .5; const rr = p.r * (1 - life * .6); const gr = c.createRadialGradient(px, yy, 0, px, yy, rr * 2); gr.addColorStop(0, 'rgba(255,255,220,' + (1 - life) + ')'); gr.addColorStop(.4, rgba(hex2rgb(p.col), .8 * (1 - life))); gr.addColorStop(1, 'rgba(255,60,0,0)'); c.fillStyle = gr; c.beginPath(); c.arc(px, yy, rr * 2, 0, 7); c.fill(); }
    });
    // 滴液
    this.drops.forEach(d => { c.fillStyle = rgba(d.color, .9); c.beginPath(); c.ellipse(W / 2, d.y, 3, 5, 0, 0, 7); c.fill(); });
  };
  Viz.prototype.cloudAmt = function () { if (!this.anim) return 0; if (this.t >= 1) return Math.max(0, .5 - (this.tick % 1000) * 0) * .35; return Math.sin(Math.min(1, this.t * 1.4) * 3.14) * .6; };
  Viz.prototype.currentSolids = function () {
    const out = [];
    if (this.anim && this.t >= 1 || (this.anim && this.playing)) { const k = ease(this.t); (this.anim.solids || []).forEach(s => out.push({ color: s.color, amount: s.amount, metal: ['Zn', 'Fe', 'Cu', 'Mg', 'Al', 'Pb', 'Ag'].includes(s.id), scale: 1 - .15 * k })); }
    else (this.preview.solids || []).forEach(s => out.push(Object.assign({ scale: 1 }, s)));
    return out;
  };
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  // ---------- 滴定曲线 ----------
  function drawTitration(cv, o) {
    // o: {pts:[{v,pH}], Vmax, cur:{v,pH}, eq:[{v,pH}], ind:{range,acid,base,pK,id}, colorAt:fn(pH)->css, hover}
    const c = cv.getContext('2d'), W = cv.width, H = cv.height; c.clearRect(0, 0, W, H);
    const L = 52, R = 14, T = 14, B = 40; const pw = W - L - R, ph = H - T - B;
    const X = v => L + v / o.Vmax * pw, Y = p => T + (1 - Math.max(0, Math.min(14, p)) / 14) * ph;
    c.fillStyle = '#0f1a24'; c.fillRect(0, 0, W, H);
    // 指示剂变色范围
    if (o.ind && o.ind.range) { c.fillStyle = 'rgba(255,220,120,.12)'; c.fillRect(L, Y(o.ind.range[1]), pw, Y(o.ind.range[0]) - Y(o.ind.range[1])); c.fillStyle = 'rgba(255,220,120,.8)'; c.font = '11px sans-serif'; c.fillText(o.ind.name + ' 变色范围 ' + o.ind.range[0] + '–' + o.ind.range[1], L + 6, Y(o.ind.range[1]) - 3); }
    c.strokeStyle = 'rgba(160,190,210,.18)'; c.lineWidth = 1; c.fillStyle = '#9db6c8'; c.font = '11px sans-serif'; c.textAlign = 'right';
    for (let p = 0; p <= 14; p += 2) { c.beginPath(); c.moveTo(L, Y(p)); c.lineTo(W - R, Y(p)); c.stroke(); c.fillText(p, L - 6, Y(p) + 4); }
    c.textAlign = 'center'; const stepV = niceStep(o.Vmax / 8);
    for (let v = 0; v <= o.Vmax + 1e-9; v += stepV) { c.beginPath(); c.moveTo(X(v), T); c.lineTo(X(v), T + ph); c.stroke(); c.fillText(+v.toFixed(2), X(v), T + ph + 15); }
    c.fillStyle = '#c9d8e4'; c.fillText('滴定剂体积 V / mL', L + pw / 2, H - 6); c.save(); c.translate(13, T + ph / 2); c.rotate(-Math.PI / 2); c.fillText('pH', 0, 0); c.restore();
    c.strokeStyle = '#6b8aa0'; c.lineWidth = 1.5; c.strokeRect(L, T, pw, ph);
    // pH=7
    c.setLineDash([4, 4]); c.strokeStyle = 'rgba(120,220,160,.35)'; c.beginPath(); c.moveTo(L, Y(7)); c.lineTo(W - R, Y(7)); c.stroke(); c.setLineDash([]);
    // 曲线
    const upto = o.cur ? o.cur.v : o.Vmax;
    c.lineWidth = 2.6; c.lineJoin = 'round';
    for (let i = 1; i < o.pts.length; i++) { const a = o.pts[i - 1], b = o.pts[i]; if (a.v > upto + 1e-9) break; c.strokeStyle = o.colorAt ? o.colorAt(b.pH) : '#4fd1c5'; c.beginPath(); c.moveTo(X(a.v), Y(a.pH)); c.lineTo(X(Math.min(b.v, upto)), Y(a.pH + (b.pH - a.pH) * Math.min(1, (upto - a.v) / (b.v - a.v)))); c.stroke(); }
    c.strokeStyle = 'rgba(79,209,197,.25)'; c.lineWidth = 1; c.beginPath(); o.pts.forEach((p, i) => i ? c.lineTo(X(p.v), Y(p.pH)) : c.moveTo(X(p.v), Y(p.pH))); c.stroke();
    // 等当点
    (o.eq || []).forEach((e, i) => { c.strokeStyle = '#ffb347'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(X(e.v), T); c.lineTo(X(e.v), T + ph); c.stroke(); c.setLineDash([]); c.fillStyle = '#ffb347'; c.beginPath(); c.arc(X(e.v), Y(e.pH), 4.5, 0, 7); c.fill(); c.textAlign = 'left'; c.font = '11px sans-serif'; c.fillText('等当点' + (o.eq.length > 1 ? (i + 1) : '') + ': ' + e.v.toFixed(2) + ' mL, pH ' + e.pH.toFixed(2), Math.min(X(e.v) + 8, W - 160), Y(e.pH) + (e.pH > 7 ? 16 : -8)); });
    // 当前点
    if (o.cur) { c.fillStyle = '#fff'; c.strokeStyle = o.colorAt ? o.colorAt(o.cur.pH) : '#4fd1c5'; c.lineWidth = 3; c.beginPath(); c.arc(X(o.cur.v), Y(o.cur.pH), 6.5, 0, 7); c.fill(); c.stroke(); }
    if (o.hover) { c.fillStyle = 'rgba(0,0,0,.7)'; c.fillRect(Math.min(W - 118, X(o.hover.v) + 8), Y(o.hover.pH) - 22, 110, 18); c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText('V=' + o.hover.v.toFixed(2) + '  pH=' + o.hover.pH.toFixed(2), Math.min(W - 112, X(o.hover.v) + 12), Y(o.hover.pH) - 9); }
    c.textAlign = 'left';
    return { L, R, T, B, pw, ph };
  }
  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x))); const f = x / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }

  g.ChemViz = { Viz, drawTitration, hex2rgb, rgba };
})(typeof window !== 'undefined' ? window : globalThis);
