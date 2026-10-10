/* 虚拟化学实验室 —— 实验运行、结果整理、电解、滴定 */
(function (g) {
  'use strict';
  const B = (typeof require !== 'undefined' && typeof module !== 'undefined') ? (require('./react.js'), require('./react2.js')) : g.__EngineBase;
  const { D, SP, REAGBY, dispId, plain, intify, eqHTML, fnum, computePH, speciation, solutionColor, colorName, indicatorColor, Ctx, buildLedger, excessH2SO4, checkBlocked, CNAME, GASINFO, waterGrams, R_GAS, FARA, interp } = B;
  const RU = B.rules;
  D.REAG.forEach(r => { if (r.id === 'H2SO4') r.molIons = { 'H+': 2, 'SO4^2-': 1 }; });

  function checkBalance(react, prod) {
    const atoms = {}; let q = 0;
    function acc(map, sgn) { for (const id in map) { const comp = D.parseComp(id); for (const e in comp) atoms[e] = (atoms[e] || 0) + sgn * comp[e] * map[id]; q += sgn * (SP[id] ? SP[id].q : D.chargeOf(id)) * map[id]; } }
    acc(react, 1); acc(prod, -1);
    const bad = Object.keys(atoms).filter(e => Math.abs(atoms[e]) > 1e-6);
    return { ok: bad.length === 0 && Math.abs(q) < 1e-6, atoms: bad.map(e => e + ':' + atoms[e].toFixed(4)), charge: q };
  }

  // ---------- 分子方程式 (尽力而为) ----------
  function baseOf(id) { return D.stripId(id); }
  function poly(b) { return (b.match(/[A-Z]/g) || []).length > 1 || /\d/.test(b); }
  function saltFormula(cat, an) {
    if (cat === 'H+' && an === 'OH-') return 'H2O';
    const zc = Math.abs(SP[cat].q), za = Math.abs(SP[an].q);
    const gg = (function gc(a, b) { return b ? gc(b, a % b) : a; })(zc, za);
    const nc = za / gg, na = zc / gg; const cb = baseOf(cat), ab = baseOf(an);
    const C = (nc > 1 ? (poly(cb) ? '(' + cb + ')' : cb) + nc : cb), A = (na > 1 ? (poly(ab) ? '(' + ab + ')' : ab) + na : ab);
    const f = /^(CH3|HCOO|C\d)/.test(ab) ? A + C : C + A;
    return { f, nc };
  }
  function molecularEq(ctx, ev) {
    const isIon = id => SP[id] && SP[id].ph === 'aq' && SP[id].q !== 0;
    const react = ev.react, prod = ev.prod;
    if (!Object.keys(react).some(isIon) && !Object.keys(prod).some(isIon)) return null;
    const reagentAmt = {}, rmap = {}, pmap = {}, pool = {};
    for (const id in react) {
      if (isIon(id)) {
        const rid = (ctx.src && ctx.src[id] || [])[0]; const r = REAGBY[rid]; if (!r) return null;
        const ions = r.molIons || r.diss; if (!ions || !ions[id]) return null;
        reagentAmt[rid] = Math.max(reagentAmt[rid] || 0, react[id] / ions[id]);
      } else rmap[dispId(id)] = (rmap[dispId(id)] || 0) + react[id];
    }
    for (const rid in reagentAmt) {
      const r = REAGBY[rid], ions = r.molIons || r.diss, amt = reagentAmt[rid];
      for (const j in ions) { if (!isIon(j)) continue; const left = amt * ions[j] - (react[j] || 0); if (left > 1e-9) pool[j] = (pool[j] || 0) + left; }
      const f = D.fmt((r.fdisp || r.f).replace(/^(\d)/, '$1')) + '<span class="st">(aq)</span>';
      rmap[f] = (rmap[f] || 0) + amt;
    }
    const pc = {}, pa = {}; const prodCat = {}, prodAn = {};
    for (const id in prod) {
      if (isIon(id)) { if (SP[id].q > 0) prodCat[id] = prod[id]; else prodAn[id] = prod[id]; } else pmap[dispId(id)] = (pmap[dispId(id)] || 0) + prod[id];
    }
    const poolC = {}, poolA = {}; for (const j in pool) { if (SP[j].q > 0) poolC[j] = pool[j]; else poolA[j] = pool[j]; }
    function pairUp(ionsMap, partnerPool, ionIsCat) {
      for (const i in ionsMap) {
        let left = ionsMap[i]; const zi = Math.abs(SP[i].q);
        const cands = Object.keys(partnerPool).sort((a, b) => partnerPool[b] - partnerPool[a]);
        for (const j of cands) {
          if (left < 1e-9) break; if (partnerPool[j] < 1e-9) continue;
          const zj = Math.abs(SP[j].q);
          const p = Math.min(left, partnerPool[j] * zj / zi);
          const sf = ionIsCat ? saltFormula(i, j) : saltFormula(j, i);
          const cationAmt = ionIsCat ? p : p * zi / zj; // 阳离子摩尔数
          const cmp = sf.f === 'H2O' ? dispId('H2O') : D.fmt(sf.f) + '<span class="st">(aq)</span>';
          const nCmp = sf.f === 'H2O' ? cationAmt : cationAmt / sf.nc;
          pmap[cmp] = (pmap[cmp] || 0) + nCmp; left -= p; partnerPool[j] -= p * zi / zj;
        }
        if (left > 1e-7) return false;
      }
      return true;
    }
    if (!pairUp(prodCat, poolA, true)) return null;
    if (!pairUp(prodAn, poolC, false)) return null;
    if (!pairUp(poolC, poolA, true)) return null;
    for (const j in poolA) if (poolA[j] > 1e-7) return null;
    // 约去两边相同的项
    Object.keys(rmap).forEach(k => { if (k in pmap) { const m = Math.min(rmap[k], pmap[k]); rmap[k] -= m; pmap[k] -= m; } });
    const all = {}; Object.keys(rmap).forEach(k => { if (rmap[k] > 1e-9) all['r:' + k] = rmap[k]; }); Object.keys(pmap).forEach(k => { if (pmap[k] > 1e-9) all['p:' + k] = pmap[k]; });
    if (!Object.keys(all).length) return null;
    const it = intify(all); const L = [], Rr = [];
    Object.keys(it.ints).forEach(k => { const t = (it.ints[k] === 1 ? '' : it.ints[k] + ' ') + k.slice(2); (k[0] === 'r' ? L : Rr).push(t); });
    if (!L.length || !Rr.length) return null;
    return L.join(' + ') + ' → ' + Rr.join(' + ');
  }

  // ---------- 不反应的解释: 金属活动性/电极电势 ----------
  function explainNoRedox(ctx) {
    const out = []; const pH = ctx.aq() ? ctx.pH() : 7;
    Object.keys(D.METALS).forEach(m => {
      if (ctx.n(m) < 1e-9) return; const Em = D.METALS[m].E;
      D.HALF.forEach(h => {
        if (!h.metal || h.metal === m) return; const ion = Object.keys(h.lhs)[0]; if (ctx.n(ion) < 1e-9) return;
        const Ecell = h.E0 - Em;
        out.push('金属 ' + dispId(m) + ' 与 ' + dispId(ion) + ': E°cell = E°(' + RU.halfName(h) + ') − E°(' + D.fmt(D.METALS[m].ion.replace(/\^/, '^')) + ' / ' + D.fmt(m) + ') = ' + fnum(h.E0, 3) + ' − (' + fnum(Em, 3) + ') = ' + fnum(Ecell, 3) + ' V ' + (Ecell > 0 ? '> 0 (但受动力学限制)' : '< 0 → 不能自发置换 (金属活动性: ' + (Em > h.E0 ? m + ' 比 ' + h.metal + ' 不活泼' : '') + ')'));
      });
      if (ctx.aq() && (ctx.n('H+') > 1e-9 || ctx.availProtons(6) > 1e-9)) {
        const Eh = -0.05916 * pH; const Ecell = Eh - Em;
        if (Ecell <= 0.05) out.push('金属 ' + dispId(m) + ' 与酸: E°(H⁺/H₂) = ' + fnum(Eh, 3) + ' V' + (Math.abs(pH) > 0.01 ? ' (pH=' + fnum(pH, 1) + ')' : '') + ' ≤ E°(' + D.fmt(D.METALS[m].ion) + '/' + m + ') = ' + fnum(Em, 3) + ' V → E°cell = ' + fnum(Ecell, 3) + ' V < 0，位于氢之后的金属不能置换出氢气 (需氧化性酸如硝酸/热浓硫酸)');
      }
    });
    return out;
  }

  // ---------- 主入口 ----------
  function run(setup) {
    setup = setup || {};
    const adds = (setup.additions || []).filter(a => a && a.rid);
    if (!adds.length) return { status: 'invalid', verdict: '尚未加入试剂', message: '请先向容器中加入至少一种试剂。', events: [], log: [], hazards: [], phen: [] };
    const blk = checkBlocked(adds);
    if (blk) return { status: 'unsupported', verdict: '不支持', message: blk, events: [], log: [], hazards: [], phen: [], reasons: [] };
    const ctx = new Ctx(setup);
    const vessel = D.VESSELS.find(v => v.id === setup.vessel) || D.VESSELS[0];
    let T0 = setup.ice ? 0 : (setup.T0 === undefined || setup.T0 === null || isNaN(setup.T0) ? 25 : +setup.T0);
    ctx.T = ctx.T0 = T0;
    ctx.logp('<b>【实验条件】</b> 容器: ' + vessel.name + '；初始温度 ' + fnum(T0, 1) + ' °C' + (setup.ice ? ' (冰浴)' : '') + (setup.plate ? '，加热板恒温' : '，无外部控温') + '；气氛: ' + (ctx.atm === 'air' ? '空气' : '氮气') + '；催化剂: ' + ((D.CATALYSTS.find(c => c.id === ctx.catalyst) || {}).name || '无') + (ctx.ignite ? '；点火源: 开' : ''));
    const stages = {}; adds.forEach(a => { const s = a.stage || 1; (stages[s] = stages[s] || []).push(a); });
    const keys = Object.keys(stages).map(Number).sort((a, b) => a - b);
    let first = true;
    for (const s of keys) {
      ctx.logp('<b>【' + (keys.length > 1 ? '步骤 ' + s + ' · ' : '') + '加入试剂 → 物质的量】</b>');
      const errs = buildLedger(ctx, stages[s]);
      if (errs.length) return { status: 'invalid', verdict: '输入有误', message: errs.join('；'), events: [], log: ctx.log, hazards: [], phen: [] };
      if (ctx.aq() && ctx.T > 100) { ctx.notes.push('含水体系: 敞口容器内水在 100 °C 沸腾，温度被限制在 100 °C (更高温度需油浴/无水体系)'); ctx.T = ctx.T0 = 100; }
      if (first) { RU.rDissolve(ctx); ctx.L0 = Object.assign({}, ctx.L); ctx.V0 = ctx.V; first = false; }
      RU.loopRules(ctx);
      if (keys.length > 1) ctx.logp('步骤 ' + s + ' 完成后: ' + (ctx.events.filter(e => !e.minor).length) + ' 个化学反应事件');
    }
    // 电解
    let elec = null;
    if (setup.electro && setup.electro.on) { elec = electrolysis(ctx, setup.electro); }
    return finalize(ctx, setup, vessel, elec);
  }

  // ---------- 电解 ----------
  function electrolysis(ctx, p) {
    const out = { on: true, V: +p.V, I: +p.I, t: +p.t, electrode: p.electrode || 'graphite', stages: [], lines: [] };
    if (!ctx.aq()) { out.fail = '电解需要含离子的水溶液 (电解质)。'; return out; }
    const pH0 = ctx.pH(); const Vl = ctx.Vl();
    const ETA = { H2: 0.3, O2: 0.5, Cl2: 0.1 };
    // 金属沉积表面上的析氢过电势 (V): 过电势越大, 该金属越容易在 H⁺ 还原之前沉积 (锌、铅镀层即靠此)
    const ETAON = { Ag: 0.2, Cu: 0.25, Ni: 0.35, Zn: 0.75, Pb: 0.9 };
    const AMET = { copper: { m: 'Cu', ion: 'Cu^2+', z: 2, E: 0.342 }, silver: { m: 'Ag', ion: 'Ag+', z: 1, E: 0.7996 }, nickel: { m: 'Ni', ion: 'Ni^2+', z: 2, E: -0.257 }, zinc: { m: 'Zn', ion: 'Zn^2+', z: 2, E: -0.762 } };
    out.eff = p.eff === undefined || p.eff === '' || isNaN(+p.eff) ? 100 : Math.max(1, Math.min(100, +p.eff)); out.area = +p.area || 0; out.anodeLoss = {}; out.deposit = {};
    let eLeft = out.I * out.t / FARA * out.eff / 100; out.molE = eLeft; out.W = out.V * out.I * out.t / 1000;
    for (let st = 0; st < 6 && eLeft > 1e-12; st++) {
      const pH = ctx.pH();
      const cathodes = [];
      [['Ag+', 'Ag', 1, 0.7996], ['Cu^2+', 'Cu', 2, 0.342], ['Fe^3+', 'Fe^2+', 1, 0.771], ['Ni^2+', 'Ni', 2, -0.257], ['Pb^2+', 'Pb', 2, -0.126], ['Zn^2+', 'Zn', 2, -0.762]].forEach(([ion, pr, z, E]) => { if (ctx.n(ion) > 1e-9) { const eta = ETAON[pr]; if (eta !== undefined && E <= -0.05916 * pH - eta) return; cathodes.push({ type: 'M', ion, prod: pr, z, E, cap: ctx.n(ion) * z }); } });
      let etaH = ETA.H2; cathodes.forEach(c => { if (c.type === 'M' && ETAON[c.prod] !== undefined) etaH = Math.max(etaH, ETAON[c.prod]); });
      cathodes.push({ type: 'H2', E: -0.05916 * pH - etaH, z: 2, cap: Infinity, name: pH < 6 ? '2H⁺ + 2e⁻ → H₂' : '2H₂O + 2e⁻ → H₂ + 2OH⁻' });
      cathodes.sort((a, b) => b.E - a.E); const cat = cathodes[0];
      const anodes = [];
      if (AMET[out.electrode]) anodes.push({ type: 'MAnode', m: AMET[out.electrode].m, ion: AMET[out.electrode].ion, mz: AMET[out.electrode].z, E: AMET[out.electrode].E, z: AMET[out.electrode].z, cap: Infinity });
      [['I-', 'I2', 0.536, 2, '2I⁻ → I₂ + 2e⁻'], ['Br-', 'Br2', 1.066, 2], ['Fe^2+', 'Fe^3+', 0.771, 1], ['Cl-', 'Cl2', 1.358 + ETA.Cl2, 2]].forEach(([ion, pr, E, z]) => { if (ctx.n(ion) > 1e-9 && SP[pr]) anodes.push({ type: 'ION', ion, prod: pr, E, z, cap: ctx.n(ion) }); });
      anodes.push({ type: 'O2', E: 1.229 - 0.05916 * pH + ETA.O2, z: 4, cap: Infinity });
      anodes.sort((a, b) => a.E - b.E); const an = anodes[0];
      const Edec = an.E - cat.E;
      if (st === 0) { out.Edec = Edec; out.lines.push('阴极(还原)取 E 最高者: ' + (cat.type === 'M' ? D.fmt(cat.ion) + ' → ' + D.fmt(cat.prod) : (cat.name)) + ' (E ≈ ' + fnum(cat.E, 3) + ' V，含过电势)；阳极(氧化)取 E 最低者: ' + describeAnode(an) + ' (E ≈ ' + fnum(an.E, 3) + ' V)'); out.lines.push('理论分解电压 E分解 = E(阳极) − E(阴极) = ' + fnum(an.E, 3) + ' − (' + fnum(cat.E, 3) + ') = ' + fnum(Edec, 3) + ' V；外加电压 ' + fnum(out.V, 2) + ' V'); if (out.V < Edec) { out.fail = '外加电压 ' + fnum(out.V, 2) + ' V < 分解电压 ' + fnum(Edec, 2) + ' V，电解不能进行。'; return out; } }
      if (out.V < Edec - 1e-6) break;
      // 每 1 mol e- 对应的物质变化
      const react = {}, prod = {}; const add = (m, k, c) => { m[k] = (m[k] || 0) + c; };
      const ne = 1; // 以 1 mol e- 为单位
      if (cat.type === 'M') { add(react, cat.ion, ne / cat.z); add(prod, cat.prod, ne / cat.z); }
      else if (pH < 6 && ctx.n('H+') > 1e-9) { add(react, 'H+', ne); add(prod, 'H2', ne / 2); }
      else { add(react, 'H2O', ne); add(prod, 'H2', ne / 2); add(prod, 'OH-', ne); }
      if (an.type === 'ION') { if (an.ion === 'Fe^2+') { add(react, 'Fe^2+', ne); add(prod, 'Fe^3+', ne); } else { add(react, an.ion, ne); add(prod, an.prod, ne / 2); } }
      else if (an.type === 'MAnode') { add(react, an.m, ne / an.mz); add(prod, an.ion, ne / an.mz); }
      else { add(react, 'H2O', ne / 2); add(prod, 'O2', ne / 4); add(prod, 'H+', ne); }
      Object.keys(react).forEach(k => { if (k in prod) { const m = Math.min(react[k], prod[k]); react[k] -= m; prod[k] -= m; } });
      Object.keys(react).forEach(k => { if (react[k] < 1e-12) delete react[k]; }); Object.keys(prod).forEach(k => { if (prod[k] < 1e-12) delete prod[k]; });
      let x = eLeft;
      for (const k in react) { if (k === 'H2O' || an.type === 'MAnode' && k === an.m) continue; x = Math.min(x, ctx.n(k) / react[k]); }
      if (x < 1e-12) break;
      const ph = []; if (cat.type === 'M') ph.push({ k: 'deposit' }); if (prod.H2) ph.push({ k: 'bubbles', gas: 'H2' }); if (prod.O2) ph.push({ k: 'bubbles', gas: 'O2' }); if (prod.Cl2) ph.push({ k: 'bubbles', gas: 'Cl2' });
      if (!Object.keys(react).length && !Object.keys(prod).length) { // 活性阳极与阴极为同一金属: 净效应仅是金属从阳极转移到阴极 (电镀/精炼)
        const eqt = D.fmt(an.m) + '(阳极) → ' + D.fmt(cat.prod) + '(阴极上的镀层)';
        if (!ctx._plateEv) { ctx._plateEv = true; ctx.events.push({ type: '电镀 (金属转移)', name: '阳极 ' + SP[an.m].cn + ' 溶解，阴极析出同种金属', react: {}, prod: {}, x: 0, dHu: 0, minor: false, qual: true, eqText: eqt, why: '阳极 ' + D.fmt(an.m) + ' → ' + D.fmt(an.ion) + ' + ' + an.mz + 'e⁻，阴极 ' + D.fmt(cat.ion) + ' + ' + cat.z + 'e⁻ → ' + D.fmt(cat.prod) + '：两极半反应相消，电解液组成基本不变；电镀/电解精炼的原理 (理论分解电压≈0，只需克服过电势与溶液电阻)。', ph: [{ k: 'deposit' }] }); }
        eLeft -= x; out.anodeLoss[an.m] = (out.anodeLoss[an.m] || 0) + x / an.mz; out.deposit[cat.prod] = (out.deposit[cat.prod] || 0) + x / cat.z; out.stages.push({ cat: cat.ion, an: an.m, ne: x }); continue;
      }
      if (an.type === 'MAnode' && react[an.m]) ctx.add(an.m, react[an.m] * x);
      const done = ctx.rxn({ type: '电解', name: '电解: 阴极 ' + (cat.type === 'M' ? D.fmt(cat.ion) : 'H₂') + ' / 阳极 ' + describeAnode(an), react, prod, x, why: '电解(直流): 电荷 ' + fnum(x * FARA, 0) + ' C = ' + fnum(x, 4) + ' mol e⁻ (法拉第定律 n = Q/F)；E分解 = ' + fnum(Edec, 2) + ' V < 外加电压', ph, noHeat: true, tol: 1e-12 });
      if (done <= 0) break; eLeft -= done;
      if (an.type === 'MAnode') out.anodeLoss[an.m] = (out.anodeLoss[an.m] || 0) + done / an.mz;
      if (cat.type === 'M') out.deposit[cat.prod] = (out.deposit[cat.prod] || 0) + done / cat.z;
      out.stages.push({ cat: cat.type === 'M' ? cat.ion : 'H2', an: an.type === 'ION' ? an.ion : an.type, ne: done });
      if (an.type === 'ION' && an.ion === 'Cl-') { ctx.hz('阳极产生的 Cl₂ 有毒且有强烈刺激性，需通风/吸收'); }
    }
    out.molEUsed = out.molE - Math.max(eLeft, 0);
    if (out.eff < 100) out.lines.push('电流效率 ' + fnum(out.eff, 0) + '%: 只有这一比例的电荷用于主反应 (其余用于析氢等副反应)，有效电子 = ' + fnum(out.molE, 5) + ' mol');
    out.plating = [];
    Object.keys(out.deposit).forEach(m => {
      const mol = out.deposit[m], mass = mol * SP[m].M, rho = REAGBY[m] && REAGBY[m].rho; const o = { metal: m, mol, mass, rho };
      if (out.area > 0 && rho) o.thickness = mass / (rho * out.area) * 1e4; // μm
      out.plating.push(o);
      out.lines.push('法拉第定律: 阴极沉积 ' + D.fmt(m) + ' = Q·η·M/(zF) → n = ' + fnum(mol * 1000, 4) + ' mmol，m = ' + fnum(mass, 4) + ' g' + (o.thickness ? '；阴极面积 ' + fnum(out.area, 1) + ' cm²、ρ = ' + rho + ' g/cm³ → 镀层厚度 δ = m/(ρA) ≈ ' + fnum(o.thickness, 2) + ' μm' : ''));
    });
    Object.keys(out.anodeLoss).forEach(m => out.lines.push('阳极(' + D.fmt(m) + ' 电极)溶解 ' + fnum(out.anodeLoss[m] * 1000, 4) + ' mmol = ' + fnum(out.anodeLoss[m] * SP[m].M, 4) + ' g (溶液中金属离子浓度基本保持不变: 阳极补充阴极消耗)'));
    RU.loopRules(ctx);
    return out;
  }
  function describeAnode(an) { if (an.type === 'ION') return an.ion === 'Fe^2+' ? 'Fe²⁺ → Fe³⁺' : D.fmt(an.ion) + ' → ' + D.fmt(an.prod); if (an.type === 'MAnode') return D.fmt(an.m) + ' → ' + D.fmt(an.ion) + ' (' + SP[an.m].cn + '电极溶解)'; return '2H₂O → O₂ + 4H⁺ + 4e⁻'; }

  // ---------- 结果整理 ----------
  function finalize(ctx, setup, vessel, elec) {
    const res = { status: 'none', events: [], log: ctx.log, hazards: [], phen: [], reasons: [], notes: ctx.notes };
    const Vl = ctx.Vl(); const aq = ctx.aq();
    // ---- 热量 ----
    let Q = -ctx.dH; // kJ 释放给体系
    let excessNote = '';
    if (ctx.sol && ctx.sol.length) {
      const e0 = ctx.sol.reduce((s, o) => s + o.n * excessH2SO4(o.nw), 0);
      const nSO4 = ctx.n('HSO4-') + ctx.n('SO4^2-') + ctx.sol.reduce((s, o) => s, 0);
      const nTot = ctx.sol.reduce((s, o) => s + o.n, 0);
      const wF = ctx.n('H2O') / Math.max(nSO4, nTot);
      const eF = nTot * excessH2SO4(wF);
      if (Math.abs(e0 - eF) > 1e-6) { Q += e0 - eF; excessNote = '浓硫酸稀释热(以相对无限稀释的过量焓计): 初始 ' + fnum(e0, 2) + ' kJ → 终态 ' + fnum(eF, 2) + ' kJ，释放 ' + fnum(e0 - eF, 2) + ' kJ'; }
    }
    const C = ctx.cpSum + vessel.cv; // J/K
    const combustion = !!ctx.combustion;
    const incomplete = ctx.missingH.size > 0 && !combustion;
    if (incomplete) Q = 0;
    let dT = C > 0 ? Q * 1000 / C : 0;
    let Tfinal = ctx.T0 + dT; let boiled = 0, iceG = 0;
    const holdT = setup.plate || setup.ice;
    const bp = aq ? 100 : 1500;
    if (combustion) { Tfinal = null; }
    else if (holdT) { if (setup.ice) iceG = Math.abs(Q) * 1000 / 334; Tfinal = ctx.T0; }
    else if (Tfinal > bp && aq) { const over = (Tfinal - bp) * C; boiled = over / 2260; Tfinal = bp; }
    res.energy = { incomplete, dH: incomplete ? null : ctx.dH, Q, C, dT, T0: ctx.T0, Tfinal, boiled, iceG, hold: !!holdT, combustion, excessNote, mass: ctx.mass, cv: vessel.cv, missing: Array.from(ctx.missingH) };
    const Tcalc = Tfinal === null ? 25 : Tfinal; ctx.Tfinal = Tcalc;
    // ---- 事件整理 ----
    const nonminor = ctx.events.filter(e => !e.minor);
    res.events = ctx.events.map(e => {
      const q = e.qual ? { html: e.eqText, k: 1 } : eqHTML(e.react, e.prod);
      const bal = e.qual ? { ok: true } : checkBalance(e.react, e.prod);
      let mol = null; try { if (!e.minor && !e.qual) mol = molecularEq(ctx, e); } catch (err) { mol = null; }
      const k = q.k || 1;
      return { xTheo: e.xmaxPossible !== undefined ? e.xmaxPossible : (isFinite(e.xlim) ? Math.max(e.x, e.xlim) : e.x), type: e.type, name: e.name, eq: q.html, eqMol: mol, extent: e.x / k, x: e.x, k, dH_eq: e.dHu * k, dH_total: e.dHu * e.x, why: e.why, limiting: e.limiting ? plainName(e.limiting) : null, minor: e.minor, qual: e.qual, note: e.note, combustion: e.combustion, balance: bal, react: e.react, prod: e.prod, Ecell: e.Ecell, nTransfer: e.nTransfer, xmaxPossible: e.xmaxPossible, ph: e.ph };
    });
    function plainName(id) { return SP[id] ? SP[id].cn : id; }
    // ---- 溶液性质 ----
    const pH = aq ? computePH(ctx.L, Vl, Tcalc) : null;
    const col0 = ctx.L0 ? solutionColor(ctx.L0, (ctx.V0 || ctx.V) / 1000, []) : { rgb: [226, 242, 250], a: 0.4, absorb: 0 };
    let indicator = D.INDICATORS.find(i => i.id === setup.indicator);
    const finalExtra = ctx.extraColors.slice();
    const ic = (indicator && indicator.acid && pH !== null) ? indicatorColor(indicator, pH) : null;
    if (ic) finalExtra.push({ color: '#' + ic.rgb.map(v => ('0' + v.toString(16)).slice(-2)).join(''), a: Math.min(0.95, ic.a * 0.85) });
    const colF = solutionColor(ctx.L, Vl, finalExtra);
    const colF0 = ic ? solutionColor(ctx.L0 || ctx.L, (ctx.V0 || ctx.V) / 1000, [{ color: '#' + indicatorColor(indicator, computePH(ctx.L0 || ctx.L, (ctx.V0 || ctx.V) / 1000) || 7).rgb.map(v => ('0' + v.toString(16)).slice(-2)).join(''), a: 0.5 }]) : col0;
    res.solution = { V: ctx.V, pH, color: colF.rgb, alpha: colF.a, colorName: aq ? colorName(colF.rgb, colF.a, colF.absorb) : '—', absorb: colF.absorb, absorb0: colF0.absorb, color0: colF0.rgb, alpha0: colF0.a, spec: aq ? speciation(ctx.L, Vl, pH) : [], ions: [], aq };
    if (aq) Object.keys(ctx.L).forEach(id => { const sp = SP[id]; if (sp && sp.ph === 'aq' && ctx.L[id] > 1e-9 && id !== 'H+' && id !== 'OH-') res.solution.ions.push({ id, html: dispId(id), c: ctx.L[id] / Vl, n: ctx.L[id] }); });
    if (aq) { res.solution.hconc = Math.pow(10, -pH); res.solution.poh = 14 - pH; }
    // ---- 气体 / 固体 / 产物 ----
    const pK = (Tcalc + 273.15);
    res.gases = []; res.solids = []; res.products = []; res.consumption = [];
    Object.keys(ctx.L).forEach(id => {
      const sp = SP[id]; const n = ctx.L[id]; if (!sp || n < 1e-9) return;
      if (sp.ph === 'g' && id !== 'O2' || (id === 'O2' && !ctx.combustion && n > 1e-9)) res.gases.push({ id, name: sp.cn, n, V_T: n * R_GAS * pK / 101.325, V_STP: n * 22.414, info: GASINFO[id] || {}, html: dispId(id) });
      if (sp.ph === 's') {
        let nShow = n; const rg = REAGBY[id]; // 易溶的分子型固体(葡萄糖、蔗糖、尿素…)按溶解度判断溶解部分，不再误显示为"未溶固体"
        if (rg && rg.sol && !rg.diss && ctx.L['H2O'] > 0.5 && (ctx.added && ctx.added[id])) { const cap = interp(rg.sol, ctx.T) * waterGrams(ctx.L) / 100 / sp.M; nShow = Math.max(0, n - cap); if (nShow < 1e-9) { (res.dissolvedMol = res.dissolvedMol || []).push({ id, name: sp.cn, n }); return; } }
        const added = (ctx.added && ctx.added[id]) || 0; res.solids.push({ id, name: sp.cn, n: nShow, m: nShow * sp.M, added, formed: Math.max(0, nShow - added), col: sp.col, cname: CNAME[id] || '', html: dispId(id) }); }
    });
    res.gases.sort((a, b) => b.n - a.n);
    // 理论产量: 以限量试剂完全转化计 (可逆反应用 xmaxPossible)
    res.yields = [];
    res.events.filter(e => !e.minor && !e.qual).forEach(e => {
      const ev = ctx.events.find(z => z.type === e.type && z.name === e.name && z.x === e.x); if (!ev) return;
      Object.keys(ev.prod).forEach(id => {
        const sp = SP[id]; if (!sp || sp.ph === 'aq' || id === 'H2O') return;
        const nT = ev.prod[id] * e.xTheo, nA = ev.prod[id] * e.x; if (nT < 1e-9) return;
        const ex = res.yields.find(y => y.id === id);
        if (ex) { ex.nTheo += nT; ex.nMax += nA; } else res.yields.push({ id, name: sp.cn, html: dispId(id), ph: sp.ph, M: sp.M, nTheo: nT, nMax: nA, eq: e.eq, limiting: e.limiting });
      });
    });
    res.yields.forEach(y => { y.mTheo = y.nTheo * y.M; y.mMax = y.nMax * y.M; y.eqPct = y.nTheo > 0 ? y.nMax / y.nTheo * 100 : 0; });
    // 产物: 新生成的非离子物种
    const L0 = ctx.L0 || {}; const addedIds = Object.keys(ctx.added || {});
    const seenProd = new Set();
    ctx.events.forEach(e => { if (e.minor && e.type !== '气体逸出' && e.type !== '溶解平衡') return; Object.keys(e.prod).forEach(id => seenProd.add(id)); });
    ctx.events.forEach(e => { if (e.qual) return; Object.keys(e.prod).forEach(id => { if (e.type === '溶解') return; seenProd.add(id); }); });
    seenProd.forEach(id => {
      const sp = SP[id]; if (!sp) return; const n = ctx.L[id] || 0; const added = (ctx.added && ctx.added[id]) || 0;
      const formed = n - (L0[id] || 0);
      if (formed <= 1e-9 && !(sp.ph === 'g')) return;
      if (id === 'H2O' && !nonminor.length) return;
      const nn = Math.max(formed, 0); if (nn <= 1e-9 && sp.ph !== 'g') return;
      res.products.push({ id, name: sp.cn, html: dispId(id), ph: sp.ph, n: sp.ph === 'g' ? (n) : nn, m: (sp.ph === 'g' ? n : nn) * sp.M, ion: sp.ph === 'aq' && sp.q !== 0, isolable: sp.ph !== 'aq' || false });
    });
    // 气体产物: 总量以所有事件产生为准
    res.products = res.products.filter(p => p.n > 1e-9);
    // 消耗表
    addedIds.forEach(id => {
      if (id === 'H2O') return; const sp = SP[id]; const n0 = ctx.added[id], n1 = ctx.L[id] || 0;
      res.consumption.push({ id, html: dispId(id), n0, n1, cons: n0 - n1, pct: n0 > 0 ? (n0 - n1) / n0 * 100 : 0, name: sp.cn });
    });
    // ---- 限量试剂 ----
    res.limiting = nonminor.filter(e => e.limiting && !e.qual).map(e => ({ event: e.name, id: e.limiting, name: plainName(e.limiting) }));
    { const ap = new Set(); ctx.events.forEach(e => { if (e.qual) return; Object.keys(e.react).concat(Object.keys(e.prod)).forEach(id => { if (SP[id] && SP[id].approx && SP[id].H !== null) ap.add(id); }); });
      if (ap.size) res.notes.push('热效应使用了近似/类比估算的 ΔfH° (精度有限，约 ±10–20 kJ/mol): ' + Array.from(ap).map(i => plain(dispId(i))).join('、')); }
    // ---- 状态与理由 ----
    const reasons = [];
    const seenRe = new Set();
    function pr(s) { if (!seenRe.has(s)) { seenRe.add(s); reasons.push(s); } }
    if (nonminor.length) {
      res.status = 'reaction'; res.verdict = '发生化学反应';
      (ctx._denied || []).filter(d => !d.key || (d.key !== '*' && ctx.n(d.key) > 1e-6)).forEach(d => res.notes.push(d.s));
    } else {
      const cat = Array.from(ctx.ids).map(i => REAGBY[i]);
      const names = cat.map(r => r.name);
      const physical = ctx.events.length > 0;
      let rs = [];
      if (ctx._denied) ctx._denied.forEach(d => rs.push(d.s));
      if (aq) explainNoRedox(ctx).forEach(x => rs.push(x));
      if (aq) B.rules.ionPairReasons(ctx).slice(0, 6).forEach(x => rs.push(x));
      // 是否存在引擎未覆盖的有机反应
      const orgIds = Array.from(ctx.ids).filter(i => REAGBY[i].cat === '有机物' && i !== 'H2O');
      const REACTIVE = ['KMnO4', 'K2Cr2O7', 'H2O2', 'HNO3', 'I2', 'Na', 'K', 'Ca', 'Mg', 'Al', 'AgNO3', 'CuSO4', 'CuCl2', 'CuSO4·5H2O'];
      const nodataPairs = [];
      orgIds.forEach(o => { Array.from(ctx.ids).forEach(x => { if (x === o) return; if (ctx.cov && ctx.cov[o + '|' + x]) return; if (REACTIVE.includes(x) && !['AgNO3', 'CuSO4', 'CuCl2', 'CuSO4·5H2O'].includes(x)) nodataPairs.push(REAGBY[o].name + ' × ' + REAGBY[x].name); }); });
      if (ctx.ids.has('H2SO4') && orgIds.length && ctx.cSO4() >= 10) nodataPairs.push('有机物 × 浓硫酸');
      if ((ctx.ids.has('NaOH') || ctx.ids.has('KOH')) && ctx.ids.has('C3H6O') && !(ctx.cov && (ctx.cov['C3H6O|NaOH'] || ctx.cov['C3H6O|KOH']))) nodataPairs.push('丙酮 × 强碱 (羟醛缩合等)');
      if (ctx.ids.has('AgNO3') && orgIds.some(o => ['C6H12O6'].includes(o))) nodataPairs.push('葡萄糖 × 银离子 (银镜需碱性氨溶液体系)');
      if (ctx.ids.has('C6H12O6') && (ctx.ids.has('CuSO4') || ctx.ids.has('CuSO4·5H2O')) && (ctx.ids.has('NaOH') || ctx.ids.has('KOH'))) nodataPairs.push('葡萄糖 × Cu²⁺/碱 (斐林/本尼迪特反应)');
      if (ctx.cov) Object.keys(ctx.cov).forEach(k => { const [o2, x2] = k.split('|'); if (ctx.ids.has(o2) && ctx.ids.has(x2)) rs.push(ctx.cov[k]); });
      if (ctx.ids.size === 1 && !physical && ctx._denied && ctx._denied.length) { res.status = 'none'; res.verdict = '预计无反应'; }
      else if (ctx.ids.size === 1 && !physical) { res.status = 'physical'; res.verdict = '单一试剂，无化学反应'; rs.length = 0; rs.push('只加入了一种试剂：没有可相互反应的对象。若是弱酸/弱碱溶液，只存在电离平衡 (由 Ka/Kb 决定 pH)，不属于化学反应。'); }
      else if (nodataPairs.length) { res.status = 'nodata'; res.verdict = '引擎无数据'; res.nodata = nodataPairs; rs.unshift('规则库中没有以下组合的反应数据，引擎不会凭空编造结果: ' + nodataPairs.join('；')); }
      else if (physical && !rs.length) { res.status = 'physical'; res.verdict = '仅发生溶解/混合/稀释，无化学反应'; }
      else if (rs.length) { res.status = physical ? 'physical' : 'none'; res.verdict = physical ? '无化学反应 (仅溶解/混合)' : '预计无反应'; }
      else if (aq && !orgIds.length) { res.status = 'none'; res.verdict = '预计无反应'; }
      else if (!aq && Array.from(ctx.ids).every(i => (REAGBY[i].cat === '盐' || REAGBY[i].cat === '氧化物') && !/NH4|MnO4|Cr2O7|ClO|NO3.*KNO3x/.test(REAGBY[i].f || ''))) { res.status = 'none'; res.verdict = '预计无反应'; rs.push('固体混合物: 无溶剂/熔融则离子无法迁移，常温下固-固反应速率可忽略；亦无已知的低温固相反应。'); }
      else { res.status = 'nodata'; res.verdict = '引擎无数据'; rs.push('规则库中没有该试剂组合的反应数据，引擎不会凭空编造结果。'); }
      if (aq && ctx.ids.size > 1 && res.status !== 'nodata' && !explainNoRedox(ctx).length && !(ctx._denied || []).length) rs.push('溶液中各阴、阳离子之间不生成沉淀、气体或弱电解质 (复分解条件不满足)，也无氧化还原电对满足 E°cell>0 → 预计无反应，仅为混合。');
      res.reasons = rs;
    }
    if (res.status === 'reaction') res.reasons = [];
    // 电解结果可使状态变为电解
    if (elec) { res.electro = elec; if (!elec.fail && elec.molEUsed > 0) { if (res.status !== 'reaction') { res.status = 'reaction'; res.verdict = '发生电解反应'; } } else if (elec.fail) res.notes.push(elec.fail); }
    // ---- 现象 ----
    buildPhenomena(ctx, res, setup, vessel);
    // ---- 危险提示 ----
    buildHazards(ctx, res, setup, vessel);
    res.verdictClass = res.status === 'reaction' ? 'ok' : (res.status === 'unsupported' ? 'bad' : (res.status === 'nodata' ? 'warn' : 'none'));
    res.main = nonminor.find(e => !e.qual) ? res.events.find(e => !e.minor && !e.qual) : null;
    // 日志
    buildLog(ctx, res, setup, vessel);
    res.ledger = Object.assign({}, ctx.L); res.V = ctx.V; res.T = Tfinal; res.setup = setup;
    res.esterEq = ctx._esterEq || null;
    res.anim = buildAnim(ctx, res);
    return res;
  }

  function buildPhenomena(ctx, res, setup) {
    const ph = []; const seen = new Set();
    const push = (t, kind) => { if (!seen.has(t)) { seen.add(t); ph.push({ text: t, kind }); } };
    res.gases.forEach(gx => { push('有气体生成: ' + gx.info.cn + ' ≈ ' + fnum(gx.V_T * 1000, gx.V_T < 0.01 ? 2 : 1) + ' mL (' + fnum(ctx.Tfinal, 0) + ' °C, 1 atm)；' + (gx.info.txt || ''), 'gas'); });
    res.solids.filter(s => s.formed > 1e-7 && !(['Cu', 'Ag', 'Fe', 'Zn', 'Pb'].includes(s.id) && s.added > 0 && s.n < s.added)).forEach(s => {
      if (['Cu', 'Ag', 'Pb', 'Fe', 'Zn', 'I2', 'C'].includes(s.id)) push('析出' + (s.cname || '') + '固体 ' + s.name + ' ' + fnum(s.formed * s.m / s.n, 3) + ' g', 'solid');
      else push('生成' + (s.cname || '') + '沉淀/固体 ' + s.name + ' ' + fnum(s.formed * (SP[s.id].M), 3) + ' g', 'precip');
    });
    // 金属溶解
    res.consumption.forEach(c => { if (SP[c.id].ph === 's' && c.pct > 5 && c.n0 > 0 && ['Na', 'K', 'Ca', 'Mg', 'Al', 'Zn', 'Fe', 'Cu', 'Pb', 'Ag'].includes(c.id)) push(SP[c.id].cn + ' 逐渐消耗/溶解 (' + fnum(c.pct, 0) + '%)', 'solid'); if (SP[c.id].ph === 's' && c.pct > 90 && !['Na', 'K', 'Ca', 'Mg', 'Al', 'Zn', 'Fe', 'Cu', 'Pb', 'Ag'].includes(c.id) && res.status === 'reaction') push(SP[c.id].cn + ' 固体溶解消失', 'solid'); });
    if (res.solution.aq) {
      const n0 = colorName(res.solution.color0, res.solution.alpha0, res.solution.absorb0), n1 = colorName(res.solution.color, res.solution.alpha, res.solution.absorb);
      const d = Math.abs(res.solution.color0[0] - res.solution.color[0]) + Math.abs(res.solution.color0[1] - res.solution.color[1]) + Math.abs(res.solution.color0[2] - res.solution.color[2]);
      if (d > 40 || n0 !== n1) push('溶液颜色: ' + n0 + ' → ' + n1, 'color'); else if (n1 !== '无色') push('溶液呈' + n1, 'color');
    }
    ctx.events.forEach(e => (e.ph || []).forEach(p => { if (p.note) push(p.note, 'color'); if (p.k === 'smell' && p.text) push('气味: ' + p.text, 'smell'); if (p.k === 'flame') push(p.text ? '火焰/燃烧: ' + p.text : (p.metal ? '剧烈反应，金属熔成小球游动并发出嘶嘶声' + (p.metal === 'Na' ? '，火焰呈黄色' : (p.metal === 'K' ? '，火焰呈紫色(透过蓝色钴玻璃观察)' : '')) : '剧烈反应'), 'flame'); if (p.k === 'steam') push('有水蒸气/白雾产生', 'steam'); if (p.k === 'smoke') push('产生白色浓烟', 'smoke'); }));
    if (ctx.n('NH3(aq)') > 0 && ctx.conc('NH3(aq)') > 0.1) push('气味: 刺激性氨味 (NH₃ 水溶液)', 'smell');
    const dT = res.energy.dT;
    if (res.energy.incomplete) push('热效应: 反应涉及缺少 ΔfH° 数据的物种，温度变化无法计算 (未编造数值)', 'heat');
    else if (!res.energy.combustion) { if (dT >= 1) push('放热: 理想绝热温升 ΔT ≈ +' + fnum(dT, 2) + ' K' + (dT >= 20 ? '，容器明显发烫' : (dT >= 5 ? '，容器变热' : '，仅略微升温')), 'heat'); else if (dT <= -1) push('吸热: 温度降低 ΔT ≈ ' + fnum(dT, 2) + ' K' + (dT <= -5 ? '，容器变冷' : ''), 'cold'); else if (res.status === 'reaction') push('热效应很小 (|ΔT| < 1 K)', 'heat'); }
    if (res.energy.boiled > 0) push('体系放热使溶液沸腾，约 ' + fnum(res.energy.boiled, 1) + ' g 水被汽化(蒸汽/飞溅)', 'steam');
    if (res.electro && !res.electro.fail && res.electro.molEUsed > 0) push('电解进行: 通过电荷 ' + fnum(res.electro.molEUsed * FARA, 0) + ' C (' + fnum(res.electro.molEUsed, 4) + ' mol e⁻)，电极上有产物析出', 'electro');
    res.phen = ph;
  }

  function buildHazards(ctx, res, setup, vessel) {
    const H = new Set(ctx.hazards);
    Array.from(ctx.ids).forEach(i => (REAGBY[i].hz || []).forEach(h => H.add(REAGBY[i].name + ': ' + h)));
    const dT = res.energy.dT, Q = res.energy.Q;
    if (!res.energy.combustion) { if (dT >= 40 || res.energy.boiled > 0) H.add('强放热: 理想温升 ' + fnum(dT, 0) + ' K，可能使溶液沸腾、飞溅；实际应分批缓慢加入并冷却'); else if (dT >= 10) H.add('明显放热 (ΔT≈+' + fnum(dT, 0) + ' K)，注意烫伤'); }
    else H.add('燃烧放热 ' + fnum(Q, 0) + ' kJ；明火操作，远离易燃物，备灭火毯/灭火器');
    res.gases.forEach(gx => { if (['SO2', 'NO2', 'NO', 'H2S', 'Cl2', 'NH3', 'HCl(g)'].includes(gx.id)) H.add('有毒/刺激性气体 ' + gx.info.cn + '：必须在通风橱中进行 (仅为理论模拟)'); if (gx.id === 'H2') H.add('H₂ 可燃，与空气混合(4–75%)遇火花爆鸣，勿近明火'); if (gx.id === 'C2H4') H.add('乙烯易燃'); });
    if (res.solution.pH !== null) { const p = res.solution.pH; if (p <= 1) H.add('终态强酸性 (pH≈' + fnum(p, 1) + ')，腐蚀性'); if (p >= 13) H.add('终态强碱性 (pH≈' + fnum(p, 1) + ')，腐蚀性，伤眼'); }
    const heavy = [['Pb', /^(Pb\^2\+|PbCl2|PbI2|PbSO4|PbCO3|PbS|PbCrO4|Pb\(OH\)2)$/, '含铅(重金属)废液，严禁倒入下水道'], ['Ba', /^(Ba\^2\+|BaCO3|BaCrO4)$/, '含可溶性钡盐/碳酸钡有毒 (BaSO₄ 因难溶无毒)'], ['Cr', /^(Cr2O7\^2-|CrO4\^2-|Cr\^3\+|PbCrO4|Ag2CrO4|BaCrO4)$/, '含铬废液(六价铬致癌)，需专门回收'], ['Ag', /^(Ag\+|Ag2CrO4)$/, '银盐废液需回收，污染皮肤变黑'], ['Cu', /^(Cu\^2\+)$/, '含铜废液对水生生物有毒']];
    heavy.forEach(([k, re, msg]) => { if (Object.keys(ctx.L).some(id => re.test(id) && ctx.L[id] > 1e-7)) H.add(msg); });
    if (ctx.V > vessel.cap * 0.85) H.add('总体积 ' + fnum(ctx.V, 0) + ' mL 已接近/超过容器容量 ' + vessel.cap + ' mL，可能溢出 (反应有气体/起泡时更危险)');
    if (res.energy.excessNote) H.add('浓硫酸稀释剧烈放热：永远"酸入水"，缓慢加入并搅拌');
    res.hazards = Array.from(H);
  }

  function buildLog(ctx, res, setup, vessel) {
    const L = ctx.log; const E = res.energy;
    L.push('<b>【体系】</b> 总液体体积 V = ' + fnum(ctx.V, 2) + ' mL，总质量 ≈ ' + fnum(ctx.mass, 2) + ' g' + (ctx.aq() ? '，其中水约 ' + fnum(waterGrams(ctx.L), 2) + ' g' : '，无水相 (干法/纯液相)'));
    const ev = res.events.filter(e => !e.minor);
    if (ev.length) {
      L.push('<b>【反应识别与计算】</b>');
      ev.forEach((e, i) => {
        L.push('<b>反应 ' + (i + 1) + ' · ' + e.type + '</b>: ' + e.name);
        L.push('　净离子/分子式: ' + e.eq + (e.balance && e.balance.ok === false ? '　<span class="warn">(配平检查未通过)</span>' : ''));
        if (e.eqMol) L.push('　总方程式: ' + e.eqMol);
        L.push('　判据: ' + e.why);
        if (!e.qual) {
          L.push('　反应进度 ξ = ' + fnum(e.extent * 1000, 4) + ' mmol (按上式系数)' + (e.limiting ? '；限量物种: ' + e.limiting : ''));
          L.push('　ΔH(每式) = Σν·ΔfH°(产物) − Σν·ΔfH°(反应物) = ' + fnum(e.dH_eq, 2) + ' kJ/mol → 本次 ΔH = ' + fnum(e.dH_total, 3) + ' kJ' + (e.dH_total < 0 ? ' (放热)' : ' (吸热)'));
          if (e.xmaxPossible !== undefined && res.esterEq) L.push('　可逆平衡: K = ' + res.esterEq.K + '，平衡进度 ' + fnum(res.esterEq.xeq * 1000, 3) + ' mmol，若完全转化应为 ' + fnum(res.esterEq.xmax * 1000, 3) + ' mmol → 平衡转化率 ' + fnum(res.esterEq.xeq / res.esterEq.xmax * 100, 1) + '%');
        }
      });
    } else L.push('<b>【反应识别】</b> 未触发任何化学反应规则。');
    const mn = res.events.filter(e => e.minor);
    if (mn.length) L.push('<b>【物理过程】</b> ' + mn.map(e => e.name + ' (' + fnum(e.dH_total, 2) + ' kJ)').join('；'));
    L.push('<b>【热量】</b> ΔH总 = ' + fnum(E.dH, 3) + ' kJ → Q放 = ' + fnum(E.Q, 3) + ' kJ' + (E.excessNote ? '；' + E.excessNote : ''));
    if (!E.combustion) L.push('　q = m·c·ΔT：热容 C = Σmᵢcᵢ + C(容器) = ' + fnum(E.C - E.cv, 1) + ' + ' + fnum(E.cv, 0) + ' = ' + fnum(E.C, 1) + ' J/K；ΔT = ' + fnum(E.Q * 1000, 1) + ' J ÷ ' + fnum(E.C, 1) + ' J/K = ' + fnum(E.dT, 3) + ' K' + (E.hold ? '；加热板/冰浴维持 ' + fnum(E.T0, 0) + ' °C' + (E.iceG ? '，冰融化约 ' + fnum(E.iceG, 2) + ' g' : '') : '；终温 ' + fnum(E.Tfinal, 2) + ' °C'));
    else L.push('　燃烧放热量 ' + fnum(E.Q, 1) + ' kJ (火焰温度远高于容器内液体温度，不适用 q = mcΔT)');
    if (res.solution.pH !== null) {
      const pH = res.solution.pH; L.push('<b>【终态 pH】</b> 电荷平衡 [H⁺] − [OH⁻] + Σ(强电解质离子电荷) + Σ(弱酸体系 C·α·电荷) = 0，精确二分求解 (含 Kw=1.0×10⁻¹⁴, 各 pKa)；V = ' + fnum(ctx.V, 2) + ' mL → <b>pH = ' + fnum(pH, 2) + '</b>');
      res.solution.spec.forEach(s => L.push('　' + s.name + '体系 C=' + fnum(s.tot, 4) + ' M: ' + s.forms.map(f => dispId(f.id) + ' ' + fnum(f.frac * 100, 1) + '%').join('，')));
    }
    if (res.gases.length) L.push('<b>【气体】</b> ' + res.gases.map(gx => gx.html + ' ' + fnum(gx.n * 1000, 3) + ' mmol → V = nRT/p = ' + fnum(gx.V_T * 1000, 1) + ' mL (' + fnum(ctx.Tfinal, 0) + ' °C)，STP 下 ' + fnum(gx.V_STP * 1000, 1) + ' mL').join('；'));
    const pp = res.solids.filter(s => s.formed > 1e-7);
    if (pp.length) L.push('<b>【沉淀/固体产物】</b> ' + pp.map(s => s.html + ' ' + fnum(s.formed * 1000, 3) + ' mmol × M(' + fnum(s.m / s.n, 2) + ') = ' + fnum(s.formed * s.m / s.n, 4) + ' g').join('；'));
    if (res.electro) { const e = res.electro; L.push('<b>【电解】</b> ' + e.lines.join('；') + (e.fail ? '；' + e.fail : '；法拉第定律: n(e⁻) = I·t/F = ' + fnum(e.I, 3) + '×' + fnum(e.t, 0) + '/96485 = ' + fnum(e.molE, 5) + ' mol；电能 W = U·I·t = ' + fnum(e.W, 2) + ' kJ')); }
    if (res.reasons.length) { L.push('<b>【不反应/无数据的依据】</b>'); res.reasons.forEach(r => L.push('　• ' + r)); }
    if (E.missing.length) L.push('<span class="warn">注意: 以下物种缺少 ΔfH° 数据，其热效应未计入: ' + E.missing.map(i => dispId(i)).join('、') + '</span>');
  }

  function buildAnim(ctx, res) {
    const a = { level: Math.min(1, ctx.V / (D.VESSELS.find(v => v.id === (ctx.setup.vessel || 'beaker')) || D.VESSELS[0]).cap), c0: res.solution.color0, a0: res.solution.alpha0, c1: res.solution.color, a1: res.solution.alpha, bubbles: [], precip: [], flame: null, steam: false, smoke: false, heat: res.energy.dT, solids: [] };
    res.gases.forEach(gx => a.bubbles.push({ id: gx.id, n: gx.n, color: (gx.info.color) || 'rgba(255,255,255,.7)' }));
    // 反应过程产生的气体 (含溢出后离开体系的)
    ctx.events.forEach(e => (e.ph || []).forEach(p => { if (p.k === 'bubbles' && !a.bubbles.find(b => b.id === p.gas)) a.bubbles.push({ id: p.gas, n: Math.max(e.x, 1e-4), color: (GASINFO[p.gas] || {}).color || 'rgba(255,255,255,.7)' }); if (p.k === 'steam') a.steam = true; if (p.k === 'smoke') a.smoke = true; if (p.k === 'flame' && !a.flame) a.flame = { color: p.color || (ctx.flameInfo && ctx.flameInfo.color) || '#ffb020', metal: p.metal || null }; }));
    res.solids.forEach(s => { if (s.formed > 1e-7) a.precip.push({ id: s.id, color: s.col || '#eee', amount: s.formed * s.m / s.n, metal: ['Cu', 'Ag', 'Fe', 'Zn', 'Pb'].includes(s.id) }); else if (s.n > 1e-7 && ctx.added && ctx.added[s.id]) a.solids.push({ id: s.id, color: s.col || '#ddd', amount: s.n * s.m / s.n }); });
    if (ctx.flameTestInfo && !a.flame) { a.flame = { color: ctx.flameTestInfo.color }; a.flameStay = true; }
    if (ctx.combustion && !a.flame) a.flame = { color: (ctx.flameInfo && ctx.flameInfo.color) || '#ffb020' };
    if (res.energy.boiled > 0) a.steam = true;
    return a;
  }

  // ================= 滴定 =================
  function ledgerFromSolution(rid, V, c) {
    const r = REAGBY[rid]; const n = V * c / 1000; const diss = r.diss || { [r.sp]: 1 }; const L = {};
    for (const id in diss) L[id] = (L[id] || 0) + n * diss[id];
    return { L, n, r };
  }
  function titrationPH(spec, Vt) {
    const A = ledgerFromSolution(spec.analyte.rid, spec.analyte.V, spec.analyte.c);
    const T = ledgerFromSolution(spec.titrant.rid, Vt, spec.titrant.c);
    const L = Object.assign({}, A.L); Object.keys(T.L).forEach(k => L[k] = (L[k] || 0) + T.L[k]);
    L['H2O'] = 10; // 占位: 弱酸固体溶解度限制需要水
    return computePH(L, (spec.analyte.V + Vt + (spec.water || 0)) / 1000);
  }
  function titrationCurve(spec, Vmax, step) {
    const pts = []; for (let v = 0; v <= Vmax + 1e-9; v += step) pts.push({ v: +v.toFixed(6), pH: titrationPH(spec, v) });
    // 等当点: pH 对体积导数的局部极大 (峰值需显著高于周围缓冲区斜率)，再用细网格精修
    const d = []; for (let i = 1; i < pts.length; i++) d.push({ v: (pts[i].v + pts[i - 1].v) / 2, s: (pts[i].pH - pts[i - 1].pH) / (pts[i].v - pts[i - 1].v), i });
    const gmax = Math.max.apply(null, d.map(x => Math.abs(x.s)));
    const sgn = d.reduce((a, x) => a + x.s, 0) >= 0 ? 1 : -1;
    const eq = [];
    for (let i = 1; i < d.length - 1; i++) {
      const s = sgn * d[i].s; if (!(s > sgn * d[i - 1].s && s >= sgn * d[i + 1].s)) continue;
      if (s < Math.max(0.12 * gmax, 0.3)) continue;
      const w = 4; let ref = 0, cnt = 0; for (let k = Math.max(0, i - w); k <= Math.min(d.length - 1, i + w); k++) if (k !== i) { ref += Math.abs(d[k].s); cnt++; }
      if (s < 1.25 * ref / cnt) continue;
      // 精修
      let lo = Math.max(0, d[i].v - step), hi = d[i].v + step, best = null;
      for (let pass = 0; pass < 3; pass++) {
        const n = 40; let prev = titrationPH(spec, lo); best = null;
        for (let k = 1; k <= n; k++) { const v = lo + (hi - lo) * k / n, p = titrationPH(spec, v); const sl = sgn * (p - prev) / ((hi - lo) / n); if (!best || sl > best.slope) best = { v: v - (hi - lo) / n / 2, pH: (p + prev) / 2, slope: sl }; prev = p; }
        const w = (hi - lo) / 8; lo = Math.max(0, best.v - w); hi = best.v + w;
      }
      best.v = +best.v.toFixed(2); best.pH = titrationPH(spec, best.v); eq.push(best);
    }
    return { pts, eq };
  }
  // 理论上滴定剂等当体积 (一级终点): 以电荷/质子计量
  function protonCapacity(rid) { const r = REAGBY[rid]; const sp = { HCl: 1, HNO3: 1, H2SO4: 2, CH3COOH: 1, HCOOH: 1, H3PO4: 2, H2C2O4: 2, C6H8O7: 3, NaOH: 1, KOH: 1, NH3: 1, Na2CO3: 2, NaHCO3: 1, 'Ca(OH)2': 2, CH3COONa: 1, C7H6O2: 1, C7H6O3: 1, C9H8O4: 1 }; return sp[rid] || null; }

  const API = Object.assign(B, { run, electrolysis, molecularEq, checkBalance, titrationPH, titrationCurve, protonCapacity, explainNoRedox });
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else g.ChemEngine = API;
})(typeof window !== 'undefined' ? window : globalThis);
