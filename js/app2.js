/* 虚拟化学实验室 —— 界面逻辑 (第二部分): 原电池搭建器、平衡/动力学面板、光化学速查、说明补充 */
(function () {
  'use strict';
  const E = window.ChemEngine, D = E.D, SP = D.SP, EC = window.ChemEchem, EQ = window.ChemEquil, fnum = E.fnum;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const hex2rgb = h => { h = (h || '#ddd').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0]; };
  const rgba = (c, a) => 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
  // 打开新页面时的刷新
  $$('#tabs button').forEach(b => { const old = b.onclick; b.onclick = ev => { if (old) old.call(b, ev); if (b.dataset.view === 'cell') { cellCompute(false); } if (b.dataset.view === 'equil') eqAll(); }; });

  // ==================== 原电池 ====================
  const cellState = { res: null, t0: 0, playing: false, prog: 0 };
  const opt = EC.COUPLES.map(c => '<option value="' + c.id + '">' + c.name + '</option>').join('');
  $('#cL').innerHTML = opt; $('#cR').innerHTML = opt;
  const CEX = [
    ['丹尼尔电池 Zn | Zn²⁺(1 M) ‖ Cu²⁺(1 M) | Cu', { L: ['Zn', 1], R: ['Cu', 1] }],
    ['非标准浓度: Zn²⁺ 0.001 M ‖ Cu²⁺ 1 M', { L: ['Zn', 0.001], R: ['Cu', 1] }],
    ['银锌电池 Zn ‖ Ag⁺', { L: ['Zn', 1], R: ['Ag', 1] }],
    ['铜银电池 Cu ‖ Ag⁺', { L: ['Cu', 1], R: ['Ag', 1] }],
    ['浓差电池: Cu | Cu²⁺(0.01) ‖ Cu²⁺(1) | Cu', { L: ['Cu', 0.01], R: ['Cu', 1] }],
    ['标准氢电极 ‖ Cu²⁺/Cu (测 E°(Cu²⁺/Cu))', { L: ['SHE', 1, null, 0, 1], R: ['Cu', 1] }],
    ['铁铜电偶 (腐蚀电池): Fe ‖ Cu²⁺', { L: ['Fe', 1], R: ['Cu', 1] }],
    ['氧化还原电池: Fe³⁺/Fe²⁺ ‖ MnO₄⁻/Mn²⁺ (pH 0)', { L: ['Fe3', 0.1, 0.1], R: ['MnO4', 0.01, 0.01, 0] }],
    ['镍-铅电池 Ni ‖ Pb²⁺', { L: ['Ni', 1], R: ['Pb', 1] }],
    ['镁-铜电池 (大电动势) Mg ‖ Cu²⁺', { L: ['Mg', 1], R: ['Cu', 1] }],
  ];
  $('#cExample').innerHTML = CEX.map((e, i) => '<option value="' + i + '">' + e[0] + '</option>').join('');
  function setHalf(side, a) { // a: [couple, cox, cred, pH, P]
    $('#c' + side).value = a[0]; $('#c' + side + 'ox').value = a[1] === undefined || a[1] === null ? 1 : a[1]; $('#c' + side + 'red').value = a[2] === undefined || a[2] === null ? 1 : a[2];
    $('#c' + side + 'ph').value = a[3] === undefined || a[3] === null ? 0 : a[3]; $('#c' + side + 'p').value = a[4] === undefined || a[4] === null ? 1 : a[4]; visHalf(side);
  }
  function visHalf(side) {
    const c = EC.BYID[$('#c' + side).value]; const box = $('#half' + side);
    const showOx = c.ox.some(s => s.conc && !s.ph) && c.id !== 'SHE', showRed = c.red.some(s => s.conc);
    $('.fox', box).style.display = showOx ? '' : 'none'; $('.fred', box).style.display = showRed ? '' : 'none'; $('.fph', box).style.display = c.hasPH ? '' : 'none'; $('.fp', box).style.display = c.hasP ? '' : 'none';
    $('.fox', box).firstChild.textContent = c.id.match(/^(Mg|Al|Zn|Fe|Ni|Pb|Cu|Ag)$/) ? 'c(金属离子) mol/L' : 'c(氧化态) mol/L';
  }
  function readHalf(side) { return { couple: $('#c' + side).value, cox: +$('#c' + side + 'ox').value, cred: +$('#c' + side + 'red').value, pH: +$('#c' + side + 'ph').value, P: +$('#c' + side + 'p').value, V: +$('#cV').value }; }
  function cellSpec(withI) { return { left: readHalf('L'), right: readHalf('R'), T: +$('#cT').value, bridge: $('#cBridge').value, I: withI ? +$('#cI').value : 0, t: +$('#cTime').value }; }
  function cellCompute(play) {
    const r = EC.galvanic(cellSpec(!!play)); cellState.res = r; cellState.prog = play ? 0 : (r.discharge ? 1 : 1); cellState.playing = !!play && !!r.discharge; cellState.t0 = performance.now();
    renderCellReport(r); drawCurve(r); if (!cellState.raf) cellState.raf = requestAnimationFrame(cellFrame);
  }
  function renderCellReport(r) {
    const el = $('#cellReport'); if (r.error) { el.innerHTML = '<p class="warn">' + r.error + '</p>'; return; }
    const sign = v => (v >= 0 ? '+' : '') + fnum(v, 4);
    let h = '<div class="kv cellkv">'
      + '<div><span>E°cell</span><b>' + sign(r.E0) + ' V</b></div><div><span>E (Nernst, ' + fnum(r.T, 0) + ' °C)</span><b class="' + (r.E > 0 ? 'ok' : 'warn') + '">' + sign(r.E) + ' V</b></div>'
      + '<div><span>ΔG = −nFE</span><b>' + fnum(r.dG, 2) + ' kJ/mol</b></div><div><span>ΔG° / K</span><b>' + fnum(r.dG0, 1) + ' kJ · K=10^' + fnum(r.logK, 2) + '</b></div>'
      + '<div><span>Q (反应商)</span><b>' + r.Q.toExponential(2) + '</b></div><div><span>最大电功 W = nFE</span><b>' + fnum(r.Wmax, 1) + ' kJ/mol (n=' + r.nElectrons + ')</b></div></div>';
    h += '<ul class="reasons"><li><b>阳极 (−, 氧化)</b>: ' + r.halfAnode + ' <small class="muted">(' + r.anode.name + ', E = ' + fnum(r.anode.E, 4) + ' V)</small></li><li><b>阴极 (+, 还原)</b>: ' + r.halfCathode + ' <small class="muted">(' + r.cathode.name + ', E = ' + fnum(r.cathode.E, 4) + ' V)</small></li><li><b>总反应</b>: ' + r.overall + '</li>'
      + '<li>' + r.electronFlow + '；' + r.cationFlow + '</li>'
      + '<li>判据: E = E(阴极) − E(阳极) = ' + fnum(r.cathode.E, 4) + ' − (' + fnum(r.anode.E, 4) + ') = ' + sign(r.E) + ' V ' + (r.E > 0 ? '> 0 → 反应自发，电池可对外做功；E = E° − (RT/nF)·ln Q，随放电 Q↑、E↓，直到 Q = K、E = 0 (电池“没电”)' : '≤ 0 → 不自发') + '</li>'
      + (r.concentrationCell ? '<li><b>浓差电池</b>: 两侧为同一电对，E° = 0；E = (RT/nF)·ln(c高/c低) = ' + sign(r.E) + ' V，浓度低的一侧为阳极(金属溶解使浓度升高)，直到两侧浓度相等。</li>' : '')
      + (!r.circuit ? '<li class="warn">没有盐桥 → 内电路断开，无电流 (两个半电池间无离子通路，电荷迅速积累阻止电子流动)；表中电势是理论开路值。</li>' : '') + '</ul>';
    if (r.discharge) {
      const d = r.discharge; h += '<div class="kv cellkv"><div><span>已放电荷</span><b>' + fnum(d.q, 1) + ' C</b></div><div><span>放电时间</span><b>' + fnum(d.t, 0) + ' s</b></div><div><span>输出电功 ∫E dq</span><b>' + fnum(d.W / 1000, 3) + ' kJ</b></div><div><span>终态 E</span><b>' + fnum(d.curve[d.curve.length - 1].E, 4) + ' V</b></div></div>';
      h += '<ul class="reasons"><li>停止原因: ' + d.reason + '</li>' + (d.mass.anode ? '<li>阳极 ' + d.mass.anode.metal + ' 电极质量变化 ' + fnum(d.mass.anode.dm * 1000, 2) + ' mg (n = ' + fnum(d.mass.anode.n * 1000, 3) + ' mmol)；</li>' : '') + (d.mass.cathode ? '<li>阴极 ' + d.mass.cathode.metal + ' 电极质量变化 +' + fnum(d.mass.cathode.dm * 1000, 2) + ' mg (法拉第定律 m = QM/(nF))</li>' : '') + '</ul>';
    }
    el.innerHTML = h;
  }
  function cellColor(c, st) { // 半电池溶液颜色
    const r = EC.BYID[c]; const ox = r.ox.find(s => s.conc && !s.ph), re = r.red.find(s => s.conc);
    let col = [210, 235, 245], a = 0.28; const mix = (sp, conc) => { const ic = D.IONCOLOR[sp]; if (!ic) return; const k = ic[1]; const A = 1 - Math.exp(-k * conc * 0.35); if (A > 0.06) { col = hex2rgb(ic[0]); a = Math.min(0.88, Math.max(a, 0.22 + A * 0.7)); } };
    if (ox) mix(ox.sp, st.cox); if (re && !(ox && D.IONCOLOR[ox.sp] && st.cox > 0.05)) mix(re.sp, st.cred);
    if (c === 'MnO4' && D.IONCOLOR['MnO4-']) mix('MnO4-', st.cox);
    return [col, a];
  }
  function drawCell(t) {
    const cv = $('#cellCanvas'); const g = cv.getContext('2d'); const W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
    const r = cellState.res; const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#0f2231'); grd.addColorStop(1, '#0a1620'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
    if (!r || r.error) return;
    const prog = cellState.playing ? Math.min(1, (t - cellState.t0) / 6000) : cellState.prog; cellState.prog = prog;
    const spec = cellSpec(false); const specs = { left: spec.left, right: spec.right };
    const bx = { left: 70, right: 500 }, bw = 250, by = 105, bh = 170;
    // 放电进度下的浓度 (由曲线插值)
    ['left', 'right'].forEach(side => {
      const cpl = EC.BYID[specs[side].couple]; const st = Object.assign({}, specs[side]);
      if (r.discharge && prog > 0) { const f = r.discharge.final[side]; const ox = f.cox !== undefined ? f : null; if (ox) { st.cox = specs[side].cox + (f.cox - specs[side].cox) * prog; st.cred = specs[side].cred + (f.cred - specs[side].cred) * prog; } }
      const [col, a] = cellColor(cpl.id, st);
      const x = bx[side];
      // 溶液
      g.fillStyle = rgba(col, a); g.fillRect(x + 4, by + 38, bw - 8, bh - 42);
      g.strokeStyle = 'rgba(200,230,255,.75)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, by); g.lineTo(x, by + bh); g.lineTo(x + bw, by + bh); g.lineTo(x + bw, by); g.stroke();
      // 电极
      const isAn = r.anode.side === side; const el = cpl.electrode ? SP[cpl.electrode].col || '#b8643c' : '#c9ccd2';
      const ex = x + bw / 2 - 12; g.fillStyle = el; g.fillRect(ex, by - 36, 24, 36 + bh - 22); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.strokeRect(ex, by - 36, 24, 36 + bh - 22);
      if (r.discharge && r.discharge.mass && cpl.electrode) { const m = isAn ? r.discharge.mass.anode : r.discharge.mass.cathode; if (m) { const sh = Math.min(10, Math.abs(m.dm) * 400) * prog; if (isAn) { g.fillStyle = col.length ? rgba(col, 0.9) : '#000'; g.fillStyle = 'rgba(15,34,49,.92)'; g.fillRect(ex, by + bh - 22 - sh, 24, sh); } else { g.fillStyle = el; g.fillRect(ex - sh / 2, by + bh - 22 - 70, sh / 2, 70); g.fillRect(ex + 24, by + bh - 22 - 70, sh / 2, 70); } } }
      g.fillStyle = '#e8f3fb'; g.font = '14px sans-serif'; g.textAlign = 'center';
      g.fillText(cpl.inert ? (cpl.inert + ' 电极') : (cpl.electrode + ' 电极'), x + bw / 2, by + bh + 22);
      g.fillStyle = isAn ? '#ff8a8a' : '#8ad0ff'; g.font = 'bold 15px sans-serif'; g.fillText(isAn ? '阳极 (−) 氧化' : '阴极 (+) 还原', x + bw / 2, by + bh + 42);
      g.fillStyle = '#9fb7c8'; g.font = '12px sans-serif';
      let lab = cpl.name + '  '; if (cpl.id.match(/^(Mg|Al|Zn|Fe|Ni|Pb|Cu|Ag)$/)) lab += 'c = ' + fnum(st.cox, 4) + ' M'; else lab += (cpl.ox.some(s => s.conc && !s.ph) && cpl.id !== 'SHE' ? 'c(ox)=' + fnum(st.cox, 3) + ' ' : '') + (cpl.red.some(s => s.conc) ? 'c(red)=' + fnum(st.cred, 3) + ' ' : '') + (cpl.hasPH ? 'pH=' + fnum(st.pH, 1) : '');
      g.fillText(lab, x + bw / 2, by + bh + 60);
      // 离子粒子 (动画)
      for (let i = 0; i < 14; i++) { const ph = (t / 2400 + i * 0.173) % 1; const isCat = (side === r.cathode.side); const dir = isCat ? 1 : -1; const mx = side === 'left' ? 1 : -1;
        const px = x + 20 + (bw - 40) * ((i * 37 % 100) / 100); const py = by + 60 + ((i * 53 % 100) / 100) * (bh - 90) + 6 * Math.sin(t / 500 + i);
        g.fillStyle = isCat ? 'rgba(138,208,255,.55)' : 'rgba(255,170,150,.5)'; g.beginPath(); g.arc(px, py, 3, 0, 7); g.fill(); }
    });
    // 盐桥
    const brX1 = bx.left + bw - 30, brX2 = bx.right + 30; g.strokeStyle = r.circuit ? '#e8d9a0' : '#556'; g.lineWidth = 14; g.lineCap = 'round'; g.beginPath(); g.moveTo(brX1, by + 90); g.lineTo(brX1, by - 10); g.lineTo(brX2 - (bx.right + 30 - (bx.right + 30)), by - 10); g.lineTo(brX2, by + 90); g.stroke();
    g.strokeStyle = r.circuit ? '#f6efc9' : '#445'; g.lineWidth = 9; g.beginPath(); g.moveTo(brX1, by + 90); g.lineTo(brX1, by - 10); g.lineTo(brX2, by - 10); g.lineTo(brX2, by + 90); g.stroke();
    g.fillStyle = '#c9b66a'; g.font = '12px sans-serif'; g.textAlign = 'center'; g.fillText('盐桥 (' + (r.bridge === 'none' ? '无' : r.bridge === 'KCl' ? 'KCl' : 'KNO₃') + ')', (brX1 + brX2) / 2, by - 20);
    // 导线与电压表
    const wy = 40; const exL = bx.left + bw / 2, exR = bx.right + bw / 2; g.strokeStyle = '#d6a64a'; g.lineWidth = 3; g.beginPath(); g.moveTo(exL, by - 36); g.lineTo(exL, wy); g.lineTo(exR, wy); g.lineTo(exR, by - 36); g.stroke();
    const vx = (exL + exR) / 2; g.fillStyle = '#10222e'; g.strokeStyle = '#6fd0c0'; g.lineWidth = 3; g.beginPath(); g.arc(vx, wy, 30, 0, 7); g.fill(); g.stroke();
    g.fillStyle = r.E > 0 ? '#6fe0c8' : '#ffb347'; g.font = 'bold 15px monospace'; g.textAlign = 'center'; const Ecur = r.discharge && prog > 0 ? interpE(r.discharge.curve, prog) : r.E; g.fillText(fnum(r.circuit ? Ecur : 0, 3), vx, wy + 2); g.font = '11px sans-serif'; g.fillStyle = '#9fb7c8'; g.fillText('V', vx, wy + 16);
    // 电子 (自阳极到阴极)
    if (r.circuit && r.E > 0) {
      const path = r.anode.side === 'left' ? [[exL, by - 36], [exL, wy], [vx - 30, wy], [vx + 30, wy], [exR, wy], [exR, by - 36]] : [[exR, by - 36], [exR, wy], [vx + 30, wy], [vx - 30, wy], [exL, wy], [exL, by - 36]];
      const segs = []; let tot = 0; for (let i = 0; i + 1 < path.length; i++) { const d = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); segs.push(d); tot += d; }
      for (let k = 0; k < 9; k++) { let s = ((t / 2600) + k / 9) % 1 * tot; let i = 0; while (i < segs.length - 1 && s > segs[i]) { s -= segs[i]; i++; } const f = s / segs[i]; const px = path[i][0] + (path[i + 1][0] - path[i][0]) * f, py = path[i][1] + (path[i + 1][1] - path[i][1]) * f; if (i === 1 || i === 3) { if (Math.abs(px - vx) < 30) continue; }
        g.fillStyle = '#7ad7ff'; g.beginPath(); g.arc(px, py, 4, 0, 7); g.fill(); g.fillStyle = '#04202e'; g.font = 'bold 8px sans-serif'; g.fillText('e', px, py + 3); }
      g.fillStyle = '#7ad7ff'; g.font = '12px sans-serif'; g.textAlign = 'center'; g.fillText('e⁻ 流向 →', (exL + vx) / 2 - 10, wy - 8);
    }
    g.textAlign = 'center'; g.fillStyle = '#ff8a8a'; g.font = 'bold 20px sans-serif'; g.fillText('−', r.anode.side === 'left' ? exL : exR, by - 44); g.fillStyle = '#8ad0ff'; g.fillText('+', r.cathode.side === 'left' ? exL : exR, by - 44);
  }
  function interpE(curve, prog) { const i = Math.min(curve.length - 1, Math.floor(prog * (curve.length - 1))); return curve[i].E; }
  function drawCurve(r) {
    const cv = $('#cellCurve'); const g = cv.getContext('2d'); const W = cv.width, H = cv.height; g.clearRect(0, 0, W, H); g.fillStyle = '#0c1822'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#9fb7c8'; g.font = '12px sans-serif'; g.textAlign = 'left'; g.fillText('放电曲线 E–t (恒流放电；Nernst: 阳极离子浓度升高、阴极离子浓度降低 → E 下降)', 50, 16);
    if (!r || !r.discharge) { g.fillText('点击“▶ 计算 / 放电”查看放电曲线。', 50, 100); return; }
    const c = r.discharge.curve, x0 = 50, x1 = W - 20, y0 = 28, y1 = H - 30; const tmax = c[c.length - 1].t || 1; const Emax = Math.max.apply(null, c.map(p => p.E)) * 1.05, Emin = Math.min(0, Math.min.apply(null, c.map(p => p.E)));
    g.strokeStyle = '#2b4358'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y1); g.lineTo(x1, y1); g.stroke();
    g.fillStyle = '#9fb7c8'; g.textAlign = 'right'; for (let i = 0; i <= 4; i++) { const v = Emin + (Emax - Emin) * i / 4; const y = y1 - (y1 - y0) * i / 4; g.fillText(fnum(v, 3), x0 - 4, y + 4); g.strokeStyle = '#17293a'; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
    g.textAlign = 'center'; for (let i = 0; i <= 4; i++) g.fillText(fnum(tmax * i / 4, 0) + ' s', x0 + (x1 - x0) * i / 4, y1 + 16);
    g.strokeStyle = '#6fe0c8'; g.lineWidth = 2; g.beginPath(); c.forEach((p, i) => { const x = x0 + (x1 - x0) * p.t / tmax, y = y1 - (y1 - y0) * (p.E - Emin) / (Emax - Emin); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
  }
  function cellFrame(t) { cellState.raf = null; if ($('#view-cell').classList.contains('on')) { drawCell(t); cellState.raf = requestAnimationFrame(cellFrame); } }
  $('#cExample').onchange = () => { const e = CEX[+$('#cExample').value]; setHalf('L', e[1].L); setHalf('R', e[1].R); cellCompute(false); };
  ['cL', 'cR'].forEach(id => $('#' + id).onchange = () => { visHalf(id.slice(1)); cellCompute(false); });
  ['cLox', 'cLred', 'cLph', 'cLp', 'cRox', 'cRred', 'cRph', 'cRp', 'cT', 'cBridge', 'cV'].forEach(id => $('#' + id).onchange = () => cellCompute(false));
  $('#cGo').onclick = () => cellCompute(true);
  $('#cSwap').onclick = () => { const a = readHalf('L'), b = readHalf('R'); setHalf('L', [b.couple, b.cox, b.cred, b.pH, b.P]); setHalf('R', [a.couple, a.cox, a.cred, a.pH, a.P]); cellCompute(false); };
  setHalf('L', CEX[0][1].L); setHalf('R', CEX[0][1].R);

  // ==================== 平衡 / 动力学 ====================
  function tube(cv, color, a, level, opts) { // 试管/气管
    const g = cv.getContext('2d'); const W = cv.width, H = cv.height; g.clearRect(0, 0, W, H); opts = opts || {};
    const x0 = W * 0.26, x1 = W * 0.74, top = 8, bot = H - 14; const lv = Math.max(0.05, Math.min(1, level === undefined ? 0.7 : level));
    g.save(); g.beginPath(); g.moveTo(x0, top); g.lineTo(x0, bot - 20); g.quadraticCurveTo(x0, bot, W / 2, bot); g.quadraticCurveTo(x1, bot, x1, bot - 20); g.lineTo(x1, top); g.clip();
    g.fillStyle = 'rgba(210,235,245,.06)'; g.fillRect(x0, top, x1 - x0, bot - top);
    const fy = bot - (bot - top - 6) * lv; g.fillStyle = rgba(color, a); g.fillRect(x0, opts.gas ? top : fy, x1 - x0, bot - (opts.gas ? top : fy));
    if (!opts.gas) { g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x0, fy, x1 - x0, 2); }
    g.restore(); g.strokeStyle = 'rgba(200,230,255,.8)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x0, top); g.lineTo(x0, bot - 20); g.quadraticCurveTo(x0, bot, W / 2, bot); g.quadraticCurveTo(x1, bot, x1, bot - 20); g.lineTo(x1, top); g.stroke();
    if (opts.piston) { const py = top + (bot - top) * (1 - lv); g.fillStyle = '#8a97a3'; g.fillRect(x0 - 3, py - 6, x1 - x0 + 6, 8); g.fillRect(W / 2 - 3, top - 4, 6, py - top); }
  }
  const beer = (eps, c, l) => eps.map(e => Math.pow(10, -e * c * (l || 1)));
  function colorFromEps(base, epsList, concList) { // 吸收光谱简化: 白光 → 透射
    let A = [0, 0, 0]; epsList.forEach((e, i) => { for (let k = 0; k < 3; k++) A[k] += e[k] * concList[i]; });
    const T = A.map(a => Math.pow(10, -a)); const al = 1 - Math.min(T[0], T[1], T[2]) * 0 ; const col = T.map(t => 255 * (0.12 + 0.88 * t)); return [col, Math.min(0.92, 0.2 + (1 - Math.min(...T)) * 0.8)];
  }
  const EQS = {};
  function val(card, k) { return +$('[data-k="' + k + '"]', card).value; }
  function out(card, k, v) { const el = $('[data-o="' + k + '"]', card); if (el) el.textContent = v; }
  // ① Fe-SCN
  EQS.fe = { st: null };
  function eqFe(extra) {
    const card = $('#eqFe'); const a = val(card, 'fe') / 1000, b = val(card, 'scn') / 1000; out(card, 'fe', fnum(a * 1000, 2)); out(card, 'scn', fnum(b * 1000, 2));
    const s0 = EQ.feScn(a, b); let msg = '';
    if (extra) { const pt = EQ.perturb(EQS.fe.st || s0, extra.dFe || 0, extra.dSCN || 0); msg = '<p>扰动瞬间 Q = ' + pt.Q.toExponential(2) + (pt.Q < pt.K ? ' < ' : ' > ') + 'K = ' + pt.K + ' → 平衡向' + (pt.dir === 'right' ? '<b>正向(右)</b>移动: 红色加深' : '<b>逆向(左)</b>移动: 红色变浅') + '。</p>'; EQS.fe.st = pt.eq; renderFe(card, pt.eq, msg); return; }
    EQS.fe.st = s0; renderFe(card, s0, msg);
  }
  function renderFe(card, s, msg) {
    const FeCol = [[10, 120, 500], [200, 1500, 1200]]; const c = colorFromEps(FeCol, [FeCol[0], FeCol[1]].map((x, i) => x), [s.Fe, s.x]); tube($('canvas', card), c[0], c[1], 0.7);
    $('[data-out="fe"]', card).innerHTML = '<p>平衡: [Fe³⁺] = ' + fnum(s.Fe * 1000, 3) + ' mmol/L，[SCN⁻] = ' + fnum(s.SCN * 1000, 3) + ' mmol/L，[FeSCN²⁺] = <b>' + fnum(s.x * 1000, 3) + ' mmol/L</b></p><p>K = [FeSCN²⁺]/([Fe³⁺][SCN⁻]) = ' + fnum(s.x / (s.Fe * s.SCN), 1) + ' (理论 890 L/mol)；吸光度 ∝ [FeSCN²⁺]。</p>' + (msg || '');
  }
  // ② Cr
  function eqCr() { const card = $('#eqCr'); const pH = val(card, 'ph'), C = val(card, 'c') / 1000; out(card, 'ph', fnum(pH, 1)); out(card, 'c', fnum(C * 1000, 0)); const r = EQ.chromate(C, pH);
    const epsCr = [[3, 25, 500], [10, 80, 1200]]; const cc = colorFromEps(epsCr, [epsCr[0], epsCr[1]], [r.CrO4 * 0.9, r.Cr2O7 * 0.9]);
    tube($('canvas', card), cc[0], cc[1], 0.7); const mid = EQ.chromateMidpoint(C);
    $('[data-out="cr"]', card).innerHTML = '<p>[CrO₄²⁻] = ' + fnum(r.CrO4 * 1000, 3) + ' mmol/L (黄)，[Cr₂O₇²⁻] = ' + fnum(r.Cr2O7 * 1000, 3) + ' mmol/L (橙)；Cr(VI) 中重铬酸根占 <b>' + fnum(r.fracDichromate * 100, 1) + '%</b></p><p>K = [Cr₂O₇²⁻]/([CrO₄²⁻]²[H⁺]²) = ' + EQ.K_CR.toExponential(1) + '；该浓度下 pH ≈ ' + fnum(mid, 2) + ' 时各占一半。加酸(H⁺↑)平衡右移 → 橙色；加碱 OH⁻ 消耗 H⁺ → 左移 → 黄色。</p>'; }
  // ③ NO2
  function eqNo() { const card = $('#eqNo'); const T = val(card, 'T'), P = val(card, 'P'); out(card, 'T', fnum(T, 0)); out(card, 'P', fnum(P, 1)); const r = EQ.no2(T, P), kp = EQ.kpN2O4(T);
    const dens = r.pNO2 / 1; const a = Math.min(0.92, 0.04 + dens * 0.5); const Vrel = (1 + r.alpha) * (T + 273.15) / 298.15 / P / (1.19); const lv = Math.max(0.2, Math.min(0.98, 0.7 * Vrel));
    tube($('canvas', card), [165, 78, 22], a * (P > 0 ? 1 : 1), lv, { gas: true, piston: true });
    $('[data-out="no"]', card).innerHTML = '<p>Kp = exp(−ΔG/RT) = <b>' + fnum(kp.Kp, 3) + '</b> (ΔH = +' + fnum(kp.dH, 1) + ' kJ，ΔS = +' + fnum(kp.dS, 1) + ' J/K，ΔG = ' + fnum(kp.dG, 2) + ' kJ)</p><p>解离度 α = <b>' + fnum(r.alpha * 100, 1) + '%</b>；p(NO₂) = ' + fnum(r.pNO2, 3) + ' atm，p(N₂O₄) = ' + fnum(r.pN2O4, 3) + ' atm。升温 → 吸热方向(生成 NO₂)，颜色变深；加压(体积缩小) → 气体分子数减少的方向(N₂O₄)，瞬间变深后逐渐变浅。</p>'; }
  // ④ Cu-Cl
  function eqCu() { const card = $('#eqCu'); const Cl = val(card, 'cl'), Cu = val(card, 'cu'); out(card, 'cl', fnum(Cl, 1)); out(card, 'cu', fnum(Cu, 2)); const r = EQ.cuCl(Cu, Cl);
    const blue = [60, 170, 230], green = [190, 200, 40]; const col = blue.map((b, i) => b * (1 - r.frac) + green[i] * r.frac); tube($('canvas', card), col, Math.min(0.9, 0.2 + Cu * 1.3), 0.7);
    $('[data-out="cu"]', card).innerHTML = '<p>[Cu(H₂O)₆²⁺] = ' + fnum(r.Cu, 4) + ' mol/L (蓝)，[CuCl₄²⁻] = ' + fnum(r.CuCl4, 4) + ' mol/L (黄绿)；CuCl₄²⁻ 占 <b>' + fnum(r.frac * 100, 1) + '%</b> (K ≈ ' + EQ.K_CUCL + ' 为近似值)。</p><p>提高 [Cl⁻] (浓盐酸) → 向 CuCl₄²⁻ 移动，蓝→绿→黄绿；加水稀释使 [Cl⁻]⁴ 项骤降，平衡逆向 → 重新变蓝。该配位反应吸热，加热也使颜色偏绿(定性)。</p>'; }
  // ⑤ clock
  function eqClock() { const card = $('#eqClock'); const s = val(card, 's') / 1000, i = val(card, 'i') / 1000, t = val(card, 't') / 1000, T = val(card, 'T'); out(card, 's', fnum(s * 1000, 0)); out(card, 'i', fnum(i * 1000, 0)); out(card, 't', fnum(t * 1000, 1)); out(card, 'T', fnum(T, 0));
    const p = { S2O8: s, I: i, S2O3: t, T }; const c = EQ.clock(s, i, t, T); const tEnd = Math.max(c.tClock * 1.8, 10); const tr = EQ.clockTrace(p, tEnd, 120);
    const cv = $('#clockCv'); const g = cv.getContext('2d'); const W = cv.width, H = cv.height; g.clearRect(0, 0, W, H); g.fillStyle = '#0c1822'; g.fillRect(0, 0, W, H);
    const x0 = 46, x1 = W - 14, y0 = 14, y1 = H - 30; g.strokeStyle = '#2b4358'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y1); g.lineTo(x1, y1); g.stroke();
    const ymax = Math.max(t, 1e-9) * 1.1; const X = tt => x0 + (x1 - x0) * tt / tEnd, Y = v => y1 - (y1 - y0) * v / ymax;
    g.strokeStyle = '#6fd0ff'; g.lineWidth = 2; g.beginPath(); tr.pts.forEach((q, k) => { const x = X(q.t), y = Y(q.S2O3); if (k) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
    g.strokeStyle = '#ff9e4a'; g.beginPath(); tr.pts.forEach((q, k) => { const x = X(q.t), y = Y(Math.min(q.I2, ymax)); if (k) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
    g.setLineDash([4, 4]); g.strokeStyle = '#6fe0c8'; g.beginPath(); g.moveTo(X(c.tClock), y0); g.lineTo(X(c.tClock), y1); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#9fb7c8'; g.font = '11px sans-serif'; g.textAlign = 'center'; for (let k = 0; k <= 4; k++) g.fillText(fnum(tEnd * k / 4, 0) + ' s', X(tEnd * k / 4), y1 + 14); g.textAlign = 'left'; g.fillStyle = '#6fd0ff'; g.fillText('[S₂O₃²⁻]', x0 + 6, y0 + 10); g.fillStyle = '#ff9e4a'; g.fillText('[I₂] (游离，使淀粉变蓝)', x0 + 70, y0 + 10); g.fillStyle = '#6fe0c8'; g.fillText('t(变色) = ' + fnum(c.tClock, 1) + ' s', Math.min(X(c.tClock) + 4, W - 100), y1 - 8);
    const c10 = EQ.clock(s, i, t, T + 10), cDbl = EQ.clock(s * 2, i, t, T), cI = EQ.clock(s, i * 2, t, T);
    $('[data-out="clock"]', card).innerHTML = '<p>v = k[S₂O₈²⁻][I⁻] = ' + c.v.toExponential(2) + ' mol/(L·s)，k(' + fnum(T, 0) + ' °C) = ' + c.k.toExponential(2) + ' L/(mol·s) (Ea = ' + (c.Ea / 1000) + ' kJ/mol, 教学近似参数)</p><p>S₂O₃²⁻ 先把生成的 I₂ 还原回 I⁻，耗尽时(<b>t = [S₂O₃²⁻]₀/(2v) = ' + fnum(c.tClock, 1) + ' s</b>)游离 I₂ 突然出现使淀粉溶液变蓝黑。对照: 升温 10 °C → ' + fnum(c10.tClock, 1) + ' s (×' + fnum(c10.tClock / c.tClock, 2) + '，Arrhenius)；[S₂O₈²⁻] 加倍 → ' + fnum(cDbl.tClock, 1) + ' s；[I⁻] 加倍 → ' + fnum(cI.tClock, 1) + ' s (各级数为 1 → 时间减半)。</p>'; }
  // ⑥ photochem
  function photoTable() {
    const th = (react, prod) => { let dH = 0; for (const k in prod) dH += prod[k] * SP[k].H; for (const k in react) dH -= react[k] * SP[k].H; return dH; };
    const rows = [
      ['2 AgCl → 2 Ag + Cl₂', th({ AgCl: 2 }, { Ag: 2, Cl2: 1 }), '黑暗中稳定；光子使 Ag⁺ 得电子析出银原子簇(照相潜影)，表面由白变灰紫/黑。(“光照”选项 + AgCl 沉淀可在实验台演示)'],
      ['2 AgBr → 2 Ag + Br₂', th({ AgBr: 2 }, { Ag: 2, Br2: 1 }), 'AgBr 对可见光更灵敏 → 照相感光材料；显影放大潜影，定影用 Na₂S₂O₃ 溶解未曝光 AgBr。'],
      ['C₆H₁₄ + Br₂ --hν→ C₆H₁₃Br + HBr', null, '自由基链式取代: 光使 Br–Br(193 kJ/mol) 均裂；暗处不反应；烯烃则无需光照即与 Br₂ 加成。(实验台可演示)'],
      ['H₂ + Cl₂ --hν→ 2 HCl', th({ H2: 1, Cl2: 1 }, { 'HCl(g)': 2 }), '热力学强放热、光引发的支链自由基反应(量子产率 10⁴–10⁶)，混合物遇强光/火花会爆炸。<b>仅作理论判断</b>: 涉及爆炸性气体混合物与毒性气体，本模拟器不提供该组合的反应模拟 (返回“不支持”)。'],
      ['2 H₂O₂ --hν→ 2 H₂O + O₂', th({ 'H2O2(aq)': 2 }, { H2O: 2, O2: 1 }), '紫外光/热均加速分解，故双氧水用棕色瓶避光保存 (ΔH<0 ，热力学本就不稳定)。'],
    ];
    $('#photoTbl').innerHTML = '<table class="tbl"><tr><th>反应</th><th>ΔH (kJ)</th><th>说明</th></tr>' + rows.map(r => '<tr><td>' + r[0] + '</td><td>' + (r[1] === null ? '—' : (r[1] > 0 ? '+' : '') + fnum(r[1], 1)) + '</td><td>' + r[2] + '</td></tr>').join('') + '</table><p class="muted small">光化学反应的“能量来源”是光子 (E = hc/λ)；ΔG>0 的反应(如 AgX 光解)需要光驱动，而 ΔG<0 的链反应只需光引发。</p>';
  }
  function eqAll() { eqFe(); eqCr(); eqNo(); eqCu(); eqClock(); }
  $$('#eqFe [data-k]').forEach(i => i.oninput = () => eqFe());
  $$('#eqFe [data-add]').forEach(b => b.onclick = () => { const a = b.dataset.add; const s = EQS.fe.st || EQ.feScn(val($('#eqFe'), 'fe') / 1000, val($('#eqFe'), 'scn') / 1000); if (a === 'Fe') eqFe({ dFe: (s.Fe + s.x) * 0.5 }); else if (a === 'SCN') eqFe({ dSCN: (s.SCN + s.x) * 0.5 }); else eqFe({ dFe: -s.Fe * 0.5 }); });
  $$('#eqCr [data-k]').forEach(i => i.oninput = eqCr); $$('#eqNo [data-k]').forEach(i => i.oninput = eqNo); $$('#eqCu [data-k]').forEach(i => i.oninput = eqCu); $$('#eqClock [data-k]').forEach(i => i.oninput = eqClock);
  photoTable();

  eqAll(); if ($('#view-cell').classList.contains('on')) cellCompute(false);

  // ==================== 说明补充 ====================
  $('#aboutBox').insertAdjacentHTML('beforeend', '<h3>扩展反应类型 (第二批)</h3><ul>'
    + '<li><b>有机</b>: SN1/SN2 取代、E1/E2 消除、Williamson 醚合成、烯烃加成(Br₂ 水、HBr、水合平衡、催化氢化)、Baeyer 试验、醇/醛氧化(E° 判据)、Tollens/斐林试验、碘仿反应、Lucas 试验、Claisen–Schmidt 羟醛缩合、油脂皂化与皂垢、Fischer 酯化变体、酰胺(乙酰苯胺、尼龙-66)、苯溴代(FeBr₃)与烷烃光溴代、苯乙烯自由基聚合、聚苯乙烯溶解、甲苯侧链氧化。</li>'
    + '<li><b>电化学</b>: “原电池”页(E°cell、Nernst、ΔG、K、最大电功、放电曲线、浓差电池)；实验台“电解/电镀”支持铜/银/镍/锌活性阳极、法拉第定律与镀层厚度；吸氧腐蚀与牺牲阳极。</li>'
    + '<li><b>无机</b>: 歧化(I₂/OH⁻、Cu₂O/H⁺、S₂O₃²⁻/H⁺)、碘量反应、氧化物还原(铝热型仅作热力学判断)、水合盐脱水、焰色试验、配合物变色(Ni(NH₃)₆²⁺、CuCl₄²⁻、FeSCN²⁺)、光化学(AgX 变暗、烷烃光溴代)。</li>'
    + '<li><b>平衡·动力学</b>页: Fe³⁺/SCN⁻、CrO₄²⁻/Cr₂O₇²⁻(pH)、N₂O₄/NO₂(温度与压强, 由 ΔfH°、S° 经 van’t Hoff 得 Kp)、Cu²⁺/Cl⁻ 与碘钟动力学。</li></ul>'
    + '<p class="warn">范围限制不变: 硝化(HNO₃ + 有机物)、含氨/丙酮/甲苯的溴代等危险或违规组合一律返回“不支持”；苯的硝化因属硝基化合物(含炸药前体)路线而不收录，仅提供溴代作为芳香亲电取代的示例。含近似 ΔfH° 的物种会在结果中标注，缺少数据的热效应显示为“—”而不编造。</p>');
})();
