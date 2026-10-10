/* 虚拟化学实验室 —— 反应引擎
 * 基于规则 + 热力学数据库：溶解 / 酸碱 / 沉淀(Ksp) / 配位 / 氧化还原(E°) / 气体逸出 / 酯化 / 酰化 / 燃烧 / 热分解 / 电解 ...
 * 所有数值均由数据库中的 ΔfH°、E°、Ksp、pKa 计算得到；没有数据的组合返回 "引擎无数据"，不编造结果。
 */
(function (g) {
  'use strict';
  const D = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./data.js') : g.ChemData;
  const SP = D.SP;
  const R_GAS = 8.314462, FARA = 96485.33, KW = 1e-14;
  const EPS = 1e-12;
  const REAGBY = {}; D.REAG.forEach(r => REAGBY[r.id] = r);
  const SYSOF = {}; D.SYSTEMS.forEach(s => s.forms.forEach((f, i) => { SYSOF[f] = { sys: s, i }; }));

  // ---------------- 小工具 ----------------
  function dispId(id) {
    const base = D.fmt(id.replace(/\((aq|g|s|l)\)$/, ''));
    const sp = SP[id];
    const ph = sp ? sp.ph : 'aq';
    return base + '<span class="st">(' + ph + ')</span>';
  }
  function plain(html) {
    const subs = '₀₁₂₃₄₅₆₇₈₉', sups = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '−': '⁻', '-': '⁻' };
    return String(html).replace(/<sub>(\d+)<\/sub>/g, (m, d) => d.split('').map(c => subs[+c]).join(''))
      .replace(/<sup>([^<]*)<\/sup>/g, (m, d) => d.split('').map(c => sups[c] || c).join(''))
      .replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function intify(map) {
    const ids = Object.keys(map).filter(k => map[k] > 1e-12);
    if (!ids.length) return { k: 1, ints: {} };
    const min = Math.min.apply(null, ids.map(k => map[k]));
    for (let m = 1; m <= 24; m++) {
      let ok = true; const out = {};
      for (const k of ids) { const v = map[k] / min * m; if (Math.abs(v - Math.round(v)) > 2e-3 * Math.max(1, v)) { ok = false; break; } out[k] = Math.round(v); }
      if (ok) {
        let gg = 0; ids.forEach(k => gg = gcd(gg, out[k]));
        ids.forEach(k => out[k] /= gg);
        return { k: m / min / gg, ints: out };
      }
    }
    const out = {}; ids.forEach(k => out[k] = Math.round(map[k] / min * 1000) / 1000);
    return { k: 1 / min, ints: out };
  }
  function sideHTML(ints) {
    return Object.keys(ints).map(id => (ints[id] === 1 ? '' : ints[id] + ' ') + dispId(id)).join(' + ');
  }
  function eqHTML(react, prod) {
    const a = Object.assign({}, react), b = Object.assign({}, prod);
    // 约去两边相同的物种
    Object.keys(a).forEach(k => { if (k in b) { const m = Math.min(a[k], b[k]); a[k] -= m; b[k] -= m; } });
    const all = {}; Object.keys(a).forEach(k => { if (a[k] > 1e-12) all[k] = a[k]; }); Object.keys(b).forEach(k => { if (b[k] > 1e-12) all['p:' + k] = b[k]; });
    const it = intify(all);
    const L = {}, Rr = {};
    Object.keys(it.ints).forEach(k => { if (k.startsWith('p:')) Rr[k.slice(2)] = it.ints[k]; else L[k] = it.ints[k]; });
    return { html: sideHTML(L) + ' → ' + sideHTML(Rr), k: it.k, left: L, right: Rr };
  }
  function interp(tab, T) {
    if (!tab || !tab.length) return null;
    if (T <= tab[0][0]) return tab[0][1];
    for (let i = 1; i < tab.length; i++) {
      if (T <= tab[i][0]) { const [t0, v0] = tab[i - 1], [t1, v1] = tab[i]; return v0 + (v1 - v0) * (T - t0) / (t1 - t0); }
    }
    return tab[tab.length - 1][1];
  }
  function fnum(x, d) { d = d === undefined ? 3 : d; if (x === null || x === undefined || isNaN(x)) return '—'; if (x !== 0 && (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e5)) return x.toExponential(2); return (+x).toFixed(d); }
  const CP_SOLID = { Na: 1.23, K: 0.757, Ca: 0.63, Mg: 1.02, Al: 0.90, Zn: 0.39, Fe: 0.45, Cu: 0.385, Ag: 0.235, Pb: 0.13, C: 0.71, S: 0.71, I2: 0.54 };
  const CNAME = { AgCl: '白色凝乳状', AgBr: '淡黄色', AgI: '黄色', Ag2CO3: '淡黄色', Ag2CrO4: '砖红色', Ag2S: '黑色', Ag2O: '棕褐色', BaSO4: '白色', BaCO3: '白色', BaCrO4: '黄色', CaCO3: '白色', CaSO4: '白色', 'Ca(OH)2': '白色', MgCO3: '白色', 'Mg(OH)2': '白色', PbCl2: '白色', PbI2: '亮黄色(金黄色)', PbSO4: '白色', PbCO3: '白色', 'Pb(OH)2': '白色', PbS: '黑色', PbCrO4: '黄色', CuS: '黑色', 'Cu(OH)2': '蓝色絮状', CuCO3: '蓝绿色', CuI: '白色', 'Zn(OH)2': '白色', ZnS: '白色', ZnCO3: '白色', 'Fe(OH)2': '白色→灰绿色', 'Fe(OH)3': '红褐色', FeS: '黑色', FeCO3: '灰白色', 'Al(OH)3': '白色胶状', 'Mn(OH)2': '白色', 'Cr(OH)3': '灰绿色', MnO2: '黑褐色', Cu: '红色(紫红色)', Ag: '银白色', Fe: '灰黑色', Zn: '灰色', Pb: '灰蓝色', I2: '紫黑色', S: '黄色', C: '黑色', CuO: '黑色', Cu2S: '黑色' };
  const GASINFO = {
    H2: { cn: '氢气 H₂', txt: '无色无味气体，可燃，与空气混合有爆鸣危险', color: 'rgba(255,255,255,.75)' }, CO2: { cn: '二氧化碳 CO₂', txt: '无色无味气体，能使澄清石灰水变浑浊', color: 'rgba(255,255,255,.75)' },
    O2: { cn: '氧气 O₂', txt: '无色无味气体，助燃(使带火星木条复燃)', color: 'rgba(255,255,255,.75)' }, NH3: { cn: '氨气 NH₃', txt: '无色，强烈刺激性氨臭，使湿润红色石蕊试纸变蓝', color: 'rgba(235,245,255,.6)' },
    SO2: { cn: '二氧化硫 SO₂', txt: '无色，刺激性气味(窒息性)，有毒，使品红褪色', color: 'rgba(240,240,240,.6)' }, H2S: { cn: '硫化氢 H₂S', txt: '无色，臭鸡蛋气味，剧毒', color: 'rgba(240,240,200,.5)' },
    NO: { cn: '一氧化氮 NO', txt: '无色，遇空气迅速变为红棕色 NO₂', color: 'rgba(255,255,255,.7)' }, NO2: { cn: '二氧化氮 NO₂', txt: '红棕色，刺激性，有毒', color: 'rgba(200,90,30,.7)' },
    Cl2: { cn: '氯气 Cl₂', txt: '黄绿色，刺激性，有毒', color: 'rgba(190,220,80,.7)' }, 'HCl(g)': { cn: '氯化氢 HCl', txt: '无色刺激性气体，遇潮湿空气成白雾', color: 'rgba(255,255,255,.7)' },
    'H2O(g)': { cn: '水蒸气', txt: '无色(冷凝后成白雾)', color: 'rgba(255,255,255,.6)' }, C2H4: { cn: '乙烯 C₂H₄', txt: '无色，易燃，略带甜味', color: 'rgba(255,255,255,.7)' },
  };

  // ---------------- pH 求解 (电荷平衡, 精确) ----------------
  function waterGrams(L) { return (L['H2O'] || 0) * 18.015; }
  function computePH(L, Vl, T) {
    if (!(Vl > 0)) return null;
    let fixed = 0; const systems = []; const used = new Set();
    D.SYSTEMS.forEach(sys => {
      let tot = 0;
      sys.forms.forEach(f => {
        let n = L[f] || 0; if (n <= 0) return;
        used.add(f);
        if (SP[f].ph === 's') { const lim = D.SOLIDLIMIT[f]; if (lim) n = Math.min(n, lim * waterGrams(L) / 100 / SP[f].M); else n = 0; }
        else if (SP[f].ph === 'l' || SP[f].ph === 'g') n = 0;
        tot += n;
      });
      if (tot > 1e-15) systems.push({ sys, tot });
    });
    Object.keys(L).forEach(id => {
      const sp = SP[id]; if (!sp || L[id] <= 0) return;
      if (sp.ph === 'aq' && sp.q !== 0 && !used.has(id) && id !== 'H+' && id !== 'OH-') fixed += sp.q * L[id];
    });
    // 同一体系的非 aq 形式 (如固体弱酸) 已在 used 中
    // 离子态强酸/强碱不在此显式出现: 由电荷平衡自动决定
    function f(pH) {
      const h = Math.pow(10, -pH);
      let s = h - KW / h + fixed / Vl;
      systems.forEach(o => {
        const sys = o.sys; let r = 1, num = 0, den = 0;
        for (let k = 0; k < sys.forms.length; k++) {
          if (k > 0) r *= Math.pow(10, -sys.pKa[k - 1]) / h;
          num += r * SP[sys.forms[k]].q; den += r;
        }
        s += (o.tot / Vl) * (num / den);
      });
      return s;
    }
    let lo = -3, hi = 17;
    if (f(lo) < 0) return lo; if (f(hi) > 0) return hi;
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function speciation(L, Vl, pH) {
    const h = Math.pow(10, -pH); const out = [];
    D.SYSTEMS.forEach(sys => {
      let tot = 0; sys.forms.forEach(f => { if (SP[f].ph !== 'g' && SP[f].ph !== 'l') tot += (L[f] || 0); });
      if (tot < 1e-15) return;
      let r = 1; const rs = [1];
      for (let k = 1; k < sys.forms.length; k++) { r *= Math.pow(10, -sys.pKa[k - 1]) / h; rs.push(r); }
      const sum = rs.reduce((a, b) => a + b, 0);
      out.push({ name: sys.name, tot: tot / Vl, forms: sys.forms.map((f, i) => ({ id: f, frac: rs[i] / sum })) });
    });
    return out;
  }

  // ---------------- 颜色 ----------------
  function hex2rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function solutionColor(L, Vl, extra) {
    let rgb = [255, 255, 255], maxA = 0;
    function absorb(col, a) { const c = hex2rgb(col); for (let i = 0; i < 3; i++) rgb[i] = rgb[i] * (1 - a + a * c[i] / 255); maxA = Math.max(maxA, a); }
    if (Vl > 0) Object.keys(L).forEach(id => {
      const ic = D.IONCOLOR[id]; if (!ic || L[id] <= 0 || SP[id].ph === 's') return;
      const c = L[id] / Vl; const a = 1 - Math.exp(-ic[1] * c); if (a > 0.003 && ic[1] > 0) absorb(ic[0], Math.min(0.97, a));
    });
    (extra || []).forEach(e => absorb(e.color, e.a));
    const alpha = Vl > 0 ? 0.38 + 0.52 * Math.min(1, maxA * 1.2) : 0;
    const base = [226, 242, 250];
    const mix = rgb.map((v, i) => Math.round(base[i] * (v / 255) * (1 - 0.0) + 0));
    return { rgb: mix, a: alpha, absorb: maxA };
  }
  function colorName(rgb, a, absorb) {
    const [r, g, b] = rgb; const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (absorb !== undefined && absorb < 0.045) return '无色';
    if (mx - mn < 22 && mx > 205) return '无色';
    if (mx - mn < 25) return mx < 90 ? '黑色' : '灰色';
    const h = rgbHue(r, g, b);
    let name;
    if (h < 15 || h >= 345) name = '红色'; else if (h < 40) name = '橙色'; else if (h < 68) name = '黄色'; else if (h < 95) name = '黄绿色'; else if (h < 160) name = '绿色'; else if (h < 200) name = '青色'; else if (h < 255) name = '蓝色'; else if (h < 290) name = '紫色'; else name = '粉红/品红色';
    const light = (mx + mn) / 2; if (light > 215) return '浅' + name; if (mx < 110) return '深' + name; return name;
  }
  function rgbHue(r, g, b) {
    r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
    if (d === 0) return 0; if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; return h < 0 ? h + 360 : h;
  }
  function indicatorColor(ind, pH) {
    if (!ind || !ind.acid) return null;
    const frac = 1 / (1 + Math.pow(10, pH - ind.pK)); // 酸式型占比
    const a = ind.acid, b = ind.base; const t = 1 - frac;
    const rgb = [0, 1, 2].map(i => Math.round(a[i] * frac + b[i] * t));
    return { rgb, a: a[3] * frac + b[3] * t, absorb: 1 };
  }

  // ---------------- 通用平衡求解 ----------------
  // rxn: {react:{id:coef}, prod:{id:coef}}, K: 浓度平衡常数(仅 aq 物种计入), 返回反应进度 x (mol, 以给定系数为单位)
  function solveEq(L, Vl, rxn, K, allowReverse, opt) {
    opt = opt || {};
    const isAq = id => SP[id] && SP[id].ph === 'aq';
    const useAll = opt.useAll;
    let hi = Infinity, lo = Infinity;
    for (const id in rxn.react) { const lim = (L[id] || 0) / rxn.react[id]; if (id === 'H2O' && !opt.limitWater) continue; hi = Math.min(hi, lim); }
    for (const id in rxn.prod) { lo = Math.min(lo, (L[id] || 0) / rxn.prod[id]); }
    if (!isFinite(hi) || hi < 1e-13) hi = 0;
    lo = allowReverse ? -(isFinite(lo) ? lo : 0) : 0;
    if (hi <= 0 && lo >= 0) return 0;
    const lnK = Math.log(K);
    function lnQ(x) {
      let s = 0;
      for (const id in rxn.prod) { if (!(useAll || isAq(id))) continue; const n = Math.max((L[id] || 0) + rxn.prod[id] * x, 1e-300); s += rxn.prod[id] * Math.log(n / Vl); }
      for (const id in rxn.react) { if (!(useAll || isAq(id))) continue; const n = Math.max((L[id] || 0) - rxn.react[id] * x, 1e-300); s -= rxn.react[id] * Math.log(n / Vl); }
      return s;
    }
    const f = x => lnQ(x) - lnK;   // f 随 x 单调递增; f<0 (Q<K) 时正向进行
    const f0 = f(0);
    let a, b;
    if (f0 === 0) return 0;
    if (f0 < 0) {
      a = 0; b = hi; if (b <= 0) return 0;
      const fb = f(b); if (fb <= 0 && isFinite(fb)) return b;
    } else {
      if (!allowReverse || lo >= 0) return 0;
      a = lo; b = 0; if (f(a) >= 0) return a;
    }
    // f 单调递增
    for (let i = 0; i < 200; i++) { const m = (a + b) / 2; if (f(m) > 0) b = m; else a = m; if (Math.abs(b - a) < 1e-16 + 1e-13 * Math.abs(b)) break; }
    return (a + b) / 2;
  }

  // ---------------- 引擎上下文 ----------------
  function Ctx(setup) {
    this.setup = setup; this.L = {}; this.events = []; this.evmap = {}; this.log = []; this.reasons = []; this.notes = []; this.hazards = new Set(); this.phen = [];
    this.dH = 0; this.missingH = new Set(); this.V = 0; this.mass = 0; this.cpSum = 0; this.reag = []; this.ids = new Set(); this.extraColors = [];
    this.T = setup.T0 === undefined ? 25 : setup.T0; this.T0 = this.T; this.sol = []; this.atm = setup.atmosphere || 'air'; this.ignite = !!setup.ignite; this.catalyst = setup.catalyst || 'none';
    this.L0 = null; this.flameInfo = null; this.noRxn = [];
  }
  const CP = Ctx.prototype;
  CP.n = function (id) { return this.L[id] || 0; };
  CP.add = function (id, x) { this.L[id] = (this.L[id] || 0) + x; if (this.L[id] < 1e-14 && this.L[id] > -1e-9) this.L[id] = Math.max(0, this.L[id]); };
  CP.aq = function () { return this.n('H2O') > 1e-6; };
  CP.Vl = function () { return Math.max(this.V, 0) / 1000; };
  CP.logp = function (s) { this.log.push(s); };
  CP.hz = function (s) { this.hazards.add(s); };
  CP.pH = function () { return this.aq() ? computePH(this.L, this.Vl(), this.T) : null; };
  CP.conc = function (id) { const Vl = this.Vl(); return Vl > 0 ? this.n(id) / Vl : 0; };
  CP.cSO4 = function () { return this.conc('HSO4-') + this.conc('SO4^2-'); };
  CP.cNO3 = function () { return this.conc('NO3-'); };
  CP.hasCat = function (c) { return this.catalyst === c; };
  CP.strongAcidMedium = function () { return this.conc('H+') >= 0.3 || this.cSO4() >= 5 || this.hasCat('H2SO4') || this.hasCat('H3PO4'); };
  // 质子来源规划
  CP.drawProtons = function (need, pKaMax) {
    const plan = []; let left = need;
    const hp = Math.min(this.n('H+'), left); if (hp > 1e-15) { plan.push({ a: 'H+', b: null, w: 0, amt: hp }); left -= hp; }
    const cands = [];
    D.SYSTEMS.forEach(sys => { if (sys.hyd) return; for (let i = 0; i < sys.forms.length - 1; i++) { if (sys.pKa[i] <= pKaMax && this.n(sys.forms[i]) > 1e-15 && SP[sys.forms[i]].ph !== 'g') cands.push({ a: sys.forms[i], b: sys.forms[i + 1], w: sys.w[i], pKa: sys.pKa[i] }); } });
    cands.sort((x, y) => x.pKa - y.pKa);
    for (const c of cands) { if (left <= 1e-15) break; const t = Math.min(this.n(c.a), left); if (t > 0) { plan.push({ a: c.a, b: c.b, w: c.w, amt: t }); left -= t; } }
    return { plan, got: need - left };
  };
  CP.availProtons = function (pKaMax) { return this.drawProtons(1e9, pKaMax).got; };
  // 反应应用
  CP.hOf = function (id) { const h = SP[id] ? SP[id].H : null; if (h === null || h === undefined) { this.missingH.add(id); return 0; } return h; };
  CP.rxn = function (o) {
    // o: {type,name,react,prod,x,why,minor,ph,note,qual,eqx(max possible extent)}
    let x = o.x;
    let limId = null, limv = Infinity;
    for (const id in o.react) {
      if ((id === 'H2O' || id === 'H+') && !o.limitAll) continue;
      const lim = this.n(id) / o.react[id];
      if (lim < limv) { limv = lim; limId = id; }
    }
    if (x === undefined || x > limv) x = limv;
    if (!isFinite(x) || x < (o.tol === undefined ? 1e-12 : o.tol)) return 0;
    if (o.xmax !== undefined && x > o.xmax) x = o.xmax;
    for (const id in o.react) this.add(id, -o.react[id] * x);
    for (const id in o.prod) this.add(id, o.prod[id] * x);
    let dHu = 0;
    for (const id in o.prod) dHu += o.prod[id] * this.hOf(id);
    for (const id in o.react) dHu -= o.react[id] * this.hOf(id);
    if (!o.noHeat) this.dH += dHu * x;
    const key = (o.type || '') + '|' + (o.name || '') + '|' + eqHTML(o.react, o.prod).html;
    let ev = this.evmap[key];
    if (!ev) {
      ev = { type: o.type, name: o.name, react: Object.assign({}, o.react), prod: Object.assign({}, o.prod), x: 0, dHu, why: o.why || '', minor: !!o.minor, ph: o.ph || [], note: o.note || '', limiting: limId, xlim: limv, qual: !!o.qual, xmaxPossible: o.xmaxPossible, combustion: !!o.combustion, Ecell: o.Ecell, nTransfer: o.nTransfer, noHeat: !!o.noHeat };
      this.evmap[key] = ev; this.events.push(ev);
    }
    ev.x += x; if (o.why && !ev.why) ev.why = o.why; ev.limiting = limId || ev.limiting;
    if (o.xmaxPossible !== undefined) ev.xmaxPossible = o.xmaxPossible;
    return x;
  };

  // ---------------- 添加试剂 ----------------
  function buildLedger(ctx, adds) {
    const errs = [];
    adds.forEach((a, idx) => {
      const r = REAGBY[a.rid]; if (!r) { errs.push('未知试剂: ' + a.rid); return; }
      ctx.ids.add(r.id);
      const label = r.name;
      if (a.mode === 'solid') {
        if (r.form !== 's') { errs.push(label + ' 不能按固体称量加入'); return; }
        const m = +a.mass; if (!(m > 0)) { errs.push(label + ': 质量必须 > 0'); return; }
        const M = SP[r.sp].M, n = m / M; ctx.add(r.sp, n); ctx.mass += m; ctx.cpSum += m * (CP_SOLID[r.sp] || 0.85); ctx.added = ctx.added || {}; ctx.added[r.sp] = (ctx.added[r.sp] || 0) + n;
        ctx.reag.push({ r, mode: 'solid', n, m, sp: r.sp, desc: fnum(m, 3) + ' g' });
        ctx.logp('• ' + label + ' ' + fnum(m, 3) + ' g ÷ M(' + fnum(M, 3) + ' g/mol) = <b>' + fnum(n * 1000, 3) + ' mmol</b>');
      } else if (a.mode === 'liquid') {
        if (r.form !== 'l') { errs.push(label + ' 不是纯液体试剂'); return; }
        const v = +a.volume; if (!(v > 0)) { errs.push(label + ': 体积必须 > 0'); return; }
        const m = v * r.rho, M = SP[r.sp].M, n = m / M; ctx.add(r.sp, n); ctx.mass += m; ctx.V += v; ctx.added = ctx.added || {}; ctx.added[r.sp] = (ctx.added[r.sp] || 0) + n;
        ctx.cpSum += m * (SP[r.sp].cp || 2.0);
        ctx.reag.push({ r, mode: 'liquid', n, m, sp: r.sp, v, desc: fnum(v, 2) + ' mL' });
        ctx.logp('• ' + label + ' ' + fnum(v, 2) + ' mL × ρ ' + r.rho + ' g/mL = ' + fnum(m, 3) + ' g ÷ M(' + fnum(M, 3) + ') = <b>' + fnum(n * 1000, 3) + ' mmol</b>');
      } else if (a.mode === 'solution') {
        if (!(r.form === 'aq' || r.solution)) { errs.push(label + ' 不适合配成水溶液加入'); return; }
        const v = +a.volume, c = +a.conc; if (!(v > 0) || !(c > 0)) { errs.push(label + ': 体积与浓度必须 > 0'); return; }
        if (r.cmax && c > r.cmax * 1.0001) { errs.push(label + ': 浓度 ' + c + ' mol/L 超过最大可得浓度 ' + r.cmax + ' mol/L'); return; }
        const Mr = r.M || SP[r.sp].M, n = v * c / 1000, dk = r.dk !== undefined ? r.dk : 0.00065 * Mr;
        const rho = 1 + dk * c, m = v * rho, mSol = n * Mr, mw = m - mSol;
        if (mw <= 0) { errs.push(label + ': 浓度过高, 溶剂水质量 ≤ 0'); return; }
        const diss = r.diss || { [r.sp]: 1 };
        for (const id in diss) { ctx.add(id, n * diss[id]); ctx.added = ctx.added || {}; ctx.added[id] = (ctx.added[id] || 0) + n * diss[id]; ctx.src = ctx.src || {}; (ctx.src[id] = ctx.src[id] || []).push(r.id); }
        ctx.add('H2O', mw / 18.015); ctx.mass += m; ctx.V += v;
        const gL = mSol / (v / 1000);
        ctx.cpSum += m * Math.max(3.3, 4.184 - 0.0035 * gL);
        ctx.reag.push({ r, mode: 'solution', n, m, v, c, desc: fnum(v, 2) + ' mL × ' + fnum(c, 4) + ' mol/L', diss });
        ctx.logp('• ' + label + ' ' + fnum(v, 2) + ' mL × ' + fnum(c, 4) + ' mol/L → n = <b>' + fnum(n * 1000, 3) + ' mmol</b> (溶液密度≈' + fnum(rho, 3) + ' g/mL, 质量 ' + fnum(m, 2) + ' g, 含水 ' + fnum(mw, 2) + ' g)');
        if (r.id === 'H2SO4') ctx.sol.push({ id: 'H2SO4', n, nw: (mw / 18.015) / n });
      } else errs.push('未知加入方式');
    });
    return errs;
  }
  // 浓硫酸稀释的"过量焓"(相对无限稀释), kJ/mol H2SO4, 随 n(H2O)/n(H2SO4)=nw 变化; 取积分溶解热表的插值 (近似)
  const H2SO4_TAB = [[0, 0], [1, -28.1], [2, -41.9], [5, -58.0], [10, -67.0], [25, -75.0], [50, -80.0], [100, -86.0], [500, -92.5], [5000, -95.0], [1e9, -95.3]];
  function excessH2SO4(nw) { return 95.3 + interp(H2SO4_TAB, nw); } // 与无限稀释相比多出的焓 (kJ/mol)

  // ---------------- 安全过滤 ----------------
  const ORG_NITR = ['C3H8O3', 'CH4N2O', 'C7H8', 'C6H6O', 'C7H6O2', 'C7H6O3', 'C9H8O4', 'C6H12O6', 'C12H22O11', 'C2H5OH', 'CH3OH', 'C3H6O', 'C6H14', 'C4H6O3', 'CH3COOC2H5'];
  const ORG_ALL = D.REAG.filter(r => r.cat === '有机物').map(r => r.id);
  const FUEL_DRY = ['S', 'C', 'Al', 'Mg', 'Zn', 'Fe', 'Ca', 'Na', 'K', 'C6H12O6', 'C12H22O11', 'CH4N2O', 'C6H6O', 'C3H8O3', 'C2H5OH', 'CH3OH', 'C3H6O', 'C6H14', 'C7H8', 'C9H8O4', 'C7H6O3', 'C7H6O2'];
  function checkBlocked(adds) {
    const ids = {}; adds.forEach(a => { ids[a.rid] = a; });
    const has = k => k in ids;
    const anyOf = arr => arr.some(has);
    const aqAdd = a => a.mode === 'solution' || a.mode === 'liquid' && a.rid === 'H2O';
    const waterPresent = adds.some(a => a.mode === 'solution' || (a.mode === 'liquid' && a.rid === 'H2O'));
    const msg = '该组合属于本模拟器不支持的类别（可能涉及爆炸性/危险敏感混合物、毒剂或违禁品相关化学），因此不提供任何反应结果或条件。';
    if (has('HNO3') && anyOf(ORG_NITR)) return msg;
    if (has('HNO3') && has('H2SO4')) return msg;
    if (has('H2O2')) {
      const a = ids['H2O2'];
      if (has('C3H6O')) return msg;
      if (a.mode === 'solution' && (+a.conc) >= 3 && anyOf(ORG_ALL)) return msg;
    }
    if (has('KMnO4') && has('H2SO4') && ids['H2SO4'].mode === 'solution' && (+ids['H2SO4'].conc) >= 12) return msg;
    if (has('I2') && has('NH3')) return msg;
    if (has('AgNO3') && has('NH3') && (has('NaOH') || has('KOH') || has('Ca(OH)2'))) return msg;
    const oxSolid = ['KNO3', 'NaNO3', 'KMnO4', 'K2Cr2O7', 'Pb(NO3)2'];
    if (!waterPresent && anyOf(oxSolid)) {
      const fuelsHit = FUEL_DRY.filter(has);
      // 允许的唯一例外: 高锰酸钾 + 液态醇/甘油 的"氧化着火"演示不在此拦截
      const exempt = ['C3H8O3', 'C2H5OH', 'CH3OH'];
      const hit = fuelsHit.filter(f => !(has('KMnO4') && exempt.includes(f)));
      if (hit.length) return msg;
    }
    if (!waterPresent && (has('NH4Cl') || has('(NH4)2SO4')) && anyOf(['KNO3', 'NaNO3', 'Pb(NO3)2', 'AgNO3'])) return msg;
    return null;
  }

  g.__ChemEngineInternals = null;
  const API = { D, SP, REAGBY, SYSOF, dispId, plain, intify, eqHTML, interp, fnum, computePH, speciation, solutionColor, colorName, indicatorColor, solveEq, Ctx, buildLedger, excessH2SO4, checkBlocked, CNAME, GASINFO, CP_SOLID, hex2rgb, waterGrams, R_GAS, FARA, KW, EPS, ORG_ALL, ORG_NITR };
  g.__EngineBase = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
