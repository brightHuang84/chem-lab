/* 虚拟化学实验室 —— 反应规则与主流程 (依赖 engine.js 的基础库) */
(function (g) {
  'use strict';
  const B = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./engine.js') : g.__EngineBase;
  const { D, SP, REAGBY, dispId, plain, intify, eqHTML, interp, fnum, computePH, speciation, solutionColor, colorName, indicatorColor, solveEq, Ctx, buildLedger, excessH2SO4, checkBlocked, CNAME, GASINFO, waterGrams, R_GAS, FARA } = B;
  const sup = D.fmt;
  function nm(id) { return SP[id] ? SP[id].cn : id; }
  const F2 = id => D.fmt(id.replace(/\((aq|g|s|l)\)$/, ''));

  const DISSOF = {}; D.REAG.forEach(r => { if (r.diss && r.sp && (r.form === 's' || r.form === 'l')) DISSOF[r.sp] = r; });

  // ============ 规则: 溶解 ============
  function rDissolve(ctx) {
    if (!ctx.aq()) return false; let ch = false;
    ctx.dis = ctx.dis || {};
    for (const sp in DISSOF) {
      const n = ctx.n(sp); if (n < 1e-12) continue;
      const r = DISSOF[sp]; let nmax = n;
      if (SP[sp].ph === 's') {
        const s = r.sol ? interp(r.sol, ctx.T) : null; if (s === null) continue;
        nmax = s * waterGrams(ctx.L) / 100 / SP[sp].M - (ctx.dis[sp] || 0);
        if (nmax < 1e-12) continue;
      }
      const x = Math.min(n, nmax); if (x < 1e-12) continue;
      const done = ctx.rxn({ type: '溶解', name: r.name + ' 溶解', react: { [sp]: 1 }, prod: Object.assign({}, r.diss), x, minor: true, why: '固体溶于水(受溶解度限制)' });
      if (done > 0) { ctx.dis[sp] = (ctx.dis[sp] || 0) + done; ctx.src = ctx.src || {}; for (const id in r.diss) { (ctx.src[id] = ctx.src[id] || []); if (!ctx.src[id].includes(r.id)) ctx.src[id].push(r.id); } ch = true; if (SP[sp].ph === 's' && ctx.n(sp) > 1e-9) ctx.notes.push(r.name + ' 在 ' + fnum(ctx.T, 0) + ' °C 下已饱和 (溶解度 ' + fnum(interp(r.sol, ctx.T), 1) + ' g/100 g 水)，剩余 ' + fnum(ctx.n(sp) * SP[sp].M, 3) + ' g 未溶解'); }
    }
    return ch;
  }
  function rCaO(ctx) {
    if (!ctx.aq() || ctx.n('CaO') < 1e-10) return false;
    const x = ctx.rxn({ type: '氧化物与水', name: '生石灰消解', react: { CaO: 1, H2O: 1 }, prod: { 'Ca(OH)2': 1 }, why: '碱性氧化物 + 水 → 碱 (ΔH 由生成焓计算, 强放热)', ph: [{ k: 'steam' }, { k: 'heat' }] });
    if (x > 0) ctx.hz('生石灰遇水剧烈放热，可使水沸腾飞溅'); return x > 0;
  }
  function rCuI(ctx) {
    if (!ctx.aq()) return false;
    const x = Math.min(ctx.n('Cu^2+') / 2, ctx.n('I-') / 4); if (x < 1e-10) return false;
    return ctx.rxn({ type: '氧化还原+沉淀', name: 'Cu²⁺ 氧化 I⁻', react: { 'Cu^2+': 2, 'I-': 4 }, prod: { CuI: 2, I2: 1 }, x, why: 'E°(Cu²⁺/CuI)=+0.86 V > E°(I₂/I⁻)=+0.54 V → E°cell=+0.32 V >0；CuI 极难溶(Ksp=1.3×10⁻¹²)进一步推动反应', ph: [{ k: 'color', note: '生成白色 CuI 沉淀并析出棕色(碘)' }] }) > 0;
  }
  function rAirOxid(ctx) {
    const n = ctx.n('Fe(OH)2');
    if (!ctx.aq() || ctx.atm !== 'air' || n < 1e-10) return false;
    ctx.add('O2', n / 4);
    const x = ctx.rxn({ type: '氧化还原', name: 'Fe(OH)₂ 被空气氧化', react: { 'Fe(OH)2': 4, O2: 1, H2O: 2 }, prod: { 'Fe(OH)3': 4 }, x: n / 4, why: 'E°(O₂/OH⁻)=+0.40 V ≫ E°(Fe(OH)₃/Fe(OH)₂)=−0.56 V → E°cell≈+0.96 V >0，自发；白色沉淀迅速变灰绿，最终红褐色', ph: [{ k: 'color', note: '白色 → 灰绿色 → 红褐色' }] });
    ctx.add('O2', -ctx.n('O2')); if (x > 0) ctx.airUsed = (ctx.airUsed || 0) + x;
    return x > 0;
  }
  const _rxnOrig = Ctx.prototype.rxn;

  // ============ 规则: 氧化还原 ============
  function halfOf(h) { const k = Object.keys(h.lhs).filter(x => x !== 'H+' && x !== 'H2O' && x !== 'OH-')[0] || 'H+'; const r = Object.keys(h.rhs).filter(x => x !== 'H+' && x !== 'H2O' && x !== 'OH-')[0] || 'H2O'; return k + '/' + r; }
  function halfName(h) { const a = Object.keys(h.lhs).filter(x => x !== 'H+' && x !== 'H2O')[0] || 'H+'; const b = Object.keys(h.rhs).filter(x => x !== 'H+' && x !== 'H2O')[0] || 'H2O'; return D.fmt(a.replace(/\((aq|g)\)$/, '')) + ' / ' + D.fmt(b.replace(/\((aq|g)\)$/, '')); }
  function lcm(a, b) { return a * b / (function g_(x, y) { return y ? g_(y, x % y) : x; })(a, b); }
  function Ered(h, pH) { const m = h.lhs['H+'] || 0; return h.E0 - 0.05916 * m / h.n * pH; }
  const NOR = new Set(['MnO4/Mn2', 'MnO4/MnO2', 'Cr2O7/Cr3', 'NO3/NO', 'NO3/NO2', 'SO4/SO2', 'H2O2/H2O', 'H+/H2']);

  function rRedox(ctx) {
    if (!ctx.aq()) return false;
    const pH = ctx.pH(); const info = { pH, T: ctx.T, cNO3: ctx.cNO3(), cSO4: ctx.cSO4() };
    const present = id => SP[id] && SP[id].ph !== 'g' && ctx.n(id) > 1e-9;
    const skipSp = k => k === 'H+' || k === 'H2O' || k === 'OH-';
    const hasProtons = ctx.availProtons(6) > 1e-9;
    const halves = D.HALF.slice();
    // 两性金属 → 羟基配合物 (强碱)
    Object.keys(D.AMPHO).forEach(m => {
      const a = D.AMPHO[m]; if (pH < a.minpH - 0.01 || ctx.n('OH-') < 1e-9 && pH < a.minpH) return;
      const pOH = 14 - pH;
      halves.push({ id: 'AMPH/' + m, lhs: a.prod, rhs: { [m]: 1, 'OH-': a.ohs }, n: a.n, E0: a.E14 + 0.05916 * a.ohs / a.n * pOH, E0fixed: true, onlyR: true, metal: m, amph: true });
    });
    const oxs = [], reds = [];
    halves.forEach(h => {
      const E = h.amph ? h.E0 : Ered(h, pH);
      if (!h.onlyR) {
        let ok = true;
        for (const k in h.lhs) { if (skipSp(k)) continue; if (!present(k)) { ok = false; break; } }
        if (h.id === 'O2/H2O2') ok = false;
        if (ok && h.condO && !h.condO(info)) ok = false;
        if (ok && h.lhs['H+'] && pH < 7 && !hasProtons) ok = false;
        if (ok) oxs.push({ h, E });
      }
      if (!h.onlyO && !NOR.has(h.id)) {
        let ok = true;
        for (const k in h.rhs) { if (skipSp(k)) continue; if (!present(k)) { ok = false; break; } }
        if (ok && h.condR && !h.condR(info)) { if (h.noteR) ctx.denied(h.noteR); ok = false; }
        if (ok) reds.push({ h, E });
      }
    });
    const cands = [];
    oxs.forEach(o => reds.forEach(r => {
      if (o.h.id === r.h.id) return;
      // 同一物种互为氧化剂/还原剂 → 歧化/归中，交由分解规则
      const oSp = Object.keys(o.h.lhs).filter(k => !skipSp(k)), rSp = Object.keys(r.h.rhs).filter(k => !skipSp(k));
      if (oSp.some(k => rSp.includes(k))) return;
      const Ecell = o.E - r.E;
      const mname = r.h.metal; const meta = mname ? D.METALS[mname] : null;
      // 动力学/钝化门控
      if ((r.h.needStrong || r.h.id === 'CO2/C2O4' || r.h.id.startsWith('CO2/')) && !o.h.strong) return;
      if (meta) {
        if (meta.water === 'rapid' && o.h.id !== 'H+/H2') return; // 碱金属先与水反应
        if (o.h.id === 'H+/H2') {
          if (!r.h.amph && pH >= 6) {
            if (meta.water === 'hot') { if (ctx.T < 70) { if (Ecell > 0.05) ctx.denied(nm(mname) + ' 与冷水反应极慢(表面氧化膜)，加热(≥70 °C)可反应', '*'); return; } }
            else if (meta.water === 'film' || meta.water === 'none') { if (Ecell > 0.05 && meta.water === 'film') ctx.denied(nm(mname) + ' 虽然 E° 较负，但表面致密氧化膜/氢氧化物膜使其在中性水中几乎不反应(动力学钝化)', '*'); return; }
          } else if (!r.h.amph && meta.coat && (ctx.n('Cl-') > 1e-6 || ctx.cSO4() > 0.01)) { ctx.denied('铅在稀盐酸/稀硫酸中表面生成难溶 PbCl₂/PbSO₄ 覆盖层，反应迅速停止(钝化)', mname); return; }
        }
        if (meta.passiv && ((o.h.id === 'NO3/NO2' && ctx.T < 80) || (o.h.id === 'SO4/SO2' && ctx.T < 100))) { ctx.denied(nm(mname) + ' 在冷的浓硝酸/浓硫酸中钝化(表面致密氧化膜)', mname); return; }
      }
      if (r.h.amph && o.h.id !== 'H+/H2') return;
      if (Ecell > 0.05) cands.push({ o, r, Ecell });
    }));
    cands.sort((a, b) => b.Ecell - a.Ecell);
    for (const c of cands) { if (execRedox(ctx, c.o, c.r, c.Ecell, pH)) return true; }
    return false;
  }
  function execRedox(ctx, o, r, Ecell, pH) {
    const n_o = o.h.n, n_r = r.h.n; const Lc = lcm(n_o, n_r), a = Lc / n_o, b = Lc / n_r;
    const react = {}, prod = {};
    const addTo = (m, k, c) => { m[k] = (m[k] || 0) + c; };
    for (const k in o.h.lhs) addTo(react, k, a * o.h.lhs[k]); for (const k in o.h.rhs) addTo(prod, k, a * o.h.rhs[k]);
    for (const k in r.h.rhs) addTo(react, k, b * r.h.rhs[k]); for (const k in r.h.lhs) addTo(prod, k, b * r.h.lhs[k]);
    const cancel = () => { Object.keys(react).forEach(k => { if (k in prod) { const m = Math.min(react[k], prod[k]); react[k] -= m; prod[k] -= m; } }); Object.keys(react).forEach(k => { if (react[k] < 1e-12) delete react[k]; }); Object.keys(prod).forEach(k => { if (prod[k] < 1e-12) delete prod[k]; }); };
    cancel();
    let basic = false;
    if (pH >= 7 && react['H+']) { const m = react['H+']; delete react['H+']; addTo(react, 'H2O', m); addTo(prod, 'OH-', m); cancel(); basic = true; }
    let x = Infinity;
    for (const k in react) { if (k === 'H2O') continue; if (k === 'H+') continue; x = Math.min(x, ctx.n(k) / react[k]); }
    if (react['H2O']) x = Math.min(x, ctx.n('H2O') / react['H2O']);
    if (react['H+']) x = Math.min(x, ctx.availProtons(6) / react['H+']);
    if (!isFinite(x) || x < 1e-10) return false;
    // 质子来源: H+ 以及酸性足够的弱酸
    const finalReact = Object.assign({}, react), finalProd = Object.assign({}, prod);
    if (react['H+']) {
      const need = react['H+'] * x; const { plan } = ctx.drawProtons(need, 6); delete finalReact['H+'];
      plan.forEach(p => { const u = p.amt / x; if (p.a === 'H+') { finalReact['H+'] = (finalReact['H+'] || 0) + u; } else { finalReact[p.a] = (finalReact[p.a] || 0) + u; if (p.w) finalReact['H2O'] = (finalReact['H2O'] || 0) + p.w * u; finalProd[p.b] = (finalProd[p.b] || 0) + u; } });
      Object.keys(finalReact).forEach(k => { if (k in finalProd) { const m = Math.min(finalReact[k], finalProd[k]); finalReact[k] -= m; finalProd[k] -= m; } });
    }
    // 从空气补充 O2 不在此处理
    const nTot = Lc; const dG = -nTot * 96.485 * Ecell;
    const why = 'E°(氧化剂 ' + halfName(o.h) + ')' + (o.h.lhs['H+'] ? '(pH=' + fnum(pH, 2) + ')' : '') + ' = ' + (o.E >= 0 ? '+' : '') + fnum(o.E, 3) + ' V；E°(还原剂 ' + halfName(r.h) + ') = ' + (r.E >= 0 ? '+' : '') + fnum(r.E, 3) + ' V → E°cell = ' + fnum(Ecell, 3) + ' V > 0，转移 ' + nTot + ' e⁻，ΔG = −nFE = ' + fnum(dG, 1) + ' kJ (每式)' + (o.h.note ? '；' + o.h.note : '');
    const ph = [];
    const metal = r.h.metal;
    const ox = o.h.id;
    if (metal && (ox === 'H+/H2')) ph.push({ k: 'bubbles', gas: 'H2' });
    if (metal && D.METALS[metal].water === 'rapid') { ph.push({ k: 'flame', metal }); ph.push({ k: 'heat' }); }
    if (ox === 'NO3/NO2' || ox === 'NO3/NO') ph.push({ k: 'bubbles', gas: ox === 'NO3/NO2' ? 'NO2' : 'NO' });
    if (ox === 'SO4/SO2') ph.push({ k: 'bubbles', gas: 'SO2' });
    if (r.h.id === 'O2/H2O2') ph.push({ k: 'bubbles', gas: 'O2' });
    if (r.h.id.startsWith('CO2/')) ph.push({ k: 'bubbles', gas: 'CO2' });
    if (metal === 'Cu' || ox === 'M/Cu') ph.push({ k: 'deposit' });
    return ctx.rxn({ type: '氧化还原', name: '氧化还原: ' + halfName(r.h) + ' ← ' + halfName(o.h), react: finalReact, prod: finalProd, x, why, ph, note: basic ? '碱性/中性介质: 质子由水提供' : '', eo: o.E, er: r.E, Ecell, nTransfer: nTot }) > 0;
  }
  Ctx.prototype.denied = function (s, key) { this._denied = this._denied || []; if (!this._denied.some(d => d.s === s)) this._denied.push({ s, key: key || null }); };

  // ============ 规则: 酸碱质子转移 ============
  function rAcidBase(ctx) {
    if (!ctx.aq()) return false; let any = false;
    for (let it = 0; it < 60; it++) {
      const donors = [], accs = [];
      if (ctx.n('H+') > 1e-12) donors.push({ id: 'H+', b: null, w: 0, pKa: -1.74 });
      D.SYSTEMS.forEach(sys => {
        if (sys.hyd) return;
        for (let i = 0; i < sys.forms.length - 1; i++) {
          const a = sys.forms[i], b = sys.forms[i + 1];
          if (ctx.n(a) > 1e-12 && SP[a].ph !== 'g') donors.push({ id: a, b, w: sys.w[i], pKa: sys.pKa[i] });
          if (ctx.n(b) > 1e-12) accs.push({ id: b, a, wa: sys.w[i], pKaConj: sys.pKa[i], gas: !!(sys.gas && sys.gas[i]) });
        }
      });
      if (ctx.n('OH-') > 1e-12) accs.push({ id: 'OH-', a: 'H2O', wa: 0, pKaConj: 15.74, gas: false });
      let best = null;
      donors.forEach(d => accs.forEach(a => {
        if (d.id === a.id) return;
        const K = Math.pow(10, a.pKaConj - d.pKa);
        const ok = K >= 1e4 || (a.gas && K >= 0.05);
        if (ok && (!best || K > best.K)) best = { d, a, K };
      }));
      if (!best) break;
      const { d, a, K } = best;
      const x = Math.min(ctx.n(d.id), ctx.n(a.id)); if (x < 1e-12) break;
      const react = {}, prod = {};
      const add = (m, k, c) => { m[k] = (m[k] || 0) + c; };
      add(react, d.id, 1); add(react, a.id, 1); if (d.w) add(react, 'H2O', d.w);
      if (d.b) add(prod, d.b, 1); add(prod, a.a, 1); if (a.wa) add(prod, 'H2O', a.wa);
      Object.keys(react).forEach(k => { if (k in prod) { const m = Math.min(react[k], prod[k]); react[k] -= m; prod[k] -= m; } });
      Object.keys(react).forEach(k => { if (react[k] < 1e-12) delete react[k]; }); Object.keys(prod).forEach(k => { if (prod[k] < 1e-12) delete prod[k]; });
      const strongBoth = (d.id === 'H+' && a.id === 'OH-');
      const why = strongBoth ? 'H⁺ + OH⁻ → H₂O，K = 1/Kw = 1.0×10¹⁴ ≫ 1，完全反应' : '质子转移: 酸 ' + D.fmt(d.id.replace(/\((aq)\)$/, '')) + ' (pKa=' + (d.id === 'H+' ? '≈−1.7' : fnum(d.pKa, 2)) + ') + 碱 ' + D.fmt(a.id.replace(/\((aq)\)$/, '')) + ' (共轭酸 pKa=' + fnum(a.pKaConj, 2) + ') → K = 10^(' + fnum(a.pKaConj, 2) + ' − ' + (d.id === 'H+' ? '(−1.7)' : fnum(d.pKa, 2)) + ') = ' + K.toExponential(1) + (a.gas && K < 1e4 ? '，且气体逸出使平衡右移' : '，K ≫ 1，近似完全');
      const done = ctx.rxn({ type: '酸碱反应', name: '酸碱: ' + D.fmt(d.id.replace(/\((aq)\)$/, '')) + ' + ' + D.fmt(a.id.replace(/\((aq)\)$/, '')), react, prod, x, why, ph: [{ k: 'heat' }], tol: 1e-12 });
      if (done <= 0) break; any = true;
    }
    return any;
  }
  function rChromate(ctx) {
    if (!ctx.aq()) return false; let ch = false;
    const hAv = ctx.availProtons(5);
    if (ctx.n('CrO4^2-') > 1e-10 && hAv > 1e-10) {
      const x = Math.min(ctx.n('CrO4^2-') / 2, hAv / 2); const { plan } = ctx.drawProtons(2 * x, 5);
      const react = { 'CrO4^2-': 2 }, prod = { 'Cr2O7^2-': 1, 'H2O': 1 };
      plan.forEach(p => { const u = p.amt / x; if (p.a === 'H+') react['H+'] = (react['H+'] || 0) + u; else { react[p.a] = (react[p.a] || 0) + u; if (p.w) react['H2O'] = (react['H2O'] || 0) + p.w * u; prod[p.b] = (prod[p.b] || 0) + u; } });
      Object.keys(react).forEach(k => { if (k in prod) { const m = Math.min(react[k], prod[k]); react[k] -= m; prod[k] -= m; } });
      if (ctx.rxn({ type: '酸碱/平衡', name: 'CrO₄²⁻ → Cr₂O₇²⁻', react, prod, x, why: '2CrO₄²⁻ + 2H⁺ ⇌ Cr₂O₇²⁻ + H₂O，酸性介质(pH<~6)中重铬酸根占优', ph: [{ k: 'color', note: '黄色→橙红色' }] }) > 0) ch = true;
    }
    if (ctx.n('Cr2O7^2-') > 1e-10 && ctx.n('OH-') > 1e-10) {
      const x = Math.min(ctx.n('Cr2O7^2-'), ctx.n('OH-') / 2);
      if (ctx.rxn({ type: '酸碱/平衡', name: 'Cr₂O₇²⁻ → CrO₄²⁻', react: { 'Cr2O7^2-': 1, 'OH-': 2 }, prod: { 'CrO4^2-': 2, 'H2O': 1 }, x, why: 'Cr₂O₇²⁻ + 2OH⁻ ⇌ 2CrO₄²⁻ + H₂O，碱性介质中铬酸根占优', ph: [{ k: 'color', note: '橙红色→黄色' }] }) > 0) ch = true;
    }
    return ch;
  }
  // 难溶固体与酸反应
  function acidDissolve(ctx, solid, cat, nc, nAcid, prodExtra, pKaMax, label, gate) {
    const n = ctx.n(solid); if (n < 1e-10) return false;
    if (gate && !gate(ctx)) return false;
    const av = ctx.availProtons(pKaMax); const x = Math.min(n, av / nAcid); if (x < 1e-10) return false;
    const { plan } = ctx.drawProtons(nAcid * x, pKaMax);
    const react = { [solid]: 1 }, prod = { [cat]: nc };
    for (const k in prodExtra) prod[k] = (prod[k] || 0) + prodExtra[k];
    plan.forEach(p => { const u = p.amt / x; if (p.a === 'H+') react['H+'] = (react['H+'] || 0) + u; else { react[p.a] = (react[p.a] || 0) + u; if (p.w) react['H2O'] = (react['H2O'] || 0) + p.w * u; prod[p.b] = (prod[p.b] || 0) + u; } });
    Object.keys(react).forEach(k => { if (k in prod) { const m = Math.min(react[k], prod[k]); react[k] -= m; prod[k] -= m; } });
    Object.keys(react).forEach(k => { if (react[k] < 1e-12) delete react[k]; }); Object.keys(prod).forEach(k => { if (prod[k] < 1e-12) delete prod[k]; });
    const gas = prodExtra['CO2(aq)'] ? 'CO2' : (prodExtra['H2S(aq)'] ? 'H2S' : null);
    return ctx.rxn({ type: '酸与难溶固体', name: label, react, prod, x, why: label + ': 碱性阴离子被质子化(' + (gas ? '生成气体' : '生成水/弱电解质') + ')，使溶解平衡右移', ph: gas ? [{ k: 'bubbles', gas }] : [{ k: 'dissolve' }] }) > 0;
  }
  function rAcidDissolve(ctx) {
    if (!ctx.aq()) return false; let ch = false;
    D.PRECIP.forEach(e => {
      if (!e.ad) return; const sol = ctx.n(e.s); if (sol < 1e-10) return;
      const pk = (e.s === 'ZnS' || e.s === 'FeS') ? 2.5 : 5.5;
      if (acidDissolve(ctx, e.s, e.c, e.nc, e.ad.n, e.ad.p, pk, SP[e.s].cn + ' + 酸')) ch = true;
    });
    Object.keys(D.ACIDSOL).forEach(s => {
      const e = D.ACIDSOL[s];
      const gate = c => {
        if (e.hot && c.T < e.hot) { c.denied(SP[s].cn + ' 在稀酸中常温几乎不溶，需热的较浓强酸'); return false; }
        if (e.slow && c.T < 50 && c.conc('H+') < 3) { c.denied(SP[s].cn + ' 与稀酸反应缓慢，需加热或浓酸'); return false; }
        return true;
      };
      if (acidDissolve(ctx, s, e.c, e.nc, e.n, e.p, 3, SP[s].cn + ' + 酸', gate)) ch = true;
    });
    return ch;
  }
  function rDoubleHyd(ctx) {
    if (!ctx.aq()) return false; let ch = false;
    [['Fe^3+', 'Fe(OH)3'], ['Al^3+', 'Al(OH)3'], ['Cr^3+', 'Cr(OH)3']].forEach(([M, hy]) => {
      let x = Math.min(ctx.n(M) / 2, ctx.n('CO3^2-') / 3);
      if (x > 1e-10) { if (ctx.rxn({ type: '双水解', name: M.replace('^', '') + ' 与 CO₃²⁻ 双水解', react: { [M]: 2, 'CO3^2-': 3, 'H2O': 3 }, prod: { [hy]: 2, 'CO2(aq)': 3 }, x, why: '强烈互促水解: M³⁺ 水解显酸性、CO₃²⁻ 水解显碱性，生成氢氧化物沉淀并放出 CO₂', ph: [{ k: 'bubbles', gas: 'CO2' }] }) > 0) ch = true; }
      x = Math.min(ctx.n(M), ctx.n('HCO3-') / 3);
      if (x > 1e-10) { if (ctx.rxn({ type: '双水解', name: M.replace('^', '') + ' 与 HCO₃⁻ 双水解', react: { [M]: 1, 'HCO3-': 3 }, prod: { [hy]: 1, 'CO2(aq)': 3 }, x, why: 'M³⁺ + 3HCO₃⁻ → M(OH)₃↓ + 3CO₂↑ (互促水解)', ph: [{ k: 'bubbles', gas: 'CO2' }] }) > 0) ch = true; }
    });
    return ch;
  }
  const GASSOL = { 'CO2(aq)': { g: 'CO2', s: 0.0335, k: 0.0225 }, 'SO2(aq)': { g: 'SO2', s: 1.0, k: 0.03 }, 'H2S(aq)': { g: 'H2S', s: 0.10, k: 0.03 } };
  function rGas(ctx) {
    let ch = false; const Vl = ctx.Vl();
    for (const id in GASSOL) {
      const gi = GASSOL[id]; const n = ctx.n(id); if (n < 1e-10) continue;
      const solM = gi.s * Math.exp(-gi.k * (ctx.T - 25)) * (ctx.T >= 95 ? 0.05 : 1);
      const rel = n - solM * Vl; if (rel < 1e-10) continue;
      if (ctx.rxn({ type: '气体逸出', name: '气体逸出: ' + id.replace('(aq)', ''), react: { [id]: 1 }, prod: { [gi.g]: 1 }, x: rel, minor: true, why: '溶解度限制: ' + fnum(solM, 4) + ' mol/L (' + fnum(ctx.T, 0) + ' °C)，超过部分以气泡逸出', ph: [{ k: 'bubbles', gas: gi.g }] }) > 0) ch = true;
    }
    const nh3 = ctx.n('NH3(aq)');
    if (nh3 > 1e-10 && ctx.T >= 60) {
      const rel = nh3 * Math.min(1, (ctx.T - 40) / 50);
      if (ctx.rxn({ type: '气体逸出', name: '加热逐出氨气', react: { 'NH3(aq)': 1 }, prod: { NH3: 1 }, x: rel, minor: true, why: 'NH₃ 的溶解度随温度升高急剧下降，受热逸出', ph: [{ k: 'bubbles', gas: 'NH3' }] }) > 0) ch = true;
    }
    return ch;
  }

  // ============ 规则: 平衡 (沉淀 / 配位 / 两性 / 碘) ============
  function rEquilibria(ctx) {
    if (!ctx.aq()) return false; let any = false; const Vl = ctx.Vl(); if (Vl <= 0) return false;
    for (let sweep = 0; sweep < 300; sweep++) {
      let moved = 0;
      D.PRECIP.forEach(e => {
        const nc = ctx.n(e.c), na = ctx.n(e.a); const ns = ctx.n(e.s);
        if ((nc < 1e-13 || na < 1e-13) && !(e.sat && ns > 1e-12)) return;
        const rx = { react: { [e.c]: e.nc, [e.a]: e.na }, prod: { [e.s]: 1 } };
        const Qc = Math.pow(nc / Vl, e.nc) * Math.pow(na / Vl, e.na);
        const x = solveEq(ctx.L, Vl, rx, 1 / e.ksp, !!e.sat);
        if (Math.abs(x) < 1e-9) return;
        const fwd = x > 0;
        const why = fwd ? '离子积 Qsp = [' + F2(e.c) + ']' + (e.nc > 1 ? '^' + e.nc : '') + '[' + F2(e.a) + ']' + (e.na > 1 ? '^' + e.na : '') + ' = ' + Qc.toExponential(2) + ' > Ksp = ' + e.ksp.toExponential(2) + ' → 过饱和，析出沉淀(沉淀后离子浓度满足 Qsp = Ksp)' : '离子积 Qsp < Ksp = ' + e.ksp.toExponential(2) + ' → 微溶固体继续溶解至饱和';
        const done = ctx.rxn(fwd ? { type: '沉淀反应', name: '沉淀: ' + nm(e.s), react: rx.react, prod: rx.prod, x, why, ph: [{ k: 'precip', id: e.s }], tol: 1e-9 } :
          { type: '溶解平衡', name: '微溶物溶解: ' + nm(e.s), react: rx.prod, prod: rx.react, x: -x, why, minor: true, tol: 1e-9 });
        if (done > 0) { moved = Math.max(moved, done); any = true; }
      });
      D.EQ.forEach(e => {
        const x = solveEq(ctx.L, Vl, { react: e.react, prod: e.prod }, e.K, true, { limitWater: false });
        if (Math.abs(x) < 1e-9) return;
        const fwd = x > 0;
        const done = ctx.rxn(fwd ? { type: e.type, name: e.name, react: e.react, prod: e.prod, x, why: '平衡常数 K = ' + e.K.toExponential(2) + ' (浓度基), 在当前浓度下反应商 < K → 向右进行直至 Q = K', ph: eqPhen(e), tol: 1e-9 } :
          { type: e.type + '(逆)', name: e.name + ' (逆向)', react: e.prod, prod: e.react, x: -x, why: '反应商 Q > K → 逆向', tol: 1e-9, minor: true });
        if (done > 0) { moved = Math.max(moved, done); any = true; }
      });
      if (moved < 1e-9) break;
    }
    return any;
  }
  function eqPhen(e) {
    if (e.id === 'FeSCN') return [{ k: 'color', note: '溶液变为血红色 (Fe(SCN)²⁺)' }];
    if (e.id === 'CuNH3') return [{ k: 'color', note: '溶液变为深蓝色 [Cu(NH₃)₄]²⁺ (氨量少时先生成浅蓝色 Cu(OH)₂ 沉淀，氨过量后沉淀溶解)' }];
    if (e.id === 'AgClNH3') return [{ k: 'dissolve', note: 'AgCl 溶解于氨水' }];
    if (e.id === 'I3') return [{ k: 'color', note: '碘溶于 KI 溶液，呈棕褐色(I₃⁻)' }];
    if (e.id === 'AlOH4' || e.id === 'ZnOH4') return [{ k: 'dissolve', note: '两性氢氧化物沉淀在过量强碱中溶解' }];
    return [];
  }
  // 共存检测: 离子对无沉淀的理由
  function ionPairReasons(ctx) {
    const out = []; const Vl = ctx.Vl(); if (Vl <= 0) return out;
    D.PRECIP.forEach(e => {
      const nc = ctx.n(e.c), na = ctx.n(e.a); if (nc < 1e-10 || na < 1e-10) return;
      const Q = Math.pow(nc / Vl, e.nc) * Math.pow(na / Vl, e.na);
      out.push('可能的沉淀 ' + dispId(e.s) + ': Qsp = ' + Q.toExponential(2) + (Q < e.ksp ? ' < ' : ' ≥ ') + 'Ksp = ' + e.ksp.toExponential(2) + (Q < e.ksp ? ' → 不沉淀' : ''));
    });
    return out;
  }

  // ============ 规则: 有机 ============
  const ESTERS = [
    { acid: ['CH3COOH', 'CH3COOH(aq)'], alc: 'C2H5OH', ester: 'CH3COOC2H5', K: 4.0, name: '乙酸 + 乙醇 ⇌ 乙酸乙酯 + 水 (Fischer 酯化)' },
    { acid: ['CH3COOH', 'CH3COOH(aq)'], alc: 'CH3OH', ester: 'CH3COOCH3', K: 5.0, name: '乙酸 + 甲醇 ⇌ 乙酸甲酯 + 水 (Fischer 酯化)' },
  ];
  function rOrganic(ctx) {
    let ch = false;
    // 1. 酯化平衡 (可逆, 可水解)
    ESTERS.forEach(E => {
      const a1 = ctx.n(E.acid[0]), a2 = ctx.n(E.acid[1]), o = ctx.n(E.alc), e = ctx.n(E.ester), w = ctx.n('H2O');
      const a = a1 + a2;
      if ((a < 1e-9 || o < 1e-9) && (e < 1e-9 || w < 1e-9)) return;
      const hasStrongAcid = ctx.hasCat('H2SO4') || ctx.hasCat('H3PO4') || ctx.conc('H+') >= 0.3 || ctx.cSO4() >= 5;
      const hot = ctx.T >= 55;
      if (!(hasStrongAcid && hot)) { if (a > 1e-9 && o > 1e-9 || e > 1e-9 && w > 1e-9) ctx.denied('酯化/酯水解是可逆慢反应: 需要强酸催化(如浓 H₂SO₄)且加热(≥55 °C)才能在实验时间内达到平衡；当前' + (hasStrongAcid ? '温度过低' : '无强酸催化剂') + '，视为不反应'); return; }
      const K = E.K; const f = x => (e + x) * (w + x) - K * (a - x) * (o - x);
      let lo = -Math.min(e, w), hi = Math.min(a, o);
      if (hi < 0 || lo > 0) return;
      let x;
      if (f(hi) <= 0) x = hi; else if (f(lo) >= 0) x = lo; else { let l = lo, h = hi; for (let i = 0; i < 200; i++) { const m = (l + h) / 2; if (f(m) > 0) h = m; else l = m; } x = (l + h) / 2; }
      if (Math.abs(x) < 1e-8) return;
            const xmaxP = Math.min(a, o);
      if (x > 0) {
        let rem = x; const parts = [[E.acid[0], Math.min(a1, rem)]]; rem -= parts[0][1]; if (rem > 1e-12) parts.push([E.acid[1], rem]);
        parts.forEach(([ac, xx]) => { if (xx > 1e-12) { if (ctx.rxn({ type: '酯化(可逆平衡)', name: E.name, react: { [ac]: 1, [E.alc]: 1 }, prod: { [E.ester]: 1, H2O: 1 }, x: xx, why: '平衡常数 K = [酯][水]/([酸][醇]) ≈ ' + K + ' (25–100 °C 近似); 解 (e+x)(w+x) = K(a−x)(o−x) 得平衡进度；酸催化只加快速率，不改变平衡', ph: [{ k: 'smell', text: '果香味(乙酸酯)' }], xmaxPossible: xmaxP, tol: 1e-12 }) > 0) ch = true; } });
        ctx._esterEq = { K, xeq: x, xmax: xmaxP, E };
      } else {
        if (ctx.rxn({ type: '酯水解(逆向)', name: '酯水解: ' + E.name, react: { [E.ester]: 1, H2O: 1 }, prod: { [E.acid[0]]: 1, [E.alc]: 1 }, x: -x, why: '水多时平衡向酯水解方向移动 (K=' + K + ')', tol: 1e-12 }) > 0) ch = true;
      }
    });
    // 2. 乙酸酐水解 / 酰化
    if (ctx.n('C4H6O3') > 1e-9) {
      const anh = ctx.n('C4H6O3'), sal = ctx.n('C7H6O3'), w = ctx.n('H2O');
      const acylOK = (ctx.hasCat('H2SO4') || ctx.hasCat('H3PO4') || ctx.conc('H+') >= 0.3 || ctx.cSO4() >= 5) && ctx.T >= 45 && ctx.T <= 140;
      const acylFirst = !(w > 3 * anh);
      if (sal > 1e-9 && acylFirst) {
        if (acylOK) {
          const x = Math.min(sal, anh);
          if (ctx.rxn({ type: '酰化 (酯化)', name: '水杨酸 + 乙酸酐 → 阿司匹林 + 乙酸', react: { C7H6O3: 1, C4H6O3: 1 }, prod: { C9H8O4: 1, CH3COOH: 1 }, x, why: '酚羟基(亲核)进攻乙酸酐羰基碳，乙酸根离去；酸催化使酐羰基活化；ΔH<0 且熵增，自发。乙酸酐过量时水杨酸被完全消耗', ph: [{ k: 'precip', id: 'C9H8O4' }, { k: 'smell', text: '醋酸味' }], xmaxPossible: x }) > 0) ch = true;
        } else ctx.denied('水杨酸酰化: 无强酸催化剂时，常规条件下速率太慢；有催化剂(几滴浓 H₂SO₄ / H₃PO₄)需加热 50–90 °C' + (ctx.T > 140 ? '；温度过高会导致产物分解/副反应' : ''));
      }
      if (ctx.n('C4H6O3') > 1e-9 && ctx.n('H2O') > 1e-9) {
        const x = Math.min(ctx.n('C4H6O3'), ctx.n('H2O'));
        if (ctx.rxn({ type: '酸酐水解', name: '乙酸酐水解', react: { C4H6O3: 1, H2O: 1 }, prod: { CH3COOH: 2 }, x, why: '酸酐 + 水 → 2 羧酸 (亲核酰基取代)；速度快且放热，是实验中除去过量乙酸酐的标准做法', ph: [{ k: 'heat' }, { k: 'smell', text: '刺鼻醋酸味' }] }) > 0) ch = true;
      }
    }
    // 3. 皂化
    if (ctx.aq() && ctx.n('CH3COOC2H5') > 1e-9 && ctx.n('OH-') > 1e-9) {
      const x = Math.min(ctx.n('CH3COOC2H5'), ctx.n('OH-'));
      if (ctx.rxn({ type: '酯碱性水解', name: '乙酸乙酯皂化', react: { CH3COOC2H5: 1, 'OH-': 1 }, prod: { 'CH3COO-': 1, C2H5OH: 1 }, x, why: 'OH⁻ 亲核进攻酯羰基，产物羧酸被碱中和成盐，反应不可逆(ΔG≪0)', ph: [{ k: 'heat' }] }) > 0) ch = true;
    }
    // 4. 阿司匹林碱性水解
    if (ctx.aq() && ctx.n('C9H7O4-') > 1e-9 && ctx.n('OH-') > 1e-9) {
      if (ctx.T >= 50) { const x = Math.min(ctx.n('C9H7O4-'), ctx.n('OH-')); if (ctx.rxn({ type: '酯碱性水解', name: '阿司匹林碱性水解', react: { 'C9H7O4-': 1, 'OH-': 1 }, prod: { 'C7H5O3-': 1, 'CH3COO-': 1 }, x, why: '乙酰基(酚酯)在热的碱性溶液中水解为水杨酸根和乙酸根', ph: [{ k: 'heat' }] }) > 0) ch = true; }
      else ctx.denied('阿司匹林在碱中先被中和成钠盐；其酚酯键碱性水解在常温较慢，加热(≥50 °C)可进行');
    }
    // 5. 酚类与 Fe3+ 显色 (定性)
    if (ctx.aq() && ctx.n('Fe^3+') > 1e-9 && (ctx.n('C6H6O') + ctx.n('C7H6O3') + ctx.n('C7H5O3-') + ctx.n('C6H5O-')) > 1e-9 && !ctx._phenolTest) {
      ctx._phenolTest = true; ctx.extraColors.push({ color: '#6a2c91', a: 0.8 });
      ctx.events.push({ type: '显色反应(定性)', name: 'Fe³⁺ + 酚羟基 → 紫色配合物', react: {}, prod: {}, x: 0, dHu: 0, why: '含游离酚羟基的化合物(苯酚、水杨酸)与 Fe³⁺ 形成紫色配合物，是检验酚羟基/阿司匹林中残留水杨酸的经典方法；阿司匹林(酚羟基已酰化)不显色。该规则为定性判断，不改变物料衡算', ph: [{ k: 'color', note: '溶液显紫色' }], minor: false, qual: true, eqText: 'Fe³⁺ + n ArOH → [Fe(OAr)ₙ]^(3−n)⁺ + n H⁺ (紫色)' });
      ch = true;
    }
    return ch;
  }

  // ============ 规则: 热分解 ============
  const DEC = [
    { id: 'CaCO3', name: '碳酸钙热分解', react: { CaCO3: 1 }, prod: { CaO: 1, CO2: 1 }, minT: 600, ph: [{ k: 'bubbles', gas: 'CO2' }] },
    { id: 'NaHCO3', name: '碳酸氢钠受热分解', react: { NaHCO3: 2 }, prod: { Na2CO3: 1, 'H2O(g)': 1, CO2: 1 }, minT: 100, ph: [{ k: 'bubbles', gas: 'CO2' }, { k: 'steam' }] },
    { id: 'CuSO4·5H2O', name: '胆矾脱水', react: { 'CuSO4·5H2O': 1 }, prod: { CuSO4: 1, 'H2O(g)': 5 }, minT: 100, ph: [{ k: 'color', note: '蓝色晶体 → 白色粉末(无水硫酸铜)' }, { k: 'steam' }] },
    { id: 'Cu(OH)2', name: '氢氧化铜受热分解', react: { 'Cu(OH)2': 1 }, prod: { CuO: 1, H2O: 1 }, minT: 60, dG298: -6.9, ph: [{ k: 'color', note: '蓝色沉淀 → 黑色(CuO)' }] },
    { id: 'Mg(OH)2', name: '氢氧化镁受热分解', react: { 'Mg(OH)2': 1 }, prod: { MgO: 1, 'H2O(g)': 1 }, minT: 300, ph: [{ k: 'steam' }] },
    { id: 'Ag2O', name: '氧化银受热分解', react: { Ag2O: 2 }, prod: { Ag: 4, O2: 1 }, minT: 160, ph: [{ k: 'bubbles', gas: 'O2' }, { k: 'color', note: '棕褐色 Ag₂O → 银白色' }] },
  ];
  function decThermo(d, T) {
    let dH = 0, dS = 0, miss = false;
    for (const k in d.prod) { dH += d.prod[k] * (SP[k].H || 0); if (SP[k].S0 == null) miss = true; dS += d.prod[k] * (SP[k].S0 || 0); }
    for (const k in d.react) { dH -= d.react[k] * (SP[k].H || 0); if (SP[k].S0 == null) miss = true; dS -= d.react[k] * (SP[k].S0 || 0); }
    const TK = T + 273.15;
    let dG = dH - TK * dS / 1000;
    if (d.dG298 !== undefined) dG = d.dG298 - (TK - 298.15) * dS / 1000;
    return { dH, dS, dG, miss, Teq: dS ? dH / dS * 1000 - 273.15 : null };
  }
  function rThermal(ctx) {
    let ch = false;
    DEC.forEach(d => {
      const n = ctx.n(d.id); if (n < 1e-10) return;
      // 在水溶液中, Mg(OH)2/CaCO3 不会"热分解"
      if (ctx.aq() && (d.id === 'CaCO3' || d.id === 'Mg(OH)2' || d.id === 'NaHCO3' || d.id === 'CuSO4·5H2O')) return;
      const th = decThermo(d, ctx.T);
      if (th.miss && d.dG298 === undefined) { }
      if (th.dG < 0 && ctx.T >= d.minT) {
        const prod = Object.assign({}, d.prod); if (ctx.aq() && prod['H2O(g)']) { prod['H2O'] = prod['H2O(g)']; delete prod['H2O(g)']; }
        const x = n / Object.values(d.react)[0];
        if (ctx.rxn({ type: '热分解', name: d.name, react: d.react, prod, x, why: 'ΔH = ' + fnum(th.dH, 1) + ' kJ, ΔS = ' + fnum(th.dS, 1) + ' J/K → ΔG(' + fnum(ctx.T, 0) + ' °C) = ΔH − TΔS = ' + fnum(th.dG, 1) + ' kJ < 0' + (th.Teq !== null && isFinite(th.Teq) ? '；转折温度 T = ΔH/ΔS ≈ ' + fnum(th.Teq, 0) + ' °C' : ''), ph: d.ph }) > 0) ch = true;
      } else if (n > 1e-9) {
        ctx.denied(nm(d.id) + ' 热分解: ΔG(' + fnum(ctx.T, 0) + ' °C) = ' + fnum(th.dG, 1) + ' kJ' + (th.dG >= 0 ? ' > 0，热力学上不自发' : '，但低于动力学起始温度 ' + d.minT + ' °C，速率极慢') + (th.dG >= 0 && th.Teq !== null && isFinite(th.Teq) ? '；需 T > ' + fnum(th.Teq, 0) + ' °C' : ''));
      }
    });
    // H2O2 催化分解
    const nh = ctx.n('H2O2(aq)');
    if (nh > 1e-10 && ctx.aq()) {
      const cat = ctx.hasCat('MnO2') || ctx.n('MnO2') > 1e-9 || ctx.hasCat('Pt') || ctx.hasCat('KI') || ctx.n('I-') > 1e-9 || ctx.hasCat('Fe3') || ctx.n('Fe^3+') > 1e-9;
      const hot = ctx.T >= 70;
      if (cat || hot) {
        const x = nh / 2;
        const catName = ctx.hasCat('MnO2') || ctx.n('MnO2') > 1e-9 ? 'MnO₂' : (ctx.hasCat('Pt') ? 'Pt' : (ctx.hasCat('KI') || ctx.n('I-') > 1e-9 ? 'I⁻' : (cat ? 'Fe³⁺' : '加热')));
        if (ctx.rxn({ type: '催化分解', name: 'H₂O₂ 分解', react: { 'H2O2(aq)': 2 }, prod: { H2O: 2, O2: 1 }, x, why: 'ΔG° ≈ −2×(120) kJ，热力学强自发 (歧化 O: −1 → −2 / 0)；动力学受阻，催化剂(' + catName + ')降低活化能后迅速放出 O₂', ph: [{ k: 'bubbles', gas: 'O2' }, { k: 'heat' }] }) > 0) ch = true;
      } else ctx.denied('H₂O₂ 热力学上不稳定(ΔG<0)，但无催化剂、常温下分解极慢 (动力学稳定，可保存)');
    }
    return ch;
  }

  // ============ 规则: 干法 (燃烧 / 化合 / 固相) ============
  const FUELS = {
    C2H5OH: { ign: 363, fp: 13, flame: '淡蓝色火焰', fc: '#7fb2ff' }, CH3OH: { ign: 464, fp: 11, flame: '淡蓝色火焰', fc: '#8ab6ff' }, C3H6O: { ign: 465, fp: -20, flame: '明亮的黄色火焰', fc: '#ffc94d' },
    C6H14: { ign: 225, fp: -22, flame: '黄色火焰(带少量黑烟)', fc: '#ffb020', soot: true }, C7H8: { ign: 480, fp: 4, flame: '明亮黄色火焰，冒浓黑烟', fc: '#ffa010', soot: true },
    C3H8O3: { ign: 370, fp: 160, flame: '黄色火焰', fc: '#ffb83d' }, CH3COOC2H5: { ign: 426, fp: -4, flame: '黄色火焰', fc: '#ffc040' }, C6H12O6: { ign: 400, fp: 200, flame: '焦糖化→黄色火焰', fc: '#ffb83d' }, C12H22O11: { ign: 350, fp: 200, flame: '焦化→黄色火焰', fc: '#ffb83d' },
    C6H6O: { ign: 715, fp: 79, flame: '黄色火焰(冒烟)', fc: '#ffb020', soot: true },
  };
  function combustion(ctx) {
    if (ctx.atm !== 'air') { Object.keys(FUELS).concat(['S', 'C', 'Mg']).forEach(f => { if (ctx.n(f) > 1e-9 && (ctx.ignite || ctx.T > 300)) ctx.denied('氮气氛下无氧化剂 O₂，不能燃烧', '*'); }); return false; }
    let ch = false;
    const trySp = (sp, ign, prodMap, o2, name, flame, fc, extra) => {
      const n = ctx.n(sp); if (n < 1e-10) return;
      const sol = SP[sp].ph === 's';
      if (ctx.aq() && (sol || SP[sp].ph === 'l' && ctx.n('H2O') * 18 > 1.5 * n * SP[sp].M)) { ctx.denied(nm(sp) + ': 体系含大量水，无法点燃/燃烧', '*'); return; }
      const ignited = ctx.ignite || ctx.T >= ign;
      if (!ignited) { ctx.denied(nm(sp) + ': 未点燃 (闪点/着火点 ' + (extra && extra.fp !== undefined ? '闪点 ' + extra.fp + ' °C, ' : '') + '自燃温度 ' + ign + ' °C)；需要点火源(开启"点燃")或加热到自燃温度', '*'); return; }
      const prod = Object.assign({}, prodMap);
      ctx.add('O2', n * o2);
      if (ctx.rxn({ type: '燃烧', name, react: { [sp]: 1, O2: o2 }, prod, x: n, why: '有氧(空气)且达到着火条件 (' + (ctx.ignite ? '外加点火源' : 'T ≥ 自燃温度 ' + ign + ' °C') + ')；燃烧是 ΔH 很负、ΔS>0 的自发放热氧化，由生成焓计算 ΔcH', ph: [{ k: 'flame', text: flame, color: fc, soot: extra && extra.soot }], noHeat: false, combustion: true }) > 0) { ch = true; ctx.o2Air = (ctx.o2Air || 0) + n * o2; ctx.flameInfo = { text: flame, color: fc }; ctx.combustion = true; }
      ctx.add('O2', -(ctx.n('O2')));
    };
    Object.keys(FUELS).forEach(sp => {
      const c = D.parseComp(sp); const nC = c.C || 0, nH = c.H || 0, nO = c.O || 0; const o2 = nC + nH / 4 - nO / 2;
      if (c.N) return;
      const f = FUELS[sp];
      trySp(sp, f.ign, { CO2: nC, H2O: nH / 2 }, o2, nm(sp) + '燃烧', f.flame, f.fc, f);
    });
    trySp('S', 232, { SO2: 1 }, 1, '硫燃烧', '微弱淡蓝色火焰(空气中)', '#6aa8ff', {});
    trySp('C', 700, { CO2: 1 }, 1, '碳燃烧', '红热发光(无焰燃烧)', '#ff6a20', {});
    trySp('Mg', 473, { MgO: 1 }, 0.5, '镁燃烧', '耀眼的白光', '#ffffff', {});
    // 铜加热氧化
    if (ctx.n('Cu') > 1e-9 && ctx.T >= 300 && !ctx.aq()) {
      const n = ctx.n('Cu'); ctx.add('O2', n * 0.5);
      if (ctx.rxn({ type: '氧化(化合)', name: '铜在空气中加热氧化', react: { Cu: 1, O2: 0.5 }, prod: { CuO: 1 }, x: n, why: '2Cu + O₂ → 2CuO，ΔH 由生成焓计算；T ≥ 300 °C 速率显著', ph: [{ k: 'color', note: '红色铜表面变黑(CuO)' }] }) > 0) ch = true;
      ctx.add('O2', -ctx.n('O2'));
    }
    return ch;
  }
  const KMN_FUELS = ['C3H8O3', 'C2H5OH', 'CH3OH', 'C3H6O'];
  function rDry(ctx) {
    let ch = false;
    if (combustion(ctx)) ch = true;
    // 高锰酸钾 + 液态有机燃料 (无大量水)
    if (ctx.n('KMnO4') > 1e-9 && !ctx.aq()) {
      KMN_FUELS.forEach(f => {
        const nf = ctx.n(f); if (nf < 1e-9) return;
        const c = D.parseComp(f); const cc = c.C, hh = c.H, oo = c.O || 0; const a = cc + hh / 4 - oo / 2;
        const x = Math.min(nf, ctx.n('KMnO4') / a);
        if (ctx.rxn({ type: '强氧化剂 + 有机物', name: 'KMnO₄ 氧化 ' + nm(f), react: { KMnO4: a, [f]: 1 }, prod: { K2CO3: a / 2, Mn2O3: a / 2, CO2: cc - a / 2, H2O: hh / 2 }, x, why: 'Mn(+7) → Mn(+3) 得 4 e⁻，有机物碳氢被氧化为 CO₂/H₂O。电子守恒: n(KMnO₄) = (4c + h − 2o)/4 = ' + fnum(a, 2) + ' mol/mol；强放热，常伴随延迟自燃(紫红色火焰、白烟)', ph: [{ k: 'flame', text: '剧烈反应，白烟，常自燃(火焰带紫色)', color: '#d890ff' }, { k: 'smoke' }, { k: 'heat' }], combustion: true }) > 0) { ch = true; ctx.combustion = true; ctx.flameInfo = { text: '剧烈放热，可能自燃', color: '#d890ff' }; ctx.hz('高锰酸钾与甘油/乙醇等有机物接触可在数秒至数十秒后自燃起火'); }
      });
    } else if (ctx.n('KMnO4') > 1e-9 && ctx.aq() === false) { }
    // 固相化合
    if (!ctx.aq()) {
      const synth = [['Fe', 'S', { FeS: 1 }, 1, 1, 200, 'Fe + S → FeS (加热引发后自行持续放热，红热)'], ['Cu', 'S', { Cu2S: 1 }, 2, 1, 300, '2Cu + S → Cu₂S (加热，黑色硫化亚铜)']];
      synth.forEach(([a, b, prod, na, nb, T, why]) => {
        const xa = ctx.n(a) / na, xb = ctx.n(b) / nb; const x = Math.min(xa, xb); if (x < 1e-10) return;
        if (ctx.T >= T) { if (ctx.rxn({ type: '化合反应', name: nm(a) + ' + ' + nm(b), react: { [a]: na, [b]: nb }, prod, x, why: why + '；ΔH 由生成焓计算 (自发放热)', ph: [{ k: 'color', note: '生成黑色固体' }, { k: 'heat' }] }) > 0) ch = true; }
        else ctx.denied(nm(a) + ' + ' + nm(b) + ': 固相反应需加热引发 (≥ ' + T + ' °C)，常温下不反应');
      });
      // CuO + C
      if (ctx.n('CuO') > 1e-9 && ctx.n('C') > 1e-9) {
        if (ctx.T >= 500) { const x = Math.min(ctx.n('CuO') / 2, ctx.n('C')); if (ctx.rxn({ type: '固相还原', name: 'C 还原 CuO', react: { CuO: 2, C: 1 }, prod: { Cu: 2, CO2: 1 }, x, why: 'ΔH = ΔfH(CO₂) − 2ΔfH(CuO) < 0, ΔS>0 (生成气体) → ΔG<0；固相反应需 ≥ 500 °C 才有足够速率', ph: [{ k: 'color', note: '黑色粉末变为红色(铜)' }, { k: 'bubbles', gas: 'CO2' }] }) > 0) ch = true; }
        else ctx.denied('CuO + C: 热力学可行 (ΔG<0)，但固-固反应需要高温(≥ 500 °C)才有显著速率');
      }
      // NH4Cl + Ca(OH)2
      if (ctx.n('NH4Cl') > 1e-9 && ctx.n('Ca(OH)2') > 1e-9) {
        if (ctx.T >= 100) { const x = Math.min(ctx.n('NH4Cl') / 2, ctx.n('Ca(OH)2')); if (ctx.rxn({ type: '固相复分解/气体', name: '氯化铵 + 熟石灰 → 氨气', react: { NH4Cl: 2, 'Ca(OH)2': 1 }, prod: { CaCl2: 1, NH3: 2, 'H2O(g)': 2 }, x, why: '强碱制弱碱: NH₄⁺ + OH⁻ → NH₃↑ + H₂O，受热使 NH₃ 逸出(ΔH>0 吸热，由 ΔS 驱动)', ph: [{ k: 'bubbles', gas: 'NH3' }, { k: 'smell', text: '刺激性氨味' }] }) > 0) ch = true; }
        else ctx.denied('NH₄Cl + Ca(OH)₂ 固体混合: 常温几乎不反应，需加热(≥ 100 °C)');
      }
    }
    return ch;
  }
  function rConcAcid(ctx) {
    if (!ctx.aq()) return false; let ch = false;
    const cS = ctx.cSO4();
    if (cS >= 10) {
      [['C12H22O11', 12, 11, '蔗糖'], ['C6H12O6', 6, 6, '葡萄糖']].forEach(([sp, nC, nW, name]) => {
        const n = ctx.n(sp); if (n < 1e-10) return;
        if (ctx.rxn({ type: '脱水 (浓硫酸)', name: '浓硫酸使' + name + '脱水炭化', react: { [sp]: 1 }, prod: { C: nC, H2O: nW }, x: n, why: '浓硫酸(c ≈ ' + fnum(cS, 1) + ' mol/L ≥ 10)是强脱水剂：从碳水化合物中夺取 H、O 原子(以水的比例)，留下黑色多孔炭；放出大量热(水合 + 稀释)，部分炭被热浓硫酸氧化产生 CO₂/SO₂ 使炭体膨胀', ph: [{ k: 'color', note: '白色糖变黑膨胀成"黑面包"' }, { k: 'steam' }, { k: 'smell', text: '刺激性 SO₂ 气味' }, { k: 'bubbles', gas: 'SO2' }] }) > 0) { ch = true; ctx.hz('浓硫酸脱水炭化放热剧烈并产生 SO₂/CO₂，泡沫炭可能溢出'); }
      });
      if (ctx.n('C2H5OH') > 1e-10 && ctx.T >= 150 && ctx.T < 200) {
        if (ctx.rxn({ type: '脱水 (浓硫酸)', name: '乙醇消去脱水 → 乙烯', react: { C2H5OH: 1 }, prod: { C2H4: 1, H2O: 1 }, x: ctx.n('C2H5OH'), why: '浓硫酸 + 170 °C 左右: 乙醇分子内消去(ΔS>0 的吸热反应，高温有利)；140 °C 附近则主要为分子间脱水成醚', ph: [{ k: 'bubbles', gas: 'C2H4' }] }) > 0) { ch = true; ctx.hz('乙烯易燃；浓硫酸+乙醇混合会发热，勿密闭'); }
      } else if (ctx.n('C2H5OH') > 1e-10 && cS >= 10) ctx.denied('浓 H₂SO₄ 与乙醇: 乙烯的生成需要 ~170 °C；低于该温度主要生成硫酸氢乙酯/乙醚，引擎无该部分数据');
    }
    return ch;
  }

  // ============ 主循环 ============
  function loopRules(ctx) {
    for (let it = 0; it < 80; it++) {
      let ch = false;
      if (rDissolve(ctx)) ch = true;
      if (rCaO(ctx)) ch = true;
      if (rCuI(ctx)) ch = true;
      if (rRedox(ctx)) ch = true;
      if (rAirOxid(ctx)) ch = true;
      if (rAcidBase(ctx)) ch = true;
      if (rChromate(ctx)) ch = true;
      if (rAcidDissolve(ctx)) ch = true;
      if (rDoubleHyd(ctx)) ch = true;
      if (rGas(ctx)) ch = true;
      if (rEquilibria(ctx)) ch = true;
      if (rOrganic(ctx)) ch = true;
      if (rConcAcid(ctx)) ch = true;
      if (rThermal(ctx)) ch = true;
      if (rDry(ctx)) ch = true;
      if (!ch) break;
    }
  }

  B.rules = { loopRules, rDissolve, ionPairReasons, halfName, F2, nm, decThermo, DEC, FUELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
})(typeof window !== 'undefined' ? window : globalThis);
