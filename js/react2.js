/* 虚拟化学实验室 —— 扩展反应规则 (第二批)
 * 有机: SN1/SN2、E1/E2、Williamson 醚合成、烯烃加成(Br2/HBr/水合/催化氢化)、Baeyer 试验、醇氧化的覆盖说明、
 *       Tollens / 斐林(Fehling) 试验、碘仿反应、Lucas 试验、羟醛(Claisen–Schmidt)缩合、油脂皂化与皂垢、Fischer 酯化变体、
 *       酰化成酰胺(乙酰苯胺、尼龙-66)、苯的溴代、烷烃自由基溴代(光照)、苯乙烯聚合、聚苯乙烯溶解、甲苯侧链氧化。
 * 无机/电化学: 歧化 (I2/OH⁻, Cu2O/H⁺, S2O3²⁻/H⁺)、碘量反应、金属氧化物还原(铝热型仅作热力学判断)、水合盐脱水、
 *       焰色试验、光化学(卤化银变暗)、金属腐蚀(吸氧腐蚀、牺牲阳极、电偶腐蚀)。
 * 范围限制: 硝化(HNO3 + 有机物)、含氨/丙酮/甲苯的溴代等危险或违规组合仍由 checkBlocked 拦截并返回"不支持"。
 */
(function (g) {
  'use strict';
  const B = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./react.js') : g.__EngineBase;
  const { D, SP, REAGBY, fnum, GASINFO, CNAME, R_GAS, FARA } = B;
  const RU = B.rules;
  if (RU.ext2) return;
  const nm = id => (SP[id] ? SP[id].cn : id);
  const has = (ctx, id) => ctx.n(id) > 1e-9;
  const ids = (ctx, id) => ctx.ids && ctx.ids.has(id);
  const F = id => D.fmt(id.replace(/\((aq|g|s|l)\)$/, ''));

  // ---- 新气体/新固体显示信息 ----
  Object.assign(GASINFO, {
    'HBr(g)': { cn: '溴化氢 HBr', txt: '无色刺激性气体，在潮湿空气中成白雾，极易溶于水', color: 'rgba(255,255,255,.7)' },
    'CH3CH=CH2': { cn: '丙烯', txt: '无色，易燃气体', color: 'rgba(255,255,255,.7)' }, 'CH2=C(CH3)2': { cn: '异丁烯', txt: '无色，易燃气体', color: 'rgba(255,255,255,.7)' },
    C2H6: { cn: '乙烷', txt: '无色，易燃气体', color: 'rgba(255,255,255,.7)' }, 'CH3CH2CH3': { cn: '丙烷', txt: '无色，易燃气体', color: 'rgba(255,255,255,.7)' }, '(CH3)3CH': { cn: '异丁烷', txt: '无色，易燃气体', color: 'rgba(255,255,255,.7)' },
  });
  Object.assign(CNAME, { Cu2O: '砖红色', CHI3: '亮黄色', C17H14O: '黄色', C6H3Br3O: '白色', 'Ca(C18H33O2)2': '白色凝乳状(皂垢)', C8H9NO: '白色', '[C8H8]': '白色', '[C12H22N2O2]': '白色(尼龙膜/丝)', 'Ni(OH)2': '苹果绿色', Br2: '红棕色' });

  // ---- 小工具 ----
  function go(ctx, o) { return ctx.rxn(o) > 0; }
  function qual(ctx, key, o) {
    ctx._q = ctx._q || {}; if (ctx._q[key]) return false; ctx._q[key] = true;
    ctx.events.push(Object.assign({ react: {}, prod: {}, x: 0, dHu: 0, minor: false, qual: true, ph: [] }, o)); return true;
  }
  function cover(ctx, o, x, why) { ctx.cov = ctx.cov || {}; ctx.cov[o + '|' + x] = why; }
  function solv(ctx) {
    const wg = ctx.n('H2O') * 18.015;
    const og = ctx.n('C2H5OH') * 46.07 + ctx.n('CH3OH') * 32.04 + ctx.n('(CH3)2CHOH') * 60.1 + ctx.n('C3H6O') * 58.08 + ctx.n('(CH3)3COH') * 74.1;
    return { wg, og, aqDom: wg >= 0.5 * (wg + og) && wg > 0, orgDom: og > wg && og > 0 };
  }
  function thermo(react, prod, T) {
    let dH = 0, dS = 0, miss = false;
    for (const k in prod) { dH += prod[k] * (SP[k].H || 0); if (SP[k].H == null) miss = true; if (SP[k].S0 == null) miss = true; dS += prod[k] * (SP[k].S0 || 0); }
    for (const k in react) { dH -= react[k] * (SP[k].H || 0); if (SP[k].H == null) miss = true; if (SP[k].S0 == null) miss = true; dS -= react[k] * (SP[k].S0 || 0); }
    const TK = T + 273.15; return { dH, dS, dG: dH - TK * dS / 1000, miss, Teq: dS ? dH / dS * 1000 - 273.15 : null };
  }
  function liqEq(a, w, b, K) {
    const f = xi => (b + xi) * (a + w + b - xi) - K * (a - xi) * (w - xi);
    const lo = -b, hi = Math.min(a, w); if (hi <= 1e-14 && lo >= -1e-14) return 0;
    if (f(hi) <= 0) return hi; if (f(lo) >= 0) return lo;
    let l = lo, h = hi; for (let i = 0; i < 200; i++) { const m = (l + h) / 2; if (f(m) > 0) h = m; else l = m; } return (l + h) / 2;
  }

  // ============ 早期规则: 醇钠水解 ============
  function rAlkoxideHyd(ctx) {
    const n = ctx.n('C2H5ONa'); if (n < 1e-10 || !ctx.aq()) return false;
    const x = go(ctx, { type: '醇盐水解', name: '乙醇钠遇水', react: { C2H5ONa: 1, H2O: 1 }, prod: { C2H5OH: 1, 'Na+': 1, 'OH-': 1 }, x: n, limitAll: false,
      why: '乙醇的 pKa ≈ 15.9 与水(15.7)相近，乙氧基负离子在水中几乎完全被质子化，实质得到 NaOH + 乙醇；因此 Williamson 醚合成必须无水进行', ph: [{ k: 'heat' }] });
    if (x) ctx.hz('乙醇钠遇水剧烈放热并生成强碱 NaOH');
    return x;
  }

  // ============ 卤代烃: SN1 / SN2 / E1 / E2 / Williamson ============
  const HAL = [
    { id: 'C2H5Br', X: 'Br', cls: 1, alc: 'C2H5OH', ene: 'C2H4', salt: { Na: 'NaBr', K: 'KBr' } },
    { id: '(CH3)2CHBr', X: 'Br', cls: 2, alc: '(CH3)2CHOH', ene: 'CH3CH=CH2', salt: { Na: 'NaBr', K: 'KBr' } },
    { id: '(CH3)3CCl', X: 'Cl', cls: 3, alc: '(CH3)3COH', ene: 'CH2=C(CH3)2', salt: { Na: 'NaCl', K: 'KCl' } },
  ];
  const CLSNAME = { 1: '伯', 2: '仲', 3: '叔' };
  function rHalide(ctx) {
    let ch = false; const sv = solv(ctx);
    HAL.forEach(h => {
      const n = ctx.n(h.id); if (n < 1e-9) return;
      const X = h.X + '-';
      const nOH = ctx.n('OH-'), nK = ctx.n('KOH'), nNa = ctx.n('NaOH'), nEt = ctx.n('C2H5ONa');
      const strong = nOH + nK + nNa + nEt > 1e-9;
      const cl = CLSNAME[h.cls] + '卤代烃';
      // ---- 叔: 水中 SN1; 强碱+有机溶剂 E2 ----
      if (h.cls === 3) {
        if (strong && !sv.aqDom) { ch = baseElim(ctx, h, '叔卤代烃 + 强碱 (E2): 位阻大，亲核取代(SN2)被阻断，强碱夺取 β-H 生成烯烃 (Zaitsev/空间效应；叔卤代烃无法用 Williamson 法制醚)') || ch; return; }
        if (sv.aqDom) {
          const hot = ctx.T >= 60;
          const x = go(ctx, { type: '亲核取代 SN1', name: '叔丁基氯水解 (SN1 溶剂解)', react: { [h.id]: 1, H2O: 1 }, prod: { [h.alc]: 1, 'H+': 1, [X]: 1 }, x: n,
            why: '叔碳正离子稳定 (超共轭/诱导): 速控步为 C–Cl 异裂 → (CH₃)₃C⁺，v = k[RX]，与亲核试剂浓度无关，极性质子溶剂(水)促进离子化；水进攻碳正离子后脱质子得叔丁醇，同时放出 HCl' + (hot ? '。较高温度下 E1(失 H⁺ 生成异丁烯)与 SN1 竞争，产物中烯烃比例增加 (引擎只给主产物)' : '') + (strong ? '。强碱水溶液中叔卤代烃亦以 SN1 为主 (OH⁻ 随后中和生成的 HCl)' : ''),
            ph: [{ k: 'color', note: '有机层(叔丁基氯, 不溶于水)逐渐消失，溶液酸化/pH 下降' }, { k: 'heat' }] });
          if (x) ch = true; return;
        }
        ctx.denied('叔丁基氯: 无水且无强碱时的溶剂解(醇解)产物为醚/烯混合物，引擎仅收录"水中 SN1"与"强碱 E2"', h.id); return;
      }
      // ---- 伯 / 仲 ----
      if (nEt > 1e-9) {
        if (h.cls === 1) return; // Williamson 规则处理
        ch = baseElim(ctx, h, '仲卤代烃 + 烷氧负离子(强碱): 取代被位阻与碱性压制，主产物为 E2 消除 (烯烃) —— 这也是 Williamson 法不适用于仲/叔卤代烃的原因') || ch; return;
      }
      if (!strong) {
        ctx.denied(CLSNAME[h.cls] + '卤代烃' + nm(h.id) + ' 在中性水/醇中(无强碱/强亲核试剂，或已被耗尽): SN2 极慢 (数日量级), 且非 SN1 底物 (' + CLSNAME[h.cls] + '碳正离子不稳定)，剩余部分视为不反应', h.id); return;
      }
      const Tmin = h.cls === 1 ? 50 : 60;
      if (sv.orgDom && !sv.aqDom) {
        if (ctx.T < 60) { ctx.denied(cl + ' + 强碱(乙醇溶液): E2 消除需加热回流 (≥60 °C)，常温下速率很慢', h.id); return; }
        ch = baseElim(ctx, h, cl + ' + 醇钾/醇溶液中的强碱、加热: 低极性、水少的溶剂降低 OH⁻ 溶剂化，增强其碱性 → E2 消除 (β-H 与离去基团反式共平面) 占优；这是 "KOH/乙醇、加热 → 烯烃" 与 "NaOH/水 → 醇" 的经典区别') || ch; return;
      }
      if (ctx.T < Tmin) { ctx.denied(cl + ' + OH⁻(水溶液): SN2 需加热 (≥' + Tmin + ' °C，通常回流)；卤代烃与水不互溶，常温两相反应很慢', h.id); return; }
      const ox = Math.min(n, nOH);
      if (ox > 1e-9) {
        const x = go(ctx, { type: h.cls === 1 ? '亲核取代 SN2' : '亲核取代 SN2/SN1', name: nm(h.id) + ' 碱性水解 → ' + nm(h.alc), react: { [h.id]: 1, 'OH-': 1 }, prod: { [h.alc]: 1, [X]: 1 }, x: ox,
          why: (h.cls === 1 ? '伯卤代烃位阻小: OH⁻ 从离去基团背面进攻，一步协同(Walden 翻转)，v = k[RX][OH⁻]；' : '仲卤代烃在水/弱碱性水溶液中取代为主 (SN2 与 SN1 并存)，同时有少量 E2 消除副产物(引擎未量化)；') + '极性质子溶剂(水)溶剂化 OH⁻，使其碱性减弱而亲核性仍足，取代占优；C–X 键能 C–Br 285 vs C–Cl 339 kJ/mol → 溴代烃更易离去', ph: [{ k: 'color', note: '有机层(卤代烃)逐渐减少，水层中 Br⁻ 增多' }] });
        if (x) ch = true;
      }
    });
    return ch;
  }
  function baseElim(ctx, h, why) {
    const X = h.X + '-';
    const srcs = [['OH-', null], ['KOH', 'K'], ['NaOH', 'Na'], ['C2H5ONa', 'Na']];
    let did = false;
    srcs.forEach(([b, m]) => {
      const nb = ctx.n(b), n = ctx.n(h.id); if (nb < 1e-9 || n < 1e-9) return;
      if (ctx.T < 50) { ctx.denied(nm(h.id) + ' 的 E2 消除: 常温下速率偏低，一般需加热 (≥50 °C)', h.id); return; }
      const react = { [h.id]: 1, [b]: 1 }; let prod;
      if (b === 'OH-') prod = { [h.ene]: 1, [X]: 1, H2O: 1 };
      else if (b === 'C2H5ONa') prod = { [h.ene]: 1, C2H5OH: 1, [h.salt.Na]: 1 };
      else prod = { [h.ene]: 1, [h.salt[m]]: 1, H2O: 1 };
      const x = go(ctx, { type: '消除 E2', name: nm(h.id) + ' 脱 HX → ' + nm(h.ene), react, prod, why, ph: [{ k: 'bubbles', gas: h.ene }, ...(h.salt && b !== 'OH-' ? [{ k: 'precip', id: prod[h.salt.Na] ? h.salt.Na : h.salt[m] }] : [])] });
      if (x) { did = true; ctx.hz(nm(h.ene) + ' 是易燃气体'); }
    });
    return did;
  }
  function rWilliamson(ctx) {
    let ch = false;
    if (has(ctx, 'C2H5ONa') && has(ctx, 'C2H5Br')) {
      if (ctx.T < 30) ctx.denied('Williamson 反应: 乙醇钠 + 溴乙烷通常在回流(≈ 60–80 °C)下进行，常温较慢', 'C2H5Br');
      else if (go(ctx, { type: 'Williamson 醚合成', name: 'C₂H₅ONa + C₂H₅Br → 乙醚 + NaBr', react: { C2H5ONa: 1, C2H5Br: 1 }, prod: { '(C2H5)2O': 1, NaBr: 1 },
        why: '烷氧负离子(强亲核试剂)对伯卤代烃做 SN2；必须无水(否则烷氧基被水质子化为 OH⁻)；底物须为甲基/伯卤代烃(仲、叔卤代烃走 E2)。NaBr 不溶于乙醚/乙醇而析出，推动反应', ph: [{ k: 'precip', id: 'NaBr' }, { k: 'smell', text: '乙醚的甜味(高度易燃, 沸点 34.6 °C)' }, { k: 'heat' }] })) { ch = true; ctx.hz('乙醚: 沸点 34.6 °C，蒸气比空气重且极易燃，勿近明火'); }
    }
    if (has(ctx, 'C6H5O-') && has(ctx, 'C2H5Br') && ctx.aq()) {
      if (ctx.T < 60) ctx.denied('苯氧负离子 + 溴乙烷 (Williamson): 需加热 (≥60 °C)，卤代烃与水相不互溶，常温很慢', 'C2H5Br');
      else if (go(ctx, { type: 'Williamson 醚合成', name: '苯氧负离子 + 溴乙烷 → 苯乙醚', react: { 'C6H5O-': 1, C2H5Br: 1 }, prod: { C6H5OC2H5: 1, 'Br-': 1 },
        why: '酚(pKa≈10)被碱夺质子得苯氧负离子，它在水中仍有足够亲核性，对伯卤代烃 SN2 得芳基烷基醚 (芳基卤代烃则不能反用，因 SN2/SN1 都不可行)', ph: [{ k: 'color', note: '生成不溶于水的油状苯乙醚(有芳香气味)' }] })) ch = true;
    }
    return ch;
  }

  // ============ 烯烃: 加成 / 水合 / 氢化 / Baeyer ============
  const ALK = [
    { id: 'C6H10', dibr: 'C6H10Br2', br: 'C6H11Br', hyd: 'C6H12', ph: 'l' },
    { id: 'C2H4', dibr: 'C2H4Br2', br: 'C2H5Br', hyd: 'C2H6', ph: 'g' },
    { id: 'CH3CH=CH2', dibr: 'C3H6Br2', br: '(CH3)2CHBr', hyd: 'CH3CH2CH3', ph: 'g', mk: true },
    { id: 'CH2=C(CH3)2', dibr: 'C4H8Br2', br: '(CH3)3CBr', hyd: '(CH3)3CH', ph: 'g', mk: true },
  ];
  function rAlkene(ctx) {
    let ch = false;
    ALK.forEach(a => {
      const n = ctx.n(a.id); if (n < 1e-9) return;
      // Br2 加成 (亲电加成, 室温暗处即可)
      ['Br2', 'Br2(aq)'].forEach(src => {
        if (ctx.n(src) < 1e-9) return;
        const sol = src === 'Br2(aq)';
        if (go(ctx, { type: '烯烃亲电加成', name: nm(a.id) + ' + Br₂ → 二溴代烷', react: { [a.id]: 1, [src]: 1 }, prod: { [a.dibr]: 1 },
          why: 'π 键(富电子)进攻被极化的 Br₂，经三元溴鎓离子，Br⁻ 从背面进攻 → 反式加成；C=C 的 π 键(≈ 270 kJ/mol)转为两条 C–Br σ 键，ΔH<0；无需催化剂、暗处即可' + (sol ? '。在水中溴鎓离子也可被水进攻，实际同时生成溴代醇(引擎仅给二溴代物)' : ''),
          ph: [{ k: 'color', note: sol ? '溴水(橙黄色)褪色 —— 烯烃的特征检验' : '红棕色溴褪色，放热' }, { k: 'heat' }] })) ch = true;
      });
      // HBr 加成 (需浓氢溴酸)
      if (ctx.n('H+') > 1e-9 && ctx.n('Br-') > 1e-9) {
        if (ctx.conc('Br-') >= 3 && ctx.conc('H+') >= 3) {
          if (go(ctx, { type: '烯烃亲电加成', name: nm(a.id) + ' + HBr → ' + nm(a.br), react: { [a.id]: 1, 'H+': 1, 'Br-': 1 }, prod: { [a.br]: 1 },
            why: 'H⁺ 先加到双键较多氢的碳上，生成更稳定的碳正离子 (Markovnikov 规则)，Br⁻ 再进攻' + (a.mk ? ' → 主产物是更多取代的卤代烷 (' + nm(a.br) + ')' : '') + '。浓氢溴酸(≥ 3 M)才有可观速率；属平衡反应，ΔG 受浓度影响', ph: [{ k: 'color', note: '烯烃层逐渐转化为不溶于水的卤代烷层' }] })) ch = true;
        } else ctx.denied(nm(a.id) + ' + 氢溴酸: H⁺/Br⁻ 浓度不足 (需 ≥ 3 mol/L 的浓氢溴酸或无水 HBr)，稀酸中亲电加成极慢', a.id);
      }
      // 催化氢化
      const catOK = ['Pd', 'Ni', 'Pt'].includes(ctx.catalyst);
      const H2src = ctx.atm === 'H2' ? Infinity : ctx.n('H2');
      if (H2src > 1e-9) {
        if (!catOK) ctx.denied(nm(a.id) + ' 氢化: ΔG<0 (ΔH ≈ −120 kJ/mol)，但 H–H 键不经催化剂活化无法反应；需 Pd/Pt/Ni 等金属催化剂', a.id);
        else {
          const x0 = Math.min(n, H2src); let added = 0;
          if (ctx.atm === 'H2') { added = n; ctx.add('H2', added); }
          const x = ctx.rxn({ type: '催化氢化', name: nm(a.id) + ' + H₂ → ' + nm(a.hyd), react: { [a.id]: 1, H2: 1 }, prod: { [a.hyd]: 1 }, x: x0,
            why: 'H₂ 在金属表面解离吸附，氢原子经表面顺式(同面)加到吸附的 C=C 上；ΔH ≈ −120 kJ/mol (π 键断裂 + 两条 C–H 形成)；催化剂只降低活化能，不改变平衡', ph: [{ k: 'color', note: '烯烃被氢化，体系体积缩小(耗 H₂)' }, { k: 'heat' }] });
          if (added) ctx.add('H2', -Math.min(ctx.n('H2'), Math.max(0, added - x)));
          if (x > 0) { ch = true; ctx.hz('H₂ 与空气混合易爆；Pd/C、雷尼镍吸附氢后干燥时可自燃，使用后保持湿润'); }
        }
      }
    });
    // 水合 (环己烯, 可逆)
    if (has(ctx, 'C6H10') && ctx.aq()) {
      const strong = ctx.strongAcidMedium() || ctx.hasCat('PTSA');
      const b = ctx.n('C6H11OH'), a = ctx.n('C6H10'), w = ctx.n('H2O');
      if (!strong) ctx.denied('环己烯水合: 需强酸催化(浓 H₂SO₄ / H₃PO₄ 等，生成碳正离子)，纯水或稀酸中几乎不反应', 'C6H10');
      else if (ctx.T < 60) ctx.denied('环己烯水合: 即使有强酸，也需加热 (≥ 60 °C) 才有可观速率', 'C6H10');
      else {
        const th = thermo({ C6H10: 1, H2O: 1 }, { C6H11OH: 1 }, ctx.T); const K = Math.exp(-th.dG * 1000 / (R_GAS * (ctx.T + 273.15)));
        const xi = liqEq(a, w, b, K);
        if (xi > 1e-9) { if (ctx.rxn({ type: '烯烃水合 (可逆)', name: '环己烯 + H₂O ⇌ 环己醇', react: { C6H10: 1, H2O: 1 }, prod: { C6H11OH: 1 }, x: xi, xmaxPossible: Math.min(a, w),
          why: '酸催化: 烯烃质子化 → 碳正离子 → 水进攻 → 脱质子 (Markovnikov)。ΔH = ' + fnum(th.dH, 1) + ' kJ，ΔS = ' + fnum(th.dS, 1) + ' J/K (分子数减少，熵减) → ΔG(' + fnum(ctx.T, 0) + ' °C) = ' + fnum(th.dG, 1) + ' kJ，K = ' + K.toExponential(2) + ' (以摩尔分数计)；温度升高 K 减小(放热)，须靠过量水/移走产物推动', ph: [{ k: 'color', note: '烯烃层缩小，生成可溶于酸性水相的环己醇' }] }) > 0) ch = true; }
        else if (xi < -1e-9) { if (ctx.rxn({ type: '醇脱水 (逆向)', name: '环己醇 → 环己烯 + H₂O', react: { C6H11OH: 1 }, prod: { C6H10: 1, H2O: 1 }, x: -xi, why: '平衡向烯烃一侧移动 (K=' + K.toExponential(2) + ')' }) > 0) ch = true; }
      }
    }
    // Baeyer 试验: 烯烃 + MnO4- (中性/碱性)
    if (has(ctx, 'C6H10') && has(ctx, 'MnO4-') && ctx.aq()) {
      const pH = ctx.pH();
      if (pH >= 3) {
        const x = Math.min(ctx.n('C6H10') / 3, ctx.n('MnO4-') / 2);
        if (go(ctx, { type: '烯烃氧化 (Baeyer)', name: '环己烯 + MnO₄⁻ → 顺-1,2-环己二醇 + MnO₂', react: { C6H10: 3, 'MnO4-': 2, H2O: 4 }, prod: { C6H12O2: 3, MnO2: 2, 'OH-': 2 }, x,
          why: '冷、稀、中性/碱性高锰酸钾对 C=C 顺式二羟基化 (环状锰酸酯水解)；Mn(+7) → Mn(+4) 得 3 e⁻，每个烯烃失 2 e⁻ (n(MnO₄⁻):n(烯) = 2:3)。这是检验不饱和度的经典方法: 紫色褪去并出现棕色 MnO₂', ph: [{ k: 'color', note: '紫红色褪去，生成棕黑色 MnO₂ 沉淀' }, { k: 'precip', id: 'MnO2' }] })) ch = true;
      } else ctx.denied('烯烃 + 酸性 KMnO₄: 强烈条件下 C=C 会被氧化断裂为羧酸 (如己二酸)，引擎未收录该路径', 'C6H10');
    }
    // 苯酚 + 溴水
    if (has(ctx, 'C6H6O') && has(ctx, 'Br2(aq)') && ctx.aq()) {
      const x = Math.min(ctx.n('C6H6O'), ctx.n('Br2(aq)') / 3);
      if (go(ctx, { type: '芳环亲电取代', name: '苯酚 + 溴水 → 2,4,6-三溴苯酚', react: { C6H6O: 1, 'Br2(aq)': 3 }, prod: { C6H3Br3O: 1, 'H+': 3, 'Br-': 3 }, x,
        why: '酚羟基强活化苯环(邻、对位电子密度高)，无需催化剂即可三溴取代；产物三溴苯酚难溶于水而析出', ph: [{ k: 'precip', id: 'C6H3Br3O' }, { k: 'color', note: '溴水褪色并析出白色沉淀' }] })) ch = true;
    }
    // 苯的溴代 (FeBr3)
    if (has(ctx, 'C6H6') && has(ctx, 'Br2')) {
      const cat = ctx.hasCat('FeBr3') || has(ctx, 'Fe');
      if (ctx.aq()) ctx.denied('苯 + Br₂: FeBr₃ 催化的溴代需无水条件 (水使路易斯酸失活)', 'C6H6');
      else if (!cat) ctx.denied('苯 + Br₂: 苯的离域 π 体系(芳香稳定化能 ≈ 150 kJ/mol)使其不能像烯烃那样与 Br₂ 加成；没有路易斯酸(FeBr₃/铁粉)时不反应', 'C6H6');
      else {
        const x = Math.min(ctx.n('C6H6'), ctx.n('Br2'));
        if (go(ctx, { type: '芳环亲电取代', name: '苯 + Br₂ → 溴苯 + HBr (FeBr₃)', react: { C6H6: 1, Br2: 1 }, prod: { C6H5Br: 1, 'HBr(g)': 1 }, x,
          why: 'FeBr₃ 使 Br₂ 极化生成强亲电试剂 Br⁺[FeBr₄]⁻，进攻苯环形成 σ-络合物后失 H⁺ 恢复芳香性 (取代而非加成)；ΔH ≈ −24 kJ/mol', ph: [{ k: 'bubbles', gas: 'HBr(g)' }, { k: 'color', note: '红棕色溴褪去，放出 HBr 白雾' }] })) { ch = true; ctx.hz('HBr 与溴蒸气均有强腐蚀性/毒性，须通风橱并吸收尾气'); }
      }
    }
    if (has(ctx, 'C6H6') && has(ctx, 'Br2(aq)')) cover(ctx, 'C6H6', 'Br2water', '苯与溴水不反应(只是 Br₂ 被萃取进苯层而使水层褪色，属物理萃取)，这正是苯与烯烃的区别');
    // 烷烃光溴代
    if (has(ctx, 'C6H14') && has(ctx, 'Br2')) {
      if (!ctx.setup.light) ctx.denied('己烷 + Br₂: 烷烃无 π 键、不被 Br₂ 亲电进攻；无光照/引发剂时不产生溴自由基，暗处室温不反应 (与烯烃形成对比)', 'C6H14');
      else {
        const x = Math.min(ctx.n('C6H14'), ctx.n('Br2'));
        if (go(ctx, { type: '光化学自由基取代', name: '己烷 + Br₂ --hν→ 溴代己烷 + HBr', react: { C6H14: 1, Br2: 1 }, prod: { C6H13Br: 1, 'HBr(g)': 1 }, x,
          why: '光照使 Br–Br 均裂(键能 193 kJ/mol，λ<~ 620 nm)产生 Br•，链增长: Br• + RH → R• + HBr，R• + Br₂ → RBr + Br•；溴自由基选择性高，主要取代叔/仲 C–H (产物为混合物，引擎以 2-溴己烷计)', ph: [{ k: 'bubbles', gas: 'HBr(g)' }, { k: 'color', note: '光照下红棕色逐渐褪去' }] })) { ch = true; ctx.hz('HBr/溴蒸气腐蚀有毒'); }
      }
    }
    if (has(ctx, 'C7H8') && has(ctx, 'MnO4-') && ctx.aq()) {
      const pH = ctx.pH();
      if (ctx.T >= 80 && pH >= 7) {
        const x = Math.min(ctx.n('C7H8'), ctx.n('MnO4-') / 2);
        if (go(ctx, { type: '侧链氧化', name: '甲苯 + MnO₄⁻ → 苯甲酸根 + MnO₂', react: { C7H8: 1, 'MnO4-': 2 }, prod: { 'C7H5O2-': 1, MnO2: 2, 'OH-': 1, H2O: 1 }, x,
          why: '含苄位 C–H 的烷基苯侧链可被热的 KMnO₄ 氧化为羧酸(苯环本身不被氧化)；Mn(+7) → Mn(+4)，每个甲苯失 6 e⁻ → n(MnO₄⁻) = 2·n(甲苯)', ph: [{ k: 'color', note: '紫色褪去，生成棕色 MnO₂' }, { k: 'precip', id: 'MnO2' }] })) ch = true;
      } else ctx.denied('甲苯 + KMnO₄: 侧链氧化需加热回流(≥80 °C)且中性/碱性介质，常温几乎不反应', 'C7H8');
    }
    return ch;
  }

  // ============ 醛的检验 / 碘仿 / Lucas ============
  function rCarbonyl(ctx) {
    let ch = false;
    // Tollens
    [['CH3CHO', 'CH3COO-', '乙醛', { CH3CHO: 1 }, { 'CH3COO-': 1 }], ['C6H12O6', 'C6H11O7-', '葡萄糖', { C6H12O6: 1 }, { 'C6H11O7-': 1 }]].forEach(([id, ac, name, r1, p1]) => {
      if (has(ctx, id) && has(ctx, 'Ag(NH3)2+') && has(ctx, 'OH-')) {
        const x = Math.min(ctx.n(id), ctx.n('Ag(NH3)2+') / 2, ctx.n('OH-') / 2);
        if (go(ctx, { type: '银镜反应 (Tollens)', name: name + ' + [Ag(NH₃)₂]⁺ → 羧酸根 + Ag', react: Object.assign({ 'Ag(NH3)2+': 2, 'OH-': 2 }, r1), prod: Object.assign({ Ag: 2, 'NH3(aq)': 3, 'NH4+': 1, H2O: 1 }, p1), x,
          why: '醛基(–CHO)是还原剂，被碱性银氨配离子氧化为羧酸根，Ag(I) → Ag(0)：E°(Ag⁺/Ag)=+0.80 V，配位使其降低但碱性下醛基(还原电位更低)仍可还原；每个醛基给出 2 e⁻，析出 2 Ag。酮、非还原糖(蔗糖)无游离醛基，不反应', ph: [{ k: 'precip', id: 'Ag' }, { k: 'color', note: '试管内壁形成光亮的银镜 (银沉积)' }] })) { ch = true; ctx.hz('Tollens 试剂不可存放：陈化后会生成易爆的雷酸银/氮化银；试验后立即加稀硝酸销毁并回收银'); }
      }
    });
    // Fehling
    [['CH3CHO', 'CH3COO-', '乙醛', { CH3CHO: 1 }, { 'CH3COO-': 1 }], ['C6H12O6', 'C6H11O7-', '葡萄糖', { C6H12O6: 1 }, { 'C6H11O7-': 1 }]].forEach(([id, ac, name, r1, p1]) => {
      if (has(ctx, id) && has(ctx, 'Cu(C4H4O6)2^2-') && has(ctx, 'OH-')) {
        if (ctx.T < 50) { ctx.denied('斐林试验: ' + name + ' 与斐林试剂需水浴加热(≥ 50–60 °C)才出现砖红色沉淀；常温不反应或极慢', id); return; }
        const x = Math.min(ctx.n(id), ctx.n('Cu(C4H4O6)2^2-') / 2, ctx.n('OH-') / 5);
        if (go(ctx, { type: '斐林试验', name: name + ' + Cu(II)-酒石酸盐 → 羧酸根 + Cu₂O↓', react: Object.assign({ 'Cu(C4H4O6)2^2-': 2, 'OH-': 5 }, r1), prod: Object.assign({ Cu2O: 1, 'C4H4O6^2-': 4, H2O: 3 }, p1), x,
          why: '酒石酸根把 Cu²⁺ 螯合在碱性溶液中(避免生成 Cu(OH)₂)；醛基被 Cu(II) 氧化为羧酸根，Cu(II) → Cu(I)，Cu₂O 难溶(砖红色)。每个醛基给 2 e⁻，2 Cu(II) → Cu₂O。芳香醛、酮不反应；葡萄糖在碱中异构为链状可反应', ph: [{ k: 'precip', id: 'Cu2O' }, { k: 'color', note: '深蓝色溶液逐渐变为砖红色沉淀' }] })) ch = true;
      }
    });
    // 碘仿反应
    if (has(ctx, 'I2') && has(ctx, 'OH-') && ctx.aq()) {
      [['C3H6O', '丙酮', { C3H6O: 1, I2: 3, 'OH-': 4 }, { CHI3: 1, 'CH3COO-': 1, 'I-': 3, H2O: 3 }, 3, 4, 0], ['C2H5OH', '乙醇', { C2H5OH: 1, I2: 4, 'OH-': 6 }, { CHI3: 1, 'HCOO-': 1, 'I-': 5, H2O: 5 }, 4, 6, 50]].forEach(([id, name, r, p, ni, no, Tm]) => {
        if (!has(ctx, id)) return;
        if (ctx.T < Tm) { ctx.denied('碘仿反应: 乙醇需先被 NaIO 氧化为乙醛，一般需温热(≈ 50–60 °C)', id); return; }
        const x = Math.min(ctx.n(id), ctx.n('I2') / ni, ctx.n('OH-') / no);
        if (go(ctx, { type: '碘仿反应', name: name + ' + I₂ + OH⁻ → 碘仿 CHI₃↓ + 羧酸根', react: r, prod: p, x,
          why: 'I₂ + 2OH⁻ → I⁻ + IO⁻ + H₂O (次碘酸根)；含 CH₃CO– (或可被氧化为 CH₃CO– 的 CH₃CH(OH)–) 的化合物: α-氢被逐个碘代为 –COCI₃，再被 OH⁻ 进攻断裂得 CHI₃ 与羧酸根。碘仿为亮黄色、有特殊气味的沉淀，是检验甲基酮/乙醇的经典定性反应', ph: [{ k: 'precip', id: 'CHI3' }, { k: 'smell', text: '药味(碘仿)' }, { k: 'color', note: '碘的颜色褪去，析出亮黄色碘仿沉淀' }] })) ch = true;
      });
    }
    // Lucas 试验 (定性)
    if (ctx.aq() && ctx.conc('H+') >= 5 && ctx.conc('Cl-') >= 5) {
      if (has(ctx, '(CH3)3COH')) qual(ctx, 'lucas3', { type: 'Lucas 试验 (定性)', name: '叔丁醇 + 浓 HCl → 叔丁基氯', eqText: '(CH₃)₃COH + HCl → (CH₃)₃CCl↓ + H₂O', why: '叔醇经稳定的叔碳正离子 (SN1) 在 HCl(ZnCl₂ 促进)中立即转化为不溶于水的叔氯代烷，溶液立即浑浊/分层 —— 区分伯、仲、叔醇的经典方法。该规则为定性判断，不改变物料衡算', ph: [{ k: 'color', note: '立即出现浑浊并分层(叔氯代烷)' }] });
      if (has(ctx, '(CH3)2CHOH')) qual(ctx, 'lucas2', { type: 'Lucas 试验 (定性)', name: '异丙醇 + 浓 HCl/ZnCl₂', eqText: '(CH₃)₂CHOH + HCl → (CH₃)₂CHCl + H₂O (慢)', why: '仲醇的碳正离子稳定性中等，需温热且几分钟后才浑浊。定性判断，不改变物料衡算', ph: [{ k: 'color', note: '数分钟后(加热)缓慢浑浊' }] });
      if (has(ctx, 'C2H5OH')) qual(ctx, 'lucas1', { type: 'Lucas 试验 (定性)', name: '乙醇 + 浓 HCl/ZnCl₂', eqText: '伯醇: 常温无明显现象', why: '伯碳正离子极不稳定，SN1 不能进行，需加热很久才反应：常温溶液保持澄清。定性判断', ph: [{ k: 'color', note: '常温下保持澄清(无浑浊)' }] });
    }
    // 羟醛(Claisen–Schmidt)缩合
    if (has(ctx, 'C7H6O') && has(ctx, 'C3H6O')) {
      if (ctx.aq() && ctx.conc('OH-') >= 0.03 && ctx.T <= 70) {
        const x = Math.min(ctx.n('C7H6O') / 2, ctx.n('C3H6O'));
        if (go(ctx, { type: '羟醛缩合 (Claisen–Schmidt)', name: '2 苯甲醛 + 丙酮 → 二亚苄基丙酮 + 2 H₂O', react: { C7H6O: 2, C3H6O: 1 }, prod: { C17H14O: 1, H2O: 2 }, x,
          why: 'OH⁻ 夺取丙酮 α-H 生成烯醇负离子，亲核进攻无 α-H 的苯甲醛(不能自身缩合)得 β-羟基酮，随即脱水形成与苯环共轭的 C=C(推动力: 共轭稳定 + 产物析出)；n(PhCHO):n(丙酮)=2:1 得双缩合产物，1:1 且丙酮过量则主要得苄叉丙酮', ph: [{ k: 'precip', id: 'C17H14O' }, { k: 'color', note: '混合物变浑浊，析出黄色固体' }] })) ch = true;
      } else ctx.denied('Claisen–Schmidt 缩合需碱催化(c(OH⁻) ≥ 0.03 mol/L，水/乙醇介质)且温度不宜过高(≤ 70 °C，否则 Cannizzaro/副反应)', 'C7H6O');
    }
    if ((has(ctx, 'NaOH') || has(ctx, 'OH-')) && has(ctx, 'C3H6O') && !has(ctx, 'C7H6O')) cover(ctx, 'C3H6O', ids(ctx, 'NaOH') ? 'NaOH' : 'KOH', '丙酮在碱中的自身羟醛加成(→ 双丙酮醇)是不利平衡 (K ≈ 0.02，产物 < 5%)，并非能持续进行的反应；需与无 α-H 的醛(如苯甲醛)交叉缩合才有产物');
    return ch;
  }

  // ============ 油脂皂化 / 皂垢 / 酰化成酰胺 / 聚合 ============
  function rLipidAmidePoly(ctx) {
    let ch = false;
    // 皂化
    if (has(ctx, 'C57H104O6') && has(ctx, 'OH-') && ctx.aq()) {
      if (ctx.T < 60) ctx.denied('油脂皂化: 油相与碱水溶液不互溶，常温几乎不反应；需加热(≥ 60 °C)并搅拌，加乙醇助溶可加快', 'C57H104O6');
      else {
        const x = Math.min(ctx.n('C57H104O6'), ctx.n('OH-') / 3);
        if (go(ctx, { type: '皂化反应', name: '油脂 + 3 OH⁻ → 甘油 + 3 肥皂(油酸根)', react: { C57H104O6: 1, 'OH-': 3 }, prod: { C3H8O3: 1, 'C18H33O2-': 3 }, x,
          why: 'OH⁻ 进攻酯羰基(三个酯键依次水解)，生成的羧酸立即被碱中和成羧酸盐(肥皂)，因此反应不可逆(对比酯的酸催化水解是可逆平衡)；每摩尔三酰甘油消耗 3 mol 碱', ph: [{ k: 'color', note: '油层逐渐消失、溶液均相化；摇动产生丰富泡沫(肥皂)' }, { k: 'smell', text: '(无明显气味)' }] })) { ch = true; ctx.hz('皂化需热的强碱: 腐蚀、烫伤；勿让碱液溅入眼睛'); }
      }
    }
    // 皂垢
    if (has(ctx, 'C18H33O2-') && has(ctx, 'Ca^2+')) {
      const x = Math.min(ctx.n('Ca^2+'), ctx.n('C18H33O2-') / 2);
      if (go(ctx, { type: '沉淀 (皂垢)', name: 'Ca²⁺ + 2 肥皂阴离子 → 皂垢', react: { 'Ca^2+': 1, 'C18H33O2-': 2 }, prod: { 'Ca(C18H33O2)2': 1 }, x,
        why: '二价钙/镁离子与长链羧酸根形成不溶性盐(硬水中肥皂失效、产生浮渣)；合成洗涤剂的磺酸盐钙盐可溶，故不产生皂垢', ph: [{ k: 'precip', id: 'Ca(C18H33O2)2' }] })) ch = true;
    }
    // 盐析
    if (has(ctx, 'C18H33O2-') && ctx.conc('Na+') >= 4) qual(ctx, 'saltout', { type: '盐析 (定性)', name: '高浓度 Na⁺ 使肥皂凝聚', eqText: 'RCOO⁻(胶束) + Na⁺(高浓度) → 肥皂凝聚上浮', why: '高浓度电解质压缩胶束双电层并降低肥皂溶解度，使肥皂从甘油水溶液中凝聚析出(工业分离甘油与皂的方法)。定性判断', ph: [{ k: 'color', note: '肥皂凝结成块上浮 (盐析)' }] });
    // 乙酸酐 + 苯胺 → 乙酰苯胺
    if (has(ctx, 'C6H7N') && has(ctx, 'C4H6O3')) {
      const x = Math.min(ctx.n('C6H7N'), ctx.n('C4H6O3'));
      if (go(ctx, { type: '酰胺合成 (N-酰化)', name: '苯胺 + 乙酸酐 → 乙酰苯胺 + 乙酸', react: { C6H7N: 1, C4H6O3: 1 }, prod: { C8H9NO: 1, CH3COOH: 1 }, x,
        why: '氨基氮(孤对电子，亲核性强于水)进攻酸酐羰基，乙酸根离去；快速、放热、无需催化剂。N 上孤对电子与羰基共轭 → 酰胺不再碱性，且酰化后苯环活性降低 (这是保护氨基的常用办法)', ph: [{ k: 'precip', id: 'C8H9NO' }, { k: 'heat' }, { k: 'smell', text: '醋酸味' }] })) { ch = true; ctx.hz('苯胺经皮肤吸收可致高铁血红蛋白症'); }
    }
    // 己二酰氯 + 己二胺 → 尼龙-66
    if (has(ctx, 'ClCO(CH2)4COCl') && has(ctx, 'H2N(CH2)6NH2')) {
      const x = Math.min(ctx.n('ClCO(CH2)4COCl'), ctx.n('H2N(CH2)6NH2'));
      const wet = ctx.aq();
      if (go(ctx, { type: '缩聚 (尼龙-66)', name: '己二酰氯 + 己二胺 → 尼龙-66 (每个重复单元) + 2 HCl', react: { 'ClCO(CH2)4COCl': 1, 'H2N(CH2)6NH2': 1 }, prod: wet ? { '[C12H22N2O2]': 1, 'H+': 2, 'Cl-': 2 } : { '[C12H22N2O2]': 1, 'HCl(g)': 2 }, x,
        why: '二官能团单体逐步缩聚：每形成一个酰胺键放出一分子 HCl (需加碱捕获，否则胺被质子化而失活)。两相界面(己二胺水溶液/己二酰氯有机层)瞬间成膜，把膜拉出可得连续尼龙丝 (“尼龙绳”实验)。n(重复单元) 按 1:1 摩尔比；ΔH 数据缺失', ph: [{ k: 'color', note: '两液界面立即形成白色薄膜，可用镊子连续拉出尼龙丝' }] })) { ch = true; ctx.hz('己二酰氯腐蚀、催泪，遇水放出 HCl；实验须通风'); }
    }
    if (has(ctx, 'ClCO(CH2)4COCl') && ctx.aq()) {
      const x = ctx.n('ClCO(CH2)4COCl');
      if (go(ctx, { type: '酰氯水解', name: '己二酰氯 + 2 H₂O → 己二酸 + 2 HCl', react: { 'ClCO(CH2)4COCl': 1, H2O: 2 }, prod: { C6H10O4: 1, 'H+': 2, 'Cl-': 2 }, x, why: '酰氯是最活泼的羧酸衍生物，遇水(亲核试剂)迅速水解并放出 HCl；与胺竞争时胺的亲核性更强，因此尼龙膜优先生成', ph: [{ k: 'steam' }, { k: 'smell', text: '刺鼻 HCl 酸雾' }] })) { ch = true; ctx.hz('酰氯水解放出 HCl 酸雾'); }
    }
    // 苯乙烯聚合
    if (has(ctx, 'C8H8')) {
      const init = has(ctx, 'S2O8^2-') || has(ctx, 'K2S2O8');
      if (!init) ctx.denied('苯乙烯: 商品含阻聚剂(TBC)；没有自由基引发剂时室温不聚合 (热引发需 > 120 °C，极慢)', 'C8H8');
      else if (ctx.T < 60) ctx.denied('苯乙烯聚合: 过硫酸盐在 < 60 °C 分解产生自由基的速率很低，需 ≥ 60–70 °C', 'C8H8');
      else {
        const x = ctx.n('C8H8');
        if (go(ctx, { type: '自由基聚合', name: 'n 苯乙烯 → 聚苯乙烯 (以重复单元计)', react: { C8H8: 1 }, prod: { '[C8H8]': 1 }, x,
          why: 'S₂O₈²⁻ 受热均裂为 2 SO₄•⁻ 引发；链增长: R• + CH₂=CHPh → R–CH₂–C•HPh；聚合热 ΔHp = ' + fnum((SP['[C8H8]'].H - SP['C8H8'].H), 1) + ' kJ/mol (π 键 → σ 键，强放热)，ΔS<0，故存在天花板温度(≈ 310 °C)。乳液聚合得乳白色胶乳', ph: [{ k: 'color', note: '体系变为乳白色胶乳，随转化率升高黏度增大' }, { k: 'heat' }] })) { ch = true; ctx.hz('苯乙烯聚合强放热，大规模或无冷却时可能失控；苯乙烯易燃'); }
      }
    }
    // 聚苯乙烯 + 溶剂 (物理溶解)
    if (has(ctx, '[C8H8]') && (has(ctx, 'C3H6O') || has(ctx, 'C7H8') || has(ctx, 'C6H6')) && ids(ctx, 'PS'))
      qual(ctx, 'psdis', { type: '物理溶解 (定性)', name: '聚苯乙烯泡沫 + 有机溶剂 → 溶解、体积塌缩', eqText: '(C₈H₈)ₙ(s) + 溶剂 → 聚合物溶液 (无化学键变化)', why: '“相似相溶”: 聚苯乙烯(非极性、芳香侧链)溶于丙酮、甲苯等极性适中/芳香溶剂，分子间色散力被溶剂化取代；泡沫中 ≈ 95–98% 的体积是气泡，溶解后体积塌缩。这是物理过程(无化学反应)，物料衡算不变；ΔH 近似为零', ph: [{ k: 'color', note: '泡沫迅速塌缩、溶解成黏稠透明液体' }] });
    return ch;
  }

  // ============ 无机: 歧化 / 碘量 / 氧化物还原 / 水合盐 / 焰色 / 光化学 / 腐蚀 ============
  function rInorg(ctx) {
    let ch = false; const aq = ctx.aq();
    if (aq) {
      // I2 + OH-  歧化
      if (has(ctx, 'I2') && has(ctx, 'OH-') && !has(ctx, 'C3H6O') && !has(ctx, 'C2H5OH')) {
        const pH = ctx.pH(); const E1 = 0.536, E2 = 1.195 - 0.05916 * 1.2 * pH, Ec = E1 - E2;
        if (Ec > 0) {
          const x = Math.min(ctx.n('I2') / 3, ctx.n('OH-') / 6);
          if (go(ctx, { type: '歧化反应', name: '3 I₂ + 6 OH⁻ → 5 I⁻ + IO₃⁻ + 3 H₂O', react: { I2: 3, 'OH-': 6 }, prod: { 'I-': 5, 'IO3-': 1, H2O: 3 }, x,
            why: '同一元素 I(0) 同时被氧化(→ IO₃⁻, +5)和还原(→ I⁻, −1)。判据: 作氧化剂的电对 E°(I₂/I⁻)=+0.536 V，作还原剂的电对 E(IO₃⁻/I₂)=1.195 − 0.0710·pH = ' + fnum(E2, 3) + ' V (pH=' + fnum(pH, 1) + ')，E°cell = ' + fnum(Ec, 3) + ' V > 0 → 自发 (碱性越强越有利)。注意 ΔH>0 但 ΔS 很大(碱的溶剂化熵增)，由 ΔG = −nFE 决定', ph: [{ k: 'color', note: '碘的紫黑色/棕色逐渐褪去，得无色溶液' }] })) ch = true;
        } else ctx.denied('I₂ 在 pH=' + fnum(pH, 1) + ' 时: E°cell = ' + fnum(Ec, 3) + ' V ≤ 0，歧化不自发 (碱性不够强)', 'I2');
      }
      // Br2 + OH-  歧化 (与 I2 类似; Br2/Br⁻ 为 1.087 V, BrO3⁻/Br2 为 1.482 − 0.0710 pH)
      if ((has(ctx, 'Br2(aq)') || has(ctx, 'Br2')) && has(ctx, 'OH-') && !['C6H10', 'C6H6', 'C6H14', 'C6H6O', 'C7H8', 'C6H7N', 'C8H8', 'C3H6O', 'C2H5OH', 'NH3(aq)'].some(k => has(ctx, k))) {
        const sp = has(ctx, 'Br2(aq)') ? 'Br2(aq)' : 'Br2'; const pH = ctx.pH(); const Ec = 1.087 - (1.482 - 0.05916 * 1.2 * pH);
        if (Ec > 0) {
          const x = Math.min(ctx.n(sp) / 3, ctx.n('OH-') / 6);
          if (go(ctx, { type: '歧化反应', name: '3 Br₂ + 6 OH⁻ → 5 Br⁻ + BrO₃⁻ + 3 H₂O', react: { [sp]: 3, 'OH-': 6 }, prod: { 'Br-': 5, 'BrO3-': 1, H2O: 3 }, x,
            why: 'Br(0) 同时被氧化(→ BrO₃⁻, +5)与还原(→ Br⁻, −1)。判据: E°(Br₂/Br⁻)=+1.087 V，E(BrO₃⁻/Br₂)=1.482 − 0.0710·pH = ' + fnum(1.482 - 0.05916 * 1.2 * pH, 3) + ' V (pH=' + fnum(pH, 1) + ')，E°cell = ' + fnum(Ec, 3) + ' V > 0 → 碱性溶液中溴水褪色 (低温短时间内主要先得 BrO⁻，引擎按热力学最终产物 BrO₃⁻ 计)', ph: [{ k: 'color' }, { k: 'heat' }] })) ch = true;
        }
      }
      // Cu2O + H+  Cu(I) 歧化
      if (has(ctx, 'Cu2O') && ctx.n('H+') > 1e-9) {
        if (ctx.n('NO3-') > 1e-9 && ctx.conc('H+') > 0.1) ctx.denied('Cu₂O + HNO₃: 硝酸会把 Cu(I)/Cu 氧化为 Cu²⁺ 并放出 NO，引擎未收录该氧化路径', 'Cu2O');
        else {
          const x = Math.min(ctx.n('Cu2O'), ctx.n('H+') / 2);
          if (go(ctx, { type: '歧化反应', name: 'Cu₂O + 2 H⁺ → Cu + Cu²⁺ + H₂O', react: { Cu2O: 1, 'H+': 2 }, prod: { Cu: 1, 'Cu^2+': 1, H2O: 1 }, x,
            why: 'Cu⁺ 在水溶液中不稳定: E°(Cu⁺/Cu)=+0.521 V > E°(Cu²⁺/Cu⁺)=+0.153 V，E°cell = +0.368 V > 0 → 2 Cu⁺ → Cu + Cu²⁺ (K ≈ 1.7×10⁶)。Cu₂O 遇稀硫酸/盐酸(非氧化性酸)即发生此歧化', ph: [{ k: 'color', note: '砖红色 Cu₂O 溶解，出现红色金属铜粉并使溶液变蓝' }, { k: 'solid' }] })) ch = true;
        }
      }
      // S2O3^2- + H+  歧化
      if (has(ctx, 'S2O3^2-') && ctx.n('H+') > 1e-9) {
        const x = Math.min(ctx.n('S2O3^2-'), ctx.n('H+') / 2);
        if (go(ctx, { type: '歧化反应', name: 'S₂O₃²⁻ + 2 H⁺ → S↓ + SO₂ + H₂O', react: { 'S2O3^2-': 1, 'H+': 2 }, prod: { S: 1, 'SO2(aq)': 1, H2O: 1 }, x,
          why: '硫代硫酸根中 S 平均 +2：酸中不稳定的 H₂S₂O₃ 分解，一个 S 被还原为 S(0)，另一个被氧化为 S(+4)(SO₂)。ΔG° = ΔfG°(S)+ΔfG°(SO₂,aq)+ΔfG°(H₂O) − ΔfG°(S₂O₃²⁻) = 0 + (−300.7) + (−237.1) − (−522.5) = −15.3 kJ < 0，自发；析出的单质硫使溶液逐渐变浑浊 ("硫钟"反应)', ph: [{ k: 'color', note: '溶液逐渐变乳白色浑浊(胶态硫)' }, { k: 'smell', text: '刺激性 SO₂ 气味' }] })) { ch = true; ctx.hz('SO₂ 刺激性有毒'); }
      }
      // 碘量: I2 + 2 S2O3^2-
      if (has(ctx, 'S2O3^2-') && has(ctx, 'I2')) {
        const x = Math.min(ctx.n('I2'), ctx.n('S2O3^2-') / 2);
        if (go(ctx, { type: '氧化还原 (碘量法)', name: 'I₂ + 2 S₂O₃²⁻ → 2 I⁻ + S₄O₆²⁻', react: { I2: 1, 'S2O3^2-': 2 }, prod: { 'I-': 2, 'S4O6^2-': 1 }, x,
          why: 'E°(I₂/I⁻)=+0.536 V > E°(S₄O₆²⁻/S₂O₃²⁻)=+0.08 V → E°cell ≈ +0.46 V，快速定量 (碘量法滴定的基础, n(I₂):n(S₂O₃²⁻)=1:2)；产物连四硫酸根', ph: [{ k: 'color', note: '碘的棕色褪去 (淀粉指示剂: 蓝色消失)' }] })) ch = true;
      }
    }
    // ---- 氧化物还原 (干法): 铝热型仅作热力学判断 ----
    if (!aq) {
      const OXR = [
        { name: '铝热型: 2 Al + Fe₂O₃ → Al₂O₃ + 2 Fe', react: { Al: 2, Fe2O3: 1 }, prod: { Al2O3: 1, Fe: 2 }, minT: 900, therm: true, nf: 'Fe2O3' },
        { name: '铝热型: 2 Al + 3 CuO → Al₂O₃ + 3 Cu', react: { Al: 2, CuO: 3 }, prod: { Al2O3: 1, Cu: 3 }, minT: 700, therm: true, nf: 'CuO' },
        { name: 'Zn 还原 CuO (置换型固相反应)', react: { Zn: 1, CuO: 1 }, prod: { ZnO: 1, Cu: 1 }, minT: 400, nf: 'CuO' },
        { name: 'C 还原 Fe₂O₃ (高炉炼铁原理)', react: { Fe2O3: 2, C: 3 }, prod: { Fe: 4, CO2: 3 }, minT: 700, nf: 'Fe2O3' },
        { name: 'H₂ 还原 CuO', react: { CuO: 1, H2: 1 }, prod: { Cu: 1, 'H2O(g)': 1 }, minT: 200, nf: 'CuO', needH2: true },
      ];
      OXR.forEach(o => {
        const keys = Object.keys(o.react).filter(k => !(o.needH2 && k === 'H2'));
        if (!keys.every(k => has(ctx, k))) return;
        if (o.needH2 && !(ctx.atm === 'H2' || has(ctx, 'H2'))) { ctx.denied('H₂ + CuO: 需要氢气气氛 (在"气氛"中选择氢气)', 'CuO'); return; }
        const th = thermo(o.react, o.prod, ctx.T);
        const enough = ctx.T >= o.minT || (o.therm && ctx.ignite);
        if (th.dG >= 0 && ctx.T >= o.minT) { ctx.denied(o.name + ': ΔG(' + fnum(ctx.T, 0) + ' °C) = ' + fnum(th.dG, 1) + ' kJ > 0，热力学上不自发' + (th.Teq !== null ? '；ΔH=' + fnum(th.dH, 0) + ' kJ, ΔS=' + fnum(th.dS, 0) + ' J/K → 需 T > ' + fnum(th.Teq, 0) + ' °C' : ''), o.nf); return; }
        if (!enough) { ctx.denied(o.name + ': 热力学自发(ΔG(298 K) ≈ ' + fnum(thermo(o.react, o.prod, 25).dG, 0) + ' kJ)，但固-固反应有很高的活化能垒，需达到引发温度(≥ ' + o.minT + ' °C' + (o.therm ? ' 的局部高温/强点火源' : '') + ')，常温下不反应', o.nf); return; }
        let x = Infinity; keys.forEach(k => { x = Math.min(x, ctx.n(k) / o.react[k]); });
        if (o.needH2 && ctx.atm === 'H2') { var addH = x; ctx.add('H2', addH); }
        const done = ctx.rxn({ type: o.therm ? '金属热还原 (铝热型)' : '氧化物还原 (固相)', name: o.name, react: o.react, prod: o.prod, x,
          why: 'ΔH = ' + fnum(th.dH, 1) + ' kJ，ΔS = ' + fnum(th.dS, 1) + ' J/K → ΔG(' + fnum(ctx.T, 0) + ' °C) = ΔH − TΔS = ' + fnum(th.dG, 1) + ' kJ < 0' + (o.therm ? '。仅作热力学判断: 金属-氧键能差决定放热量(Al–O 远强于 Fe–O)；引擎不给出配比/点火/操作细节' : (th.Teq !== null && th.dH > 0 ? '；吸热反应靠熵增驱动，转折温度 ≈ ' + fnum(th.Teq, 0) + ' °C' : '')),
          ph: o.therm ? [{ k: 'flame', text: '耀眼白光、大量火花，生成熔融金属' }, { k: 'smoke' }] : [{ k: 'color', note: 'CuO 黑色 → 红色金属铜' }] });
        if (o.needH2 && ctx.atm === 'H2') ctx.add('H2', -Math.min(ctx.n('H2'), Math.max(0, x - done)));
        if (done > 0) { ch = true; if (o.therm) { ctx.combustion = true; ctx.flameInfo = { color: '#ffffff' }; ctx.hz('铝热型反应放热极强，产物为熔融金属(2000 °C 以上)；严禁用水扑救。本模拟器只给热力学判断，不提供配比、点火或操作信息'); } }
      });
    }
    return ch;
  }

  // 水合盐脱水
  const HYD = [
    { id: 'CaSO4·2H2O', name: '石膏部分脱水 → 熟石膏', react: { 'CaSO4·2H2O': 2 }, prod: { '(CaSO4)2·H2O': 1, 'H2O(g)': 3 }, minT: 100, ph: [{ k: 'steam' }, { k: 'color', note: '白色石膏 → 熟石膏粉末(遇水可重新硬化)' }] },
    { id: 'MgSO4·7H2O', name: '泻盐脱水 → 无水 MgSO₄', react: { 'MgSO4·7H2O': 1 }, prod: { MgSO4: 1, 'H2O(g)': 7 }, minT: 120, ph: [{ k: 'steam' }] },
    { id: 'Na2CO3·10H2O', name: '洗涤碱脱水 → 无水 Na₂CO₃', react: { 'Na2CO3·10H2O': 1 }, prod: { Na2CO3: 1, 'H2O(g)': 10 }, minT: 35, ph: [{ k: 'steam' }, { k: 'color', note: '透明晶体风化成白色粉末' }] },
  ];
  function rHydrate(ctx) {
    let ch = false;
    HYD.forEach(d => {
      const n = ctx.n(d.id); if (n < 1e-10 || ctx.aq()) return;
      const th = thermo(d.react, d.prod, ctx.T);
      if (th.dG < 0 && ctx.T >= d.minT) {
        if (go(ctx, { type: '水合盐脱水', name: d.name, react: d.react, prod: d.prod, x: n / Object.values(d.react)[0], why: 'ΔH = ' + fnum(th.dH, 1) + ' kJ (吸热, 断开结晶水键)，ΔS = ' + fnum(th.dS, 1) + ' J/K (生成气态水，熵大增) → ΔG(' + fnum(ctx.T, 0) + ' °C) = ' + fnum(th.dG, 1) + ' kJ < 0；转折温度 T = ΔH/ΔS ≈ ' + fnum(th.Teq, 0) + ' °C (1 atm 下水蒸气分压按标准态 1 bar 计，开放空气中水蒸气分压低，实际更低温即可失水)', ph: d.ph })) ch = true;
      } else ctx.denied(nm(d.id) + ' 脱水: ΔG(' + fnum(ctx.T, 0) + ' °C) = ' + fnum(th.dG, 1) + ' kJ' + (th.dG >= 0 ? ' > 0，需 T > ' + fnum(th.Teq, 0) + ' °C (按标准态水蒸气分压 1 bar 计；干燥、敞开的环境中水蒸气分压很低，实际更低温度即可风化失水)' : '，但低于起始温度 ' + d.minT + ' °C，速率很低'), d.id);
    });
    return ch;
  }

  // 焰色试验 / 光化学 / 腐蚀 / 覆盖说明
  function rLate(ctx) {
    let ch = false;
    // 焰色试验 (定性)
    if (ctx.setup.flameTest) {
      const present = new Set();
      D.FLAME.forEach(f => { if (ctx.n(f.ion) > 1e-9) present.add(f.ion); });
      Array.from(ctx.ids || []).forEach(id => { const r = REAGBY[id]; if (r && r.diss) D.FLAME.forEach(f => { if (r.diss[f.ion]) present.add(f.ion); }); });
      D.FLAME.forEach(f => {
        if (!present.has(f.ion)) return;
        if (qual(ctx, 'flame' + f.ion, { type: '焰色试验 (定性)', name: f.cn + ' 的焰色: ' + f.name, eqText: D.fmt(f.ion) + ' + 灼烧 → 激发态 → 发射特征谱线 (' + f.nm + ' nm)', why: '火焰热能把金属原子外层电子激发到高能级，回到低能级时发射特征波长的光 (原子发射光谱)。' + (f.note ? f.note + '。' : '') + '焰色取决于元素而非化合价/阴离子，只对 Li、Na、K、Ca、Sr、Ba、Cu 等少数金属显著。定性判断，不改变物料衡算', ph: [{ k: 'flame', text: f.name }] })) { ctx.flameTestInfo = ctx.flameTestInfo || { color: f.color }; ch = ch || false; }
      });
      if (!ctx.flameTestInfo && !present.size) ctx.notes.push('焰色试验: 样品中没有 Li/Na/K/Ca/Sr/Ba/Cu 等有显著焰色的金属离子');
    }
    // 光化学: 卤化银光解
    if (ctx.setup.light) {
      ['AgCl', 'AgBr', 'AgI'].forEach(s => {
        if (ctx.n(s) < 1e-9) return;
        const X2 = { AgCl: 'Cl2', AgBr: 'Br2', AgI: 'I2' }[s]; const th = thermo({ [s]: 2 }, { Ag: 2, [X2]: 1 }, 25);
        qual(ctx, 'photo' + s, { type: '光化学 (定性)', name: nm(s) + ' 见光分解变暗', eqText: '2 ' + F(s) + ' --hν→ 2 Ag + ' + F(X2) + '', why: '光子激发 Ag⁺/X⁻ 晶格使电子转移: Ag⁺ + e⁻ → Ag(0) (形成银原子簇，潜影原理)。热力学上该反应吸热 (ΔH = +' + fnum(th.dH, 0) + ' kJ/2 mol AgX，ΔG>0)，因此不会在黑暗中自发进行，需光能驱动 (光化学)；表面少量析出银使固体由白色变灰紫色/黑色，卤素逸出量极少。定性判断，不改变物料衡算', ph: [{ k: 'color', note: nm(s) + ' 在光照下表面逐渐变灰紫色/黑色(析出细银)' }] });
      });
    }
    // 腐蚀
    if (ctx.setup.corrosion && ctx.aq() && ctx.atm === 'air' && (has(ctx, 'Fe') || has(ctx, 'Zn')) && !ctx._corroded) {
      const pH = ctx.pH(); const Vl = ctx.Vl();
      let ionic = 0; Object.keys(ctx.L).forEach(id => { const sp = SP[id]; if (sp && sp.ph === 'aq' && sp.q && id !== 'H+' && id !== 'OH-') ionic += ctx.L[id] * Math.abs(sp.q) / 2 / Vl; });
      const frac = ctx.setup.corrFrac === undefined || ctx.setup.corrFrac === null || isNaN(ctx.setup.corrFrac) ? 0.1 : Math.max(0, Math.min(1, +ctx.setup.corrFrac));
      if (pH >= 4 && frac > 0) {
        const anodeM = has(ctx, 'Zn') ? 'Zn' : 'Fe';
        const Ecell = 1.229 - 0.05916 * pH - D.METALS[anodeM].E;
        if (ionic < 0.005) ctx.denied('金属腐蚀: 纯水(离子强度 ≈ ' + ionic.toExponential(1) + ' mol/L)导电性差，吸氧腐蚀极慢；加入 NaCl 等电解质会显著加快 (热力学 E°cell = ' + fnum(Ecell, 2) + ' V > 0，但速率受电解质/氧扩散控制)', anodeM);
        else {
          const n = ctx.n(anodeM) * frac; const o2 = n / 2; const before = ctx.n('O2'); ctx.add('O2', o2);
          const hydr = anodeM === 'Fe' ? 'Fe(OH)2' : 'Zn(OH)2';
          const x = ctx.rxn({ type: '金属腐蚀 (吸氧腐蚀)', name: (anodeM === 'Zn' ? '锌的牺牲阳极腐蚀' : '铁的吸氧腐蚀(生锈)') + ' (按设定腐蚀程度 ' + fnum(frac * 100, 0) + '% 计)', react: { [anodeM]: 2, O2: 1, H2O: 2 }, prod: { [hydr]: 2 }, x: n / 2,
            why: '微电池: 阳极 ' + anodeM + ' → ' + D.fmt(D.METALS[anodeM].ion) + ' + ' + D.METALS[anodeM].n + 'e⁻；阴极 O₂ + 2H₂O + 4e⁻ → 4OH⁻ (E = ' + fnum(1.229 - 0.05916 * pH, 3) + ' V，pH=' + fnum(pH, 1) + ')；E°cell = ' + fnum(Ecell, 3) + ' V > 0，自发。电解质(c ≈ ' + fnum(ionic, 3) + ' mol/L)提供离子通路，加快速率。' + (anodeM === 'Zn' ? '锌比铁活泼(E° −0.762 < −0.447 V)，优先溶解，使铁受保护(牺牲阳极的阴极保护)。' : (has(ctx, 'Cu') ? '与更不活泼的铜接触构成电偶，铁作阳极而被加速腐蚀。' : '')) + '腐蚀速率取决于时间/表面积，引擎不模拟时间，按"腐蚀程度"设定的比例计算 (默认 10%)', ph: [{ k: 'color', note: anodeM === 'Fe' ? '铁表面生成红棕色铁锈 (Fe(OH)₂ 经空气氧化为 Fe(OH)₃ / Fe₂O₃·nH₂O)' : '锌表面生成白色 Zn(OH)₂/碱式碳酸锌' }] });
          ctx.add('O2', -Math.min(ctx.n('O2'), Math.max(0, o2 - x) + 0)); if (before > 0) { /* 保持原有 O2 */ }
          if (x > 0) { ctx._corroded = true; ch = true; if (anodeM === 'Zn' && has(ctx, 'Fe')) ctx.notes.push('牺牲阳极保护: 铁未被腐蚀，锌作阳极被消耗 (镀锌铁/船体锌块的原理)。'); }
        }
      }
    }
    // 有机物氧化的覆盖说明 (仅在无反应时用于避免"无数据"误判)
    if (ids(ctx, 'C57H104O6') && ids(ctx, 'H2O')) cover(ctx, 'C57H104O6', 'H2O', '油脂不溶于水，在中性水中水解极慢 (需强碱/强酸或脂肪酶催化)；只是分层混合，无明显化学反应');
    if (ids(ctx, 'PS') && ids(ctx, 'H2O')) cover(ctx, 'PS', 'H2O', '聚苯乙烯疏水、化学惰性，不与水反应也不溶于水');
    if (ids(ctx, '(CH3)3COH')) ['KMnO4', 'K2Cr2O7'].forEach(x => { if (ids(ctx, x)) cover(ctx, '(CH3)3COH', x, '叔醇的羟基碳上没有 α-H，不能经"脱氢/加氧"氧化为醛酮或酸 (E° 判据中不存在 CHOH → C=O 的半反应)；仅在剧烈条件下会发生 C–C 断裂/脱水，引擎不模拟'); });
    if (ids(ctx, 'C3H6O')) ['KMnO4', 'K2Cr2O7'].forEach(x => { if (ids(ctx, x)) cover(ctx, 'C3H6O', x, '丙酮(酮)无醛基 H，温和条件下不被 KMnO₄/K₂Cr₂O₇ 氧化 (强烈条件下才发生 C–C 断裂，引擎不模拟)'); });
    if (ids(ctx, 'C6H6')) ['KMnO4', 'K2Cr2O7'].forEach(x => { if (ids(ctx, x)) cover(ctx, 'C6H6', x, '苯环(芳香稳定化)且无侧链 C–H，不被 KMnO₄/K₂Cr₂O₇ 氧化'); });
    if (ids(ctx, 'C12H22O11')) ['Tollens', 'Fehling'].forEach(x => { if (ids(ctx, x)) cover(ctx, 'C12H22O11', x, '蔗糖是非还原糖 (两个异头碳都参与成苷键，无游离半缩醛基)，不能还原 Tollens/斐林试剂 (需先酸水解为葡萄糖+果糖)'); });
    if (ids(ctx, 'C3H6O')) ['Tollens', 'Fehling'].forEach(x => { if (ids(ctx, x)) cover(ctx, 'C3H6O', x, '丙酮是酮，没有醛基 C–H，不能被弱氧化剂 [Ag(NH₃)₂]⁺ / Cu(II)-酒石酸盐氧化 (这是区分醛与酮的依据)'); });
    if (ids(ctx, 'C7H6O') && ids(ctx, 'Fehling')) cover(ctx, 'C7H6O', 'Fehling', '芳香醛(苯甲醛)不被斐林试剂氧化 (可被 Tollens 氧化)');
    ['Tollens', 'Fehling'].forEach(x => { if (ids(ctx, x)) ['C2H5OH', 'CH3OH', '(CH3)2CHOH', '(CH3)3COH'].forEach(o => { if (ids(ctx, o)) cover(ctx, o, x, '醇没有醛基，不能还原 Tollens/斐林试剂 (弱氧化剂不氧化醇)'); }); });
    if (ids(ctx, 'C6H5O-')) { /* no-op */ }
    return ch;
  }

  // 注册
  RU.HOOKS.early.push(rAlkoxideHyd);
  RU.HOOKS.mid.push(rHalide, rWilliamson, rAlkene, rCarbonyl, rLipidAmidePoly, rInorg);
  RU.HOOKS.late.push(rHydrate, rLate);

  // Fischer 酯化变体 (扩展 ESTERS: acid[1] 为占位)
  RU.ESTERS.push(
    { acid: ['CH3COOH', 'CH3COOH(aq)'], alc: 'C5H12O', ester: 'C7H14O2', K: 4.0, name: '乙酸 + 异戊醇 ⇌ 乙酸异戊酯(香蕉油) + 水 (Fischer 酯化)', smell: '香蕉味(乙酸异戊酯)' },
    { acid: ['C7H6O3', '_x1'], alc: 'CH3OH', ester: 'C8H8O3', K: 3.0, name: '水杨酸 + 甲醇 ⇌ 水杨酸甲酯(冬青油) + 水 (Fischer 酯化)', smell: '冬青油/药膏气味(水杨酸甲酯)' },
    { acid: ['C7H6O2', '_x2'], alc: 'C2H5OH', ester: 'C9H10O2', K: 3.5, name: '苯甲酸 + 乙醇 ⇌ 苯甲酸乙酯 + 水 (Fischer 酯化)', smell: '果香/花香(苯甲酸乙酯)' }
  );
  // 酯化的酸催化: 对甲苯磺酸 (PTSA) 催化
  // 非 (已有逻辑) 强酸判断补充: 在 ctx.hasCat 内, 'PTSA' 视作强酸催化
  const origHasCat = Object.getPrototypeOf(new B.Ctx({})).hasCat;
  B.Ctx.prototype.hasCat = function (c) { if ((c === 'H2SO4' || c === 'H3PO4') && this.catalyst === 'PTSA') return true; return origHasCat.call(this, c); };

  // 硝化(HNO3 + 有机物)继续拦截: 把新增有机物并入禁止列表
  ['C6H6', 'C6H7N', 'C7H6O', 'C8H8', 'C57H104O6', '(C2H5)2O', '(CH3)2CHOH', '(CH3)3COH', 'C5H12O', 'CH3CHO', 'C6H10', 'C2H5Br', '(CH3)2CHBr', '(CH3)3CCl', 'PS', 'H2N(CH2)6NH2', 'ClCO(CH2)4COCl', 'C2H5ONa'].forEach(id => { if (B.ORG_NITR.indexOf(id) < 0) B.ORG_NITR.push(id); });

  RU.ext2 = { rHalide, rAlkene, rCarbonyl, rLipidAmidePoly, rInorg, rHydrate, rLate, HAL, ALK, HYD, thermo, liqEq };
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
})(typeof window !== 'undefined' ? window : globalThis);
