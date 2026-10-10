/* 虚拟化学实验室 —— 原电池 (Galvanic cell) 计算
 * 两个半电池 + 盐桥: E°cell、Nernst 方程、ΔG、K、最大电功、放电曲线、电极质量变化。
 */
(function (g) {
  'use strict';
  const D = (typeof require !== 'undefined' && typeof module !== 'undefined') ? (require('./data.js'), require('./data2.js')) : g.ChemData;
  const R = 8.314462, F = 96485.33;
  // 电对定义: ox/red: [{sp, nu, conc:bool}] (nu: 还原式 ox + n e- = red 中的计量数); 固体/液体活度 = 1
  function metal(m, ion, n, E0, name) { return { id: m, name: name, E0, n, ox: [{ sp: ion, nu: 1, conc: true }], red: [{ sp: m, nu: 1, conc: false, solid: true }], electrode: m, ionLabel: ion }; }
  const M = D.METALS;
  const COUPLES = [
    metal('Mg', 'Mg^2+', 2, M.Mg.E, 'Mg²⁺/Mg'), metal('Al', 'Al^3+', 3, M.Al.E, 'Al³⁺/Al'), metal('Zn', 'Zn^2+', 2, M.Zn.E, 'Zn²⁺/Zn'), metal('Fe', 'Fe^2+', 2, M.Fe.E, 'Fe²⁺/Fe'),
    metal('Ni', 'Ni^2+', 2, M.Ni.E, 'Ni²⁺/Ni'), metal('Pb', 'Pb^2+', 2, M.Pb.E, 'Pb²⁺/Pb'), metal('Cu', 'Cu^2+', 2, M.Cu.E, 'Cu²⁺/Cu'), metal('Ag', 'Ag+', 1, M.Ag.E, 'Ag⁺/Ag'),
    { id: 'SHE', name: 'H⁺/H₂ (标准氢电极)', E0: 0, n: 2, ox: [{ sp: 'H+', nu: 2, conc: true }], red: [{ sp: 'H2', nu: 1, gas: true }], inert: 'Pt', hasPH: true, hasP: true },
    { id: 'Fe3', name: 'Fe³⁺/Fe²⁺ (Pt 惰性电极)', E0: 0.771, n: 1, ox: [{ sp: 'Fe^3+', nu: 1, conc: true }], red: [{ sp: 'Fe^2+', nu: 1, conc: true }], inert: 'Pt', redox: true },
    { id: 'MnO4', name: 'MnO₄⁻/Mn²⁺ (酸性, Pt)', E0: 1.507, n: 5, ox: [{ sp: 'MnO4-', nu: 1, conc: true }, { sp: 'H+', nu: 8, conc: true, ph: true }], red: [{ sp: 'Mn^2+', nu: 1, conc: true }, { sp: 'H2O', nu: 4, conc: false }], inert: 'Pt', redox: true, hasPH: true },
    { id: 'Cr2O7', name: 'Cr₂O₇²⁻/Cr³⁺ (酸性, Pt)', E0: 1.33, n: 6, ox: [{ sp: 'Cr2O7^2-', nu: 1, conc: true }, { sp: 'H+', nu: 14, conc: true, ph: true }], red: [{ sp: 'Cr^3+', nu: 2, conc: true }, { sp: 'H2O', nu: 7, conc: false }], inert: 'Pt', redox: true, hasPH: true },
    { id: 'I2', name: 'I₂/I⁻ (Pt)', E0: 0.536, n: 2, ox: [{ sp: 'I2', nu: 1, conc: false, solid: true }], red: [{ sp: 'I-', nu: 2, conc: true }], inert: 'Pt', redox: false },
    { id: 'Br2', name: 'Br₂/Br⁻ (Pt)', E0: 1.066, n: 2, ox: [{ sp: 'Br2', nu: 1, conc: false }], red: [{ sp: 'Br-', nu: 2, conc: true }], inert: 'Pt', redox: false },
  ];
  const BYID = {}; COUPLES.forEach(c => BYID[c.id] = c);

  // 单个半电池的还原电势 (Nernst): E = E° − (RT/nF)·ln( Πa(red)^ν / Πa(ox)^ν )
  function halfE(c, st, TK) {
    // st: { cox, cred, pH, P }  (单位 mol/L; P in atm)
    let lnQ = 0;
    c.red.forEach(s => { let a = 1; if (s.conc) a = Math.max(st.cred !== undefined && !c.id.match(/^(Mg|Al|Zn|Fe|Ni|Pb|Cu|Ag)$/) ? st.cred : 1, 1e-300); if (s.gas) a = Math.max(st.P === undefined ? 1 : st.P, 1e-300); if (s.conc || s.gas) lnQ += s.nu * Math.log(a); });
    c.ox.forEach(s => { let a = 1; if (s.ph) a = Math.pow(10, -(st.pH === undefined ? 0 : st.pH)); else if (s.sp === 'H+' && c.id === 'SHE') a = Math.pow(10, -(st.pH === undefined ? 0 : st.pH)); else if (s.conc) a = Math.max(st.cox, 1e-300); if (s.conc || s.ph) lnQ -= s.nu * Math.log(a); });
    return c.E0 - R * TK / (c.n * F) * lnQ;
  }
  function stateOf(c, h) { // 规范化输入
    const st = { cox: +h.cox, cred: +h.cred, pH: +h.pH, P: +h.P };
    if (!(st.cox > 0)) st.cox = 1; if (!(st.cred > 0)) st.cred = 1; if (isNaN(st.pH)) st.pH = 0; if (!(st.P > 0)) st.P = 1;
    if (c.id === 'SHE' && h.cox !== undefined && h.cox !== '' && !h.pH && h.pH !== 0) st.pH = -Math.log10(st.cox);
    return st;
  }
  function lcm(a, b) { const gcd = (x, y) => y ? gcd(y, x % y) : x; return a / gcd(a, b) * b; }
  function addTo(map, sp, v) { map[sp] = (map[sp] || 0) + v; }
  function eqHTML(react, prod) { return (D.__eqHTML ? D.__eqHTML(react, prod) : null); }

  // 主函数
  function galvanic(spec) {
    const TK = (spec.T === undefined || spec.T === '' || isNaN(+spec.T) ? 25 : +spec.T) + 273.15;
    const cl = BYID[spec.left.couple], cr = BYID[spec.right.couple];
    if (!cl || !cr) return { error: '未知电对' };
    const sl = stateOf(cl, spec.left), sr = stateOf(cr, spec.right);
    const El = halfE(cl, sl, TK), Er = halfE(cr, sr, TK);
    const leftIsCathode = El >= Er; // 同电势取右为阴极
    const cat = leftIsCathode ? { c: cl, s: sl, E: El, side: 'left' } : { c: cr, s: sr, E: Er, side: 'right' };
    const an = leftIsCathode ? { c: cr, s: sr, E: Er, side: 'right' } : { c: cl, s: sl, E: El, side: 'left' };
    const E = cat.E - an.E, E0 = cat.c.E0 - an.c.E0;
    const L = lcm(cat.c.n, an.c.n), kc = L / cat.c.n, ka = L / an.c.n;
    // 总反应: 阴极 ox×kc + ne → red×kc ;  阳极 red×ka → ox×ka + ne
    const react = {}, prod = {};
    cat.c.ox.forEach(s => addTo(react, s.sp, s.nu * kc)); cat.c.red.forEach(s => addTo(prod, s.sp, s.nu * kc));
    an.c.red.forEach(s => addTo(react, s.sp, s.nu * ka)); an.c.ox.forEach(s => addTo(prod, s.sp, s.nu * ka));
    Object.keys(react).forEach(k => { if (k in prod) { const m = Math.min(react[k], prod[k]); react[k] -= m; prod[k] -= m; } });
    Object.keys(react).forEach(k => { if (react[k] < 1e-12) delete react[k]; }); Object.keys(prod).forEach(k => { if (prod[k] < 1e-12) delete prod[k]; });
    const out = { T: TK - 273.15, El, Er, E, E0, nElectrons: L, cathode: { couple: cat.c.id, name: cat.c.name, side: cat.side, E: cat.E, E0: cat.c.E0 }, anode: { couple: an.c.id, name: an.c.name, side: an.side, E: an.E, E0: an.c.E0 }, react, prod };
    out.dG0 = -L * F * E0 / 1000; out.dG = -L * F * E / 1000; out.K = Math.exp(L * F * E0 / (R * TK)); out.logK = L * F * E0 / (R * TK) / Math.LN10;
    out.Q = Math.exp(L * F * (E0 - E) / (R * TK)); // E = E° − (RT/nF) ln Q
    out.Wmax = L * F * E / 1000; // kJ / (mol 反应式)
    out.concentrationCell = cl.id === cr.id;
    out.spontaneous = E > 1e-6;
    out.bridge = spec.bridge === undefined ? 'KNO3' : spec.bridge;
    out.circuit = out.bridge !== 'none';
    out.halfCathode = cat.c.ox.map(s => (s.nu * kc > 1 ? s.nu * kc + ' ' : '') + D.fmt(s.sp)).join(' + ') + ' + ' + L + 'e⁻ → ' + cat.c.red.map(s => (s.nu * kc > 1 ? s.nu * kc + ' ' : '') + D.fmt(s.sp)).join(' + ');
    out.halfAnode = an.c.red.map(s => (s.nu * ka > 1 ? s.nu * ka + ' ' : '') + D.fmt(s.sp)).join(' + ') + ' → ' + an.c.ox.map(s => (s.nu * ka > 1 ? s.nu * ka + ' ' : '') + D.fmt(s.sp)).join(' + ') + ' + ' + L + 'e⁻';
    out.overall = Object.keys(react).map(k => (react[k] === 1 ? '' : react[k] + ' ') + D.fmt(k)).join(' + ') + ' → ' + Object.keys(prod).map(k => (prod[k] === 1 ? '' : prod[k] + ' ') + D.fmt(k)).join(' + ');
    out.cationFlow = '盐桥中阳离子(' + (out.bridge === 'KCl' ? 'K⁺' : 'K⁺') + ')向阴极半电池迁移，阴离子(' + (out.bridge === 'KCl' ? 'Cl⁻' : 'NO₃⁻') + ')向阳极半电池迁移，维持两侧电中性、构成内电路';
    out.electronFlow = '外电路: 电子从阳极(' + an.c.name + ', 负极)流向阴极(' + cat.c.name + ', 正极)';
    // 放电模拟 (恒流 I, 体积 V1/V2 mL) —— 逐步改变两侧浓度
    if (spec.I > 0 && out.circuit && out.spontaneous) {
      const V = { left: (+spec.left.V || 100) / 1000, right: (+spec.right.V || 100) / 1000 };
      const cs = { left: Object.assign({}, sl), right: Object.assign({}, sr) };
      const aSide = an.side, cSide = cat.side;
      const curve = []; let q = 0, W = 0; const I = +spec.I; const tMax = +spec.t > 0 ? +spec.t : Infinity;
      const qMaxA = an.c.red.some(s => s.conc) ? Math.min.apply(null, an.c.red.filter(s => s.conc).map(s => cs[aSide].cred * V[aSide] * an.c.n * F / s.nu)) : Infinity;
      const qMaxC = cat.c.ox.some(s => s.conc && !s.ph) ? Math.min.apply(null, cat.c.ox.filter(s => s.conc && !s.ph).map(s => cs[cSide].cox * V[cSide] * cat.c.n * F / s.nu)) : Infinity;
      const qLim = Math.min(qMaxA, qMaxC) * 0.999;
      const qStop = Math.min(I * tMax, qLim); const N = 400; let reason = '';
      let Ecur = E; curve.push({ q: 0, t: 0, E: Ecur });
      for (let i = 1; i <= N; i++) {
        const qn = qStop * i / N; const dq = qn - q;
        // 阳极: red→ox; 阴极: ox→red
        const ea = dq / (an.c.n * F), ec = dq / (cat.c.n * F);
        const A = cs[aSide], C = cs[cSide];
        if (an.c.ox.some(s => s.conc && !s.ph) && !an.c.redox) A.cox += ea * an.c.ox.find(s => s.conc && !s.ph).nu / V[aSide];
        else if (an.c.redox) { A.cox += ea * an.c.ox.find(s => s.conc && !s.ph).nu / V[aSide]; A.cred = Math.max(A.cred - ea * an.c.red.find(s => s.conc).nu / V[aSide], 1e-12); }
        if (!an.c.redox && an.c.red.some(s => s.conc)) A.cred = Math.max(A.cred - ea * an.c.red.find(s => s.conc).nu / V[aSide], 1e-12);
        if (cat.c.ox.some(s => s.conc && !s.ph)) C.cox = Math.max(C.cox - ec * cat.c.ox.find(s => s.conc && !s.ph).nu / V[cSide], 1e-12);
        if (cat.c.redox || cat.c.red.some(s => s.conc)) C.cred += ec * cat.c.red.find(s => s.conc).nu / V[cSide];
        if (cat.c.hasPH && cat.c.ox.some(s => s.ph)) { const h = Math.pow(10, -C.pH) - ec * cat.c.ox.find(s => s.ph).nu / V[cSide]; C.pH = -Math.log10(Math.max(h, 1e-14)); }
        if (an.c.hasPH && an.c.ox.some(s => s.ph)) { const h = Math.pow(10, -A.pH) + ea * an.c.ox.find(s => s.ph).nu / V[aSide]; A.pH = -Math.log10(h); }
        const En = halfE(cat.c, C, TK) - halfE(an.c, A, TK);
        W += (Ecur + En) / 2 * dq; Ecur = En; q = qn; curve.push({ q, t: q / I, E: En });
        if (En <= 1e-4) { reason = '电动势降至 0 (电池达到化学平衡, Q = K)'; break; }
      }
      if (!reason) reason = qStop === qLim ? '限量离子耗尽' : '达到设定的放电时间';
      out.discharge = { curve, q, t: q / I, W, reason, mass: {} };
      // 电极质量变化
      const mA = an.c.electrode ? q / (an.c.n * F) * D.SP[an.c.electrode].M : null, mC = cat.c.electrode ? q / (cat.c.n * F) * D.SP[cat.c.electrode].M : null;
      if (mA !== null) out.discharge.mass.anode = { metal: an.c.electrode, dm: -mA, n: q / (an.c.n * F) };
      if (mC !== null) out.discharge.mass.cathode = { metal: cat.c.electrode, dm: +mC, n: q / (cat.c.n * F) };
      out.discharge.final = { left: cs.left, right: cs.right };
    }
    return out;
  }
  const API = { COUPLES, BYID, galvanic, halfE, R, F };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else g.ChemEchem = API;
})(typeof window !== 'undefined' ? window : globalThis);
