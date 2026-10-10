/* 虚拟化学实验室 —— 数据库
 * 热力学数据: 25 °C 标准生成焓 ΔfH° (kJ/mol), 标准熵 S° (J/mol/K), 标准电极电势 E° (V)
 * 数值来自常见教材/CRC/NIST 常用值，部分有机物与配合物为近似值（标注 approx）。
 */
(function (g) {
  'use strict';
  const AMASS = { H: 1.008, Li: 6.94, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Na: 22.990, Mg: 24.305, Al: 26.982, Si: 28.086, P: 30.974, S: 32.06, Cl: 35.45, K: 39.098, Ca: 40.078, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38, Br: 79.904, Ag: 107.868, I: 126.904, Ba: 137.327, Pb: 207.2 };

  // ---------- 化学式解析 ----------
  function stripId(id) {
    return id.replace(/\((aq|g|s|l)\)$/, '').replace(/(\^\d+)?[+-]$/, '');
  }
  function chargeOf(id) {
    const m = id.replace(/\((aq|g|s|l)\)$/, '').match(/^(.*?)(?:\^(\d+))?([+-])$/);
    if (!m) return 0;
    return (m[3] === '+' ? 1 : -1) * (m[2] ? parseInt(m[2], 10) : 1);
  }
  function parseComp(formula) {
    let f = stripId(formula).replace(/\((aq|g|s|l)\)$/, '');
    const parts = f.split('·');
    const total = {};
    parts.forEach((p, idx) => {
      let mult = 1;
      const mm = p.match(/^(\d+)(.*)$/);
      if (idx > 0 && mm) { mult = parseInt(mm[1], 10); p = mm[2]; }
      let pos = 0;
      function parseGroup() {
        const comp = {};
        while (pos < p.length) {
          const ch = p[pos];
          if (ch === '(') {
            pos++; const inner = parseGroup();
            let num = ''; while (pos < p.length && /\d/.test(p[pos])) num += p[pos++];
            const k = num ? parseInt(num, 10) : 1;
            for (const e in inner) comp[e] = (comp[e] || 0) + inner[e] * k;
          } else if (ch === ')') { pos++; return comp; }
          else if (/[A-Z]/.test(ch)) {
            let el = ch; pos++;
            while (pos < p.length && /[a-z]/.test(p[pos])) el += p[pos++];
            let num = ''; while (pos < p.length && /\d/.test(p[pos])) num += p[pos++];
            comp[el] = (comp[el] || 0) + (num ? parseInt(num, 10) : 1);
          } else pos++;
        }
        return comp;
      }
      const c = parseGroup();
      for (const e in c) total[e] = (total[e] || 0) + c[e] * mult;
    });
    return total;
  }
  function molarMass(id) {
    const c = parseComp(id); let m = 0;
    for (const e in c) { if (!(e in AMASS)) throw new Error('unknown element ' + e + ' in ' + id); m += AMASS[e] * c[e]; }
    return m;
  }
  // 显示用 HTML 化学式
  function fmt(id) {
    let s = id;
    let state = '';
    const sm = s.match(/\((aq|g|s|l)\)$/);
    if (sm) { state = sm[1]; s = s.slice(0, -sm[0].length); }
    let ch = '';
    const m = s.match(/^(.*?)(?:\^(\d+))?([+-])$/);
    if (m) { s = m[1]; ch = (m[2] || '') + m[3]; }
    // 下标
    s = s.replace(/·(\d+)/g, '·$1').replace(/([A-Za-z)])(\d+)/g, '$1<sub>$2</sub>');
    s = s.replace(/·(\d+)/g, '·$1');
    let out = s + (ch ? '<sup>' + ch.replace('-', '−') + '</sup>' : '');
    if (state) out += '<span class="st">(' + state + ')</span>';
    return out;
  }
  function fmtPlain(id) { return id.replace(/\^/g, '').replace(/\((aq|g|s|l)\)/, '($1)'); }

  // ---------- 物种库 ----------
  const SP = {};
  function S(id, cn, ph, H, o) {
    o = o || {};
    SP[id] = Object.assign({ id, cn, ph, H, q: chargeOf(id) }, o);
    try { SP[id].M = molarMass(id); } catch (e) { SP[id].M = null; }
  }
  // 水与气体
  S('H2O', '水', 'l', -285.83, { S0: 69.9, cp: 4.184 });
  S('H2O(g)', '水蒸气', 'g', -241.83, { S0: 188.8 });
  S('H+', '氢离子', 'aq', 0); S('OH-', '氢氧根', 'aq', -230.0);
  S('CO2', '二氧化碳', 'g', -393.5, { S0: 213.8 }); S('H2', '氢气', 'g', 0, { S0: 130.7 }); S('O2', '氧气', 'g', 0, { S0: 205.2 });
  S('NH3', '氨气', 'g', -45.9, { S0: 192.8 }); S('SO2', '二氧化硫', 'g', -296.8, { S0: 248.2 }); S('H2S', '硫化氢', 'g', -20.6);
  S('NO', '一氧化氮', 'g', 91.3); S('NO2', '二氧化氮', 'g', 33.2); S('Cl2', '氯气', 'g', 0); S('HCl(g)', '氯化氢气体', 'g', -92.3);
  S('C2H4', '乙烯', 'g', 52.4);
  // 阳离子
  const cat = [['Na+', '钠离子', -240.1], ['K+', '钾离子', -252.4], ['Li+', '锂离子', -278.5], ['NH4+', '铵离子', -132.5], ['Mg^2+', '镁离子', -466.9], ['Ca^2+', '钙离子', -542.8], ['Ba^2+', '钡离子', -537.6], ['Al^3+', '铝离子', -531.0], ['Fe^2+', '亚铁离子', -89.1], ['Fe^3+', '铁离子', -48.5], ['Cu^2+', '铜离子', 64.8], ['Zn^2+', '锌离子', -153.4], ['Ag+', '银离子', 105.6], ['Pb^2+', '铅离子', -1.7], ['Mn^2+', '锰离子', -220.8], ['Cr^3+', '铬离子', -256.0, { approx: true }]];
  cat.forEach(c => S(c[0], c[1], 'aq', c[2], c[3] || {}));
  S('FeOH^2+', '羟基铁离子', 'aq', null); S('CuOH+', '羟基铜离子', 'aq', null); S('ZnOH+', '羟基锌离子', 'aq', null); S('FeOH+', '羟基亚铁离子', 'aq', null); S('PbOH+', '羟基铅离子', 'aq', null); S('AlOH^2+', '羟基铝离子', 'aq', null);
  // 阴离子
  const an = [['Cl-', '氯离子', -167.2], ['Br-', '溴离子', -121.6], ['I-', '碘离子', -55.2], ['NO3-', '硝酸根', -207.4], ['SO4^2-', '硫酸根', -909.3], ['HSO4-', '硫酸氢根', -887.3], ['CO3^2-', '碳酸根', -677.1], ['HCO3-', '碳酸氢根', -692.0], ['PO4^3-', '磷酸根', -1277.4], ['HPO4^2-', '磷酸氢根', -1292.1], ['H2PO4-', '磷酸二氢根', -1296.3], ['CH3COO-', '乙酸根', -486.0], ['SCN-', '硫氰酸根', 76.4], ['SO3^2-', '亚硫酸根', -635.5], ['HSO3-', '亚硫酸氢根', -626.2], ['S^2-', '硫离子', 33.1], ['HS-', '硫氢根', -17.6], ['CrO4^2-', '铬酸根', -881.2], ['Cr2O7^2-', '重铬酸根', -1490.3], ['MnO4-', '高锰酸根', -541.4], ['HCOO-', '甲酸根', -425.6], ['C2O4^2-', '草酸根', -825.1], ['HC2O4-', '草酸氢根', -818.4], ['I3-', '三碘离子', -51.5]];
  an.forEach(c => S(c[0], c[1], 'aq', c[2]));
  // 弱酸/碱 水溶液分子态
  S('NH3(aq)', '氨(水溶液)', 'aq', -80.3); S('CH3COOH(aq)', '乙酸(水溶液)', 'aq', -485.8); S('CO2(aq)', '二氧化碳(溶解)', 'aq', -413.8);
  S('H2S(aq)', '氢硫酸', 'aq', -39.7); S('SO2(aq)', '二氧化硫(溶解)', 'aq', -322.5); S('H3PO4(aq)', '磷酸(水溶液)', 'aq', -1288.3);
  S('HCOOH(aq)', '甲酸(水溶液)', 'aq', -425.4); S('H2C2O4(aq)', '草酸(水溶液)', 'aq', -818.0, { approx: true }); S('H2O2(aq)', '过氧化氢(水溶液)', 'aq', -191.2, { S0: 143.9 });
  S('C6H8O7(aq)', '柠檬酸(水溶液)', 'aq', -1543.8, { approx: true });
  S('C6H7O7-', '柠檬酸一氢根', 'aq', null); S('C6H6O7^2-', '柠檬酸二氢根', 'aq', null); S('C6H5O7^3-', '柠檬酸根', 'aq', null);
  // 配合物
  S('Cu(NH3)4^2+', '四氨合铜(II)', 'aq', -348.5, { approx: true }); S('Ag(NH3)2+', '二氨合银(I)', 'aq', -111.3);
  S('Zn(NH3)4^2+', '四氨合锌(II)', 'aq', -533.5, { approx: true }); S('Al(OH)4-', '四羟基合铝酸根', 'aq', -1502.5, { approx: true });
  S('Zn(OH)4^2-', '四羟基合锌酸根', 'aq', null); S('FeSCN^2+', '硫氰合铁(III)', 'aq', null);
  // 沉淀/固体
  const sol = [
    ['NaCl', '氯化钠', -411.2, '#fafafa', 72.1], ['KCl', '氯化钾', -436.5, '#fafafa', 82.6], ['NaNO3', '硝酸钠', -467.9, '#f5f5f5'], ['KNO3', '硝酸钾', -494.6, '#f5f5f5'],
    ['AgNO3', '硝酸银', -124.4, '#f0f0f0'], ['BaCl2', '氯化钡', -858.6, '#f5f5f5'], ['CuSO4', '硫酸铜(无水)', -771.4, '#e9f0ec', 109.2], ['CuSO4·5H2O', '五水硫酸铜', -2279.7, '#2f7fd6', 300.4],
    ['ZnSO4', '硫酸锌', -982.8, '#f7f7f7'], ['FeSO4', '硫酸亚铁', -928.4, '#c9dec4'], ['FeCl3', '氯化铁', -399.5, '#9a5a2a'], ['Na2SO4', '硫酸钠', -1387.1, '#f8f8f8'], ['K2SO4', '硫酸钾', -1437.8, '#f8f8f8'],
    ['MgSO4', '硫酸镁', -1284.9, '#f8f8f8'], ['CaCl2', '氯化钙', -795.8, '#f4f4f4'], ['MgCl2', '氯化镁', -641.3, '#f4f4f4'], ['ZnCl2', '氯化锌', -415.1, '#f4f4f4'], ['CuCl2', '氯化铜', -220.1, '#8a6a2a'],
    ['Na2CO3', '碳酸钠', -1130.7, '#fafafa', 135.0], ['NaHCO3', '碳酸氢钠', -950.8, '#fafafa', 101.7], ['Pb(NO3)2', '硝酸铅', -451.9, '#f4f4f4'], ['KI', '碘化钾', -327.9, '#f8f8f8'], ['KBr', '溴化钾', -393.8, '#f8f8f8'],
    ['NH4Cl', '氯化铵', -314.4, '#f8f8f8'], ['(NH4)2SO4', '硫酸铵', -1180.9, '#f8f8f8'], ['KSCN', '硫氰酸钾', -200.2, '#f8f8f8'], ['CH3COONa', '乙酸钠', -708.8, '#f8f8f8'],
    ['Al2(SO4)3', '硫酸铝', -3440.8, '#f8f8f8'], ['Na2SO3', '亚硫酸钠', -1100.8, '#f8f8f8'], ['Na2S', '硫化钠', -364.8, '#e8d9b0'], ['K2CrO4', '铬酸钾', -1403.7, '#f0d41a'], ['K2Cr2O7', '重铬酸钾', -2061.5, '#e8761b'],
    ['KMnO4', '高锰酸钾', -837.2, '#3a1048', 171.7], ['NaOH', '氢氧化钠', -425.6, '#f8f8f8'], ['KOH', '氢氧化钾', -424.8, '#f8f8f8'],
    ['Ca(OH)2', '氢氧化钙', -985.2, '#fafafa', 83.4], ['Mg(OH)2', '氢氧化镁', -924.5, '#fafafa', 63.2], ['CaCO3', '碳酸钙', -1207.6, '#fbfbfb', 92.9], ['CaO', '氧化钙', -634.9, '#f0f0f0', 38.1],
    ['MgO', '氧化镁', -601.6, '#f6f6f6', 26.9], ['CuO', '氧化铜', -157.3, '#1c1c1c', 42.6], ['Fe2O3', '氧化铁', -824.2, '#8b3a1d'], ['Al2O3', '氧化铝', -1675.7, '#f4f4f4'], ['MnO2', '二氧化锰', -520.0, '#2b2218', 53.1],
    ['K2CO3', '碳酸钾', -1151.0, '#f8f8f8'], ['Mn2O3', '三氧化二锰', -959.0, '#3b2a1a'],
    // 沉淀产物
    ['AgCl', '氯化银', -127.0, '#f4f4f0'], ['AgBr', '溴化银', -100.4, '#efe9b0'], ['AgI', '碘化银', -61.8, '#f0dd4a'], ['Ag2CO3', '碳酸银', -505.8, '#efe6a8'], ['Ag2SO4', '硫酸银', -715.9, '#f4f4f4'],
    ['Ag2CrO4', '铬酸银', -731.7, '#a8322d'], ['Ag2S', '硫化银', -32.6, '#1a1a1a'], ['Ag2O', '氧化银', -31.0, '#5a3d28', 121.3],
    ['BaSO4', '硫酸钡', -1473.2, '#fbfbfb'], ['BaCO3', '碳酸钡', -1213.0, '#f6f6f6'], ['BaCrO4', '铬酸钡', -1446.0, '#f1e04a'],
    ['CaSO4', '硫酸钙', -1434.5, '#f6f6f6'], ['MgCO3', '碳酸镁', -1095.8, '#f6f6f6'],
    ['PbCl2', '氯化铅', -359.4, '#f2f2f2'], ['PbI2', '碘化铅', -175.5, '#f4c20d'], ['PbSO4', '硫酸铅', -920.0, '#f6f6f6'], ['PbCO3', '碳酸铅', -699.1, '#f6f6f6'], ['Pb(OH)2', '氢氧化铅', -515.9, '#f2f2f2'], ['PbS', '硫化铅', -100.4, '#222'], ['PbCrO4', '铬酸铅', -930.9, '#f0cf00'],
    ['CuS', '硫化铜', -53.1, '#1e1e1e'], ['Cu(OH)2', '氢氧化铜', -449.8, '#5aa9e6', 108.4], ['CuCO3', '碱式碳酸铜(以CuCO3计)', -595.0, '#4aa88a'], ['CuI', '碘化亚铜', -67.8, '#e8dcc8'],
    ['Zn(OH)2', '氢氧化锌', -641.9, '#f4f4f4'], ['ZnS', '硫化锌', -206.0, '#f4f4ee'], ['ZnCO3', '碳酸锌', -812.8, '#f4f4f4'], ['ZnO', '氧化锌', -350.5, '#f5f5f5'],
    ['Fe(OH)2', '氢氧化亚铁', -569.0, '#bfd8c0'], ['Fe(OH)3', '氢氧化铁', -823.0, '#8a3b1a'], ['FeS', '硫化亚铁', -100.0, '#2a2a2a'], ['FeCO3', '碳酸亚铁', -740.6, '#d8d8cc'],
    ['Al(OH)3', '氢氧化铝', -1277.0, '#f4f4f4'], ['Mn(OH)2', '氢氧化锰(II)', -695.4, '#eee'], ['Cr(OH)3', '氢氧化铬(III)', -1010.0, '#6a8f7a', null, true],
    // 单质
    ['Na', '钠', 0, '#c9ccd2', 51.3], ['K', '钾', 0, '#c9ccd2'], ['Ca', '钙', 0, '#bdbdbd'], ['Mg', '镁', 0, '#d0d3d8', 32.7], ['Al', '铝', 0, '#c4c8ce', 28.3], ['Zn', '锌', 0, '#a9b0b8', 41.6], ['Fe', '铁', 0, '#6f7378', 27.3],
    ['Cu', '铜', 0, '#b8643c', 33.2], ['Ag', '银', 0, '#d8dadd', 42.6], ['Pb', '铅', 0, '#6a7280', 64.8], ['S', '硫', 0, '#e8d43a', 32.1], ['C', '碳(石墨)', 0, '#262626', 5.7], ['I2', '碘', 0, '#4b2a5e', 116.1],
  ];
  sol.forEach(r => { S(r[0], r[1], 's', r[2], { col: r[3], S0: r[4] || null, approx: !!r[5] }); });
  // 有机物
  S('C2H5OH', '乙醇', 'l', -277.6, { S0: 160.7, cp: 2.44, comp: 'C2H6O' }); S('CH3OH', '甲醇', 'l', -239.2, { cp: 2.53 }); S('C3H6O', '丙酮', 'l', -248.4, { cp: 2.17 });
  S('C6H14', '正己烷', 'l', -198.7, { cp: 2.26 }); S('C7H8', '甲苯', 'l', 12.2, { cp: 1.7 });
  S('C6H6O', '苯酚', 's', -165.1); S('C7H6O2', '苯甲酸', 's', -385.2); S('C7H6O3', '水杨酸', 's', -592.1); S('C9H8O4', '乙酰水杨酸(阿司匹林)', 's', -758.2);
  S('C4H6O3', '乙酸酐', 'l', -625.0, { cp: 1.8 }); S('CH3COOH', '乙酸', 'l', -484.0, { cp: 2.05 }); S('CH3COOC2H5', '乙酸乙酯', 'l', -479.3, { cp: 1.9 }); S('CH3COOCH3', '乙酸甲酯', 'l', -445.9, { cp: 1.9 });
  S('HCOOH', '甲酸', 'l', -425.0); S('H2C2O4', '草酸', 's', -821.7); S('C6H8O7', '柠檬酸', 's', -1543.8);
  S('C6H12O6', '葡萄糖', 's', -1273.3); S('C12H22O11', '蔗糖', 's', -2226.1); S('C3H8O3', '甘油', 'l', -668.5, { cp: 2.43 }); S('CH4N2O', '尿素', 's', -333.1);
  S('H2O2', '过氧化氢(纯)', 'l', -187.8);
  S('Cu2S', '硫化亚铜', 's', -79.5, { col: '#2a2a2a' });
  // 有机离子 (近似: 由弱酸与OH-中和热 ≈ -55 kJ/mol 推算)
  // H(anion) = H(acid) + H(OH-)... 推导: acid + OH- -> anion + H2O, ΔH=dHneut  =>  H(anion)=H(acid)+(-230.0)+dHneut-(-285.83)
  function anion2(id, cn, acidH, dHneut) { S(id, cn, 'aq', acidH - 230.0 + dHneut + 285.83, { approx: true }); }
  anion2('C7H5O3-', '水杨酸根', -592.1, -45); anion2('C7H5O2-', '苯甲酸根', -385.2, -45); anion2('C9H7O4-', '乙酰水杨酸根', -758.2, -45); anion2('C6H5O-', '苯酚根', -165.1, -35);
  // 水溶液形态的校正：固体弱酸溶解的热效应较小，近似按固体计

  // ---------- 弱酸体系 (用于 pH 求解与质子转移) ----------
  // forms: 由最质子化到最去质子化；pKa[i] 对应 forms[i]->forms[i+1]；w[i]: 酸侧水分子数 (a + w H2O = b + H+)
  const SYSTEMS = [
    { name: '碳酸', forms: ['CO2(aq)', 'HCO3-', 'CO3^2-'], pKa: [6.35, 10.33], w: [1, 0], gas: [true, false] },
    { name: '乙酸', forms: ['CH3COOH(aq)', 'CH3COO-'], pKa: [4.76], w: [0] },
    { name: '铵', forms: ['NH4+', 'NH3(aq)'], pKa: [9.25], w: [0] },
    { name: '磷酸', forms: ['H3PO4(aq)', 'H2PO4-', 'HPO4^2-', 'PO4^3-'], pKa: [2.15, 7.20, 12.35], w: [0, 0, 0] },
    { name: '硫酸', forms: ['HSO4-', 'SO4^2-'], pKa: [1.99], w: [0] },
    { name: '甲酸', forms: ['HCOOH(aq)', 'HCOO-'], pKa: [3.75], w: [0] },
    { name: '草酸', forms: ['H2C2O4(aq)', 'HC2O4-', 'C2O4^2-'], pKa: [1.25, 4.27], w: [0, 0] },
    { name: '柠檬酸', forms: ['C6H8O7(aq)', 'C6H7O7-', 'C6H6O7^2-', 'C6H5O7^3-'], pKa: [3.13, 4.76, 6.40], w: [0, 0, 0] },
    { name: '水杨酸', forms: ['C7H6O3', 'C7H5O3-'], pKa: [2.97], w: [0], limited: true },
    { name: '苯甲酸', forms: ['C7H6O2', 'C7H5O2-'], pKa: [4.20], w: [0], limited: true },
    { name: '乙酰水杨酸', forms: ['C9H8O4', 'C9H7O4-'], pKa: [3.5], w: [0], limited: true },
    { name: '苯酚', forms: ['C6H6O', 'C6H5O-'], pKa: [9.99], w: [0], limited: true },
    { name: '氢硫酸', forms: ['H2S(aq)', 'HS-', 'S^2-'], pKa: [7.0, 12.9], w: [0, 0], gas: [true, false] },
    { name: '亚硫酸', forms: ['SO2(aq)', 'HSO3-', 'SO3^2-'], pKa: [1.85, 7.20], w: [1, 0], gas: [true, false] },
    { name: 'Fe³⁺水解', forms: ['Fe^3+', 'FeOH^2+'], pKa: [2.2], w: [1], hyd: true },
    { name: 'Cu²⁺水解', forms: ['Cu^2+', 'CuOH+'], pKa: [8.0], w: [1], hyd: true },
    { name: 'Zn²⁺水解', forms: ['Zn^2+', 'ZnOH+'], pKa: [8.96], w: [1], hyd: true },
    { name: 'Fe²⁺水解', forms: ['Fe^2+', 'FeOH+'], pKa: [9.5], w: [1], hyd: true },
    { name: 'Pb²⁺水解', forms: ['Pb^2+', 'PbOH+'], pKa: [7.8], w: [1], hyd: true },
    { name: 'Al³⁺水解', forms: ['Al^3+', 'AlOH^2+'], pKa: [5.0], w: [1], hyd: true },
  ];
  // 溶解度限制 (g/100 g 水) —— 供弱酸固体在 pH 求解中使用
  const SOLIDLIMIT = { C7H6O3: 0.2, C7H6O2: 0.34, C9H8O4: 0.33, C6H6O: 8.3 };

  // ---------- 难溶盐 (Ksp 25 °C) ----------
  // s: 固体物种; c: 阳离子; a: 阴离子; nc, na: 化学计量数; ksp
  const PRECIP = [];
  function P(s, c, nc, a, na, ksp, o) { PRECIP.push(Object.assign({ s, c, nc, a, na, ksp }, o || {})); }
  P('AgCl', 'Ag+', 1, 'Cl-', 1, 1.77e-10); P('AgBr', 'Ag+', 1, 'Br-', 1, 5.35e-13); P('AgI', 'Ag+', 1, 'I-', 1, 8.5e-17);
  P('Ag2CO3', 'Ag+', 2, 'CO3^2-', 1, 8.5e-12, { ad: { n: 2, p: { 'CO2(aq)': 1, 'H2O': 1 } } }); P('Ag2SO4', 'Ag+', 2, 'SO4^2-', 1, 1.2e-5, { sat: true });
  P('Ag2CrO4', 'Ag+', 2, 'CrO4^2-', 1, 1.1e-12); P('Ag2S', 'Ag+', 2, 'S^2-', 1, 6e-50);
  P('BaSO4', 'Ba^2+', 1, 'SO4^2-', 1, 1.1e-10); P('BaCO3', 'Ba^2+', 1, 'CO3^2-', 1, 2.6e-9, { ad: { n: 2, p: { 'CO2(aq)': 1, 'H2O': 1 } } }); P('BaCrO4', 'Ba^2+', 1, 'CrO4^2-', 1, 1.2e-10);
  P('CaCO3', 'Ca^2+', 1, 'CO3^2-', 1, 3.4e-9, { ad: { n: 2, p: { 'CO2(aq)': 1, 'H2O': 1 } } }); P('CaSO4', 'Ca^2+', 1, 'SO4^2-', 1, 4.9e-5, { sat: true });
  P('Ca(OH)2', 'Ca^2+', 1, 'OH-', 2, 5.5e-6, { sat: true, ad: { n: 2, p: { 'H2O': 2 } } });
  P('MgCO3', 'Mg^2+', 1, 'CO3^2-', 1, 6.8e-6, { ad: { n: 2, p: { 'CO2(aq)': 1, 'H2O': 1 } } }); P('Mg(OH)2', 'Mg^2+', 1, 'OH-', 2, 5.6e-12, { sat: true, ad: { n: 2, p: { 'H2O': 2 } } });
  P('PbCl2', 'Pb^2+', 1, 'Cl-', 2, 1.7e-5, { sat: true }); P('PbI2', 'Pb^2+', 1, 'I-', 2, 9.8e-9); P('PbSO4', 'Pb^2+', 1, 'SO4^2-', 1, 2.5e-8);
  P('PbCO3', 'Pb^2+', 1, 'CO3^2-', 1, 7.4e-14, { ad: { n: 2, p: { 'CO2(aq)': 1, 'H2O': 1 } } }); P('Pb(OH)2', 'Pb^2+', 1, 'OH-', 2, 1.4e-20, { ad: { n: 2, p: { 'H2O': 2 } } });
  P('PbS', 'Pb^2+', 1, 'S^2-', 1, 8e-28); P('PbCrO4', 'Pb^2+', 1, 'CrO4^2-', 1, 2.8e-13);
  P('CuS', 'Cu^2+', 1, 'S^2-', 1, 6e-36); P('Cu(OH)2', 'Cu^2+', 1, 'OH-', 2, 2.2e-20, { ad: { n: 2, p: { 'H2O': 2 } } }); P('CuCO3', 'Cu^2+', 1, 'CO3^2-', 1, 1.4e-10, { ad: { n: 2, p: { 'CO2(aq)': 1, 'H2O': 1 } } });
  P('Zn(OH)2', 'Zn^2+', 1, 'OH-', 2, 3e-17, { ad: { n: 2, p: { 'H2O': 2 } } }); P('ZnS', 'Zn^2+', 1, 'S^2-', 1, 2e-25, { ad: { n: 2, p: { 'H2S(aq)': 1 } } }); P('ZnCO3', 'Zn^2+', 1, 'CO3^2-', 1, 1.5e-10, { ad: { n: 2, p: { 'CO2(aq)': 1, 'H2O': 1 } } });
  P('Fe(OH)2', 'Fe^2+', 1, 'OH-', 2, 4.9e-17, { ad: { n: 2, p: { 'H2O': 2 } } }); P('Fe(OH)3', 'Fe^3+', 1, 'OH-', 3, 2.8e-39, { ad: { n: 3, p: { 'H2O': 3 } } });
  P('FeS', 'Fe^2+', 1, 'S^2-', 1, 6e-18, { ad: { n: 2, p: { 'H2S(aq)': 1 } } }); P('FeCO3', 'Fe^2+', 1, 'CO3^2-', 1, 3.1e-11, { ad: { n: 2, p: { 'CO2(aq)': 1, 'H2O': 1 } } });
  P('Al(OH)3', 'Al^3+', 1, 'OH-', 3, 1.3e-33, { ad: { n: 3, p: { 'H2O': 3 } } }); P('Mn(OH)2', 'Mn^2+', 1, 'OH-', 2, 1.9e-13, { ad: { n: 2, p: { 'H2O': 2 } } });
  P('Cr(OH)3', 'Cr^3+', 1, 'OH-', 3, 6.3e-31, { ad: { n: 3, p: { 'H2O': 3 } } });
  // 不溶于酸的 PRECIP: AgX, 硫酸盐, CuS, PbS, Ag2S, 铬酸盐 (除强酸) 无 ad

  // 其他固体的酸溶 (氧化物等)
  const ACIDSOL = {
    CuO: { c: 'Cu^2+', nc: 1, n: 2, p: { 'H2O': 1 }, gate: 'any' },
    MgO: { c: 'Mg^2+', nc: 1, n: 2, p: { 'H2O': 1 } },
    ZnO: { c: 'Zn^2+', nc: 1, n: 2, p: { 'H2O': 1 } },
    Fe2O3: { c: 'Fe^3+', nc: 2, n: 6, p: { 'H2O': 3 }, slow: true },
    Al2O3: { c: 'Al^3+', nc: 2, n: 6, p: { 'H2O': 3 }, slow: true, hot: 80 },
    Ag2O: { c: 'Ag+', nc: 2, n: 2, p: { 'H2O': 1 } },
  };

  // ---------- 额外平衡 (配合物、两性、碘) ----------
  // K 为浓度平衡常数 (固体/纯液体活度=1)
  const EQ = [
    { id: 'FeSCN', name: '硫氰合铁(III)络合', react: { 'Fe^3+': 1, 'SCN-': 1 }, prod: { 'FeSCN^2+': 1 }, K: 890, type: '配位' },
    { id: 'AgClNH3', name: 'AgCl 溶于氨水', react: { AgCl: 1, 'NH3(aq)': 2 }, prod: { 'Ag(NH3)2+': 1, 'Cl-': 1 }, K: 2.0e-3, type: '配位溶解' },
    { id: 'AgBrNH3', name: 'AgBr 溶于氨水', react: { AgBr: 1, 'NH3(aq)': 2 }, prod: { 'Ag(NH3)2+': 1, 'Br-': 1 }, K: 5.9e-6, type: '配位溶解' },
    { id: 'AgNH3', name: '银氨配合物形成', react: { 'Ag+': 1, 'NH3(aq)': 2 }, prod: { 'Ag(NH3)2+': 1 }, K: 1.1e7, type: '配位' },
    { id: 'CuNH3', name: '铜氨配合物形成', react: { 'Cu^2+': 1, 'NH3(aq)': 4 }, prod: { 'Cu(NH3)4^2+': 1 }, K: 2.1e13, type: '配位' },
    { id: 'ZnNH3', name: '锌氨配合物形成', react: { 'Zn^2+': 1, 'NH3(aq)': 4 }, prod: { 'Zn(NH3)4^2+': 1 }, K: 2.9e9, type: '配位' },
    { id: 'AlOH4', name: 'Al(OH)₃ 溶于过量强碱', react: { 'Al(OH)3': 1, 'OH-': 1 }, prod: { 'Al(OH)4-': 1 }, K: 40, type: '两性溶解' },
    { id: 'ZnOH4', name: 'Zn(OH)₂ 溶于过量强碱', react: { 'Zn(OH)2': 1, 'OH-': 2 }, prod: { 'Zn(OH)4^2-': 1 }, K: 10, type: '两性溶解' },
    { id: 'I3', name: '碘溶于碘化物 (I₃⁻)', react: { I2: 1, 'I-': 1 }, prod: { 'I3-': 1 }, K: 0.9, type: '配位溶解' },
  ];
  // NH3·H2O 作碱沉淀氢氧化物: M^z+ + z NH3 + z H2O <-> M(OH)z + z NH4+ , K = Kb^z/Ksp
  const KB_NH3 = 1.76e-5;
  [['Cu^2+', 'Cu(OH)2', 2], ['Zn^2+', 'Zn(OH)2', 2], ['Fe^3+', 'Fe(OH)3', 3], ['Fe^2+', 'Fe(OH)2', 2], ['Al^3+', 'Al(OH)3', 3], ['Mn^2+', 'Mn(OH)2', 2], ['Mg^2+', 'Mg(OH)2', 2], ['Pb^2+', 'Pb(OH)2', 2], ['Cr^3+', 'Cr(OH)3', 3]].forEach(r => {
    const e = PRECIP.find(p => p.s === r[1]);
    EQ.push({ id: 'NH3ppt-' + r[1], name: '氨水使 ' + r[0].replace('^', '') + ' 生成 ' + r[1], react: { [r[0]]: 1, 'NH3(aq)': r[2], 'H2O': r[2] }, prod: { [r[1]]: 1, 'NH4+': r[2] }, K: Math.pow(KB_NH3, r[2]) / e.ksp, type: '沉淀(弱碱)' });
  });
  EQ.push({ id: 'AgOxNH3', name: '氨水使 Ag⁺ 生成 Ag₂O', react: { 'Ag+': 2, 'NH3(aq)': 2, 'H2O': 1 }, prod: { Ag2O: 1, 'NH4+': 2 }, K: Math.pow(KB_NH3, 2) / 2.0e-8, type: '沉淀(弱碱)' });
  // 注: Ag₂O + H₂O ⇌ 2Ag⁺ + 2OH⁻, K = [Ag⁺]²[OH⁻]² ≈ 2×10⁻⁸ (近似)

  // ---------- 半反应 (还原式: lhs + n e- = rhs), E° (V vs SHE, 25 °C) ----------
  const HALF = [];
  function Hf(id, lhs, rhs, n, E0, o) { HALF.push(Object.assign({ id, lhs, rhs, n, E0 }, o || {})); }
  Hf('MnO4/Mn2', { 'MnO4-': 1, 'H+': 8 }, { 'Mn^2+': 1, 'H2O': 4 }, 5, 1.507, { strong: true, condO: c => c.pH < 3 });
  Hf('MnO4/MnO2', { 'MnO4-': 1, 'H+': 4 }, { MnO2: 1, 'H2O': 2 }, 3, 1.679, { strong: true, condO: c => c.pH >= 3 });
  Hf('Cr2O7/Cr3', { 'Cr2O7^2-': 1, 'H+': 14 }, { 'Cr^3+': 2, 'H2O': 7 }, 6, 1.33, { strong: true, condO: c => c.pH < 5 });
  Hf('H2O2/H2O', { 'H2O2(aq)': 1, 'H+': 2 }, { 'H2O': 2 }, 2, 1.776, { onlyO: true });
  Hf('O2/H2O2', { O2: 1, 'H+': 2 }, { 'H2O2(aq)': 1 }, 2, 0.695, { onlyR: true });
  Hf('Fe3/Fe2', { 'Fe^3+': 1 }, { 'Fe^2+': 1 }, 1, 0.771);
  Hf('NO3/NO', { 'NO3-': 1, 'H+': 4 }, { NO: 1, 'H2O': 2 }, 3, 0.957, { onlyO: true, strong: true, condO: c => c.pH < 2 && c.cNO3 < 8 });
  Hf('NO3/NO2', { 'NO3-': 1, 'H+': 2 }, { NO2: 1, 'H2O': 1 }, 1, 0.80, { onlyO: true, strong: true, condO: c => c.pH < 2 && c.cNO3 >= 8 });
  Hf('SO4/SO2', { 'HSO4-': 1, 'H+': 3 }, { SO2: 1, 'H2O': 2 }, 2, 0.45, { onlyO: true, strong: true, condO: c => c.cSO4 >= 12 && c.T >= 100, note: '热浓硫酸的有效电势(非标准条件, 经验取值)' });
  Hf('I3/I', { 'I3-': 1 }, { 'I-': 3 }, 2, 0.536);
  Hf('SO4/SO3', { 'SO4^2-': 1, 'H+': 2 }, { 'SO3^2-': 1, 'H2O': 1 }, 2, 0.172, { onlyR: true });
  Hf('CO2/C2O4', { CO2: 2 }, { 'C2O4^2-': 1 }, 2, -0.49, { onlyR: true, condR: c => c.T >= 55, noteR: '高锰酸钾氧化草酸需加热 (~60–75 °C)，常温极慢' });
  Hf('CO2/H2C2O4', { CO2: 2, 'H+': 2 }, { 'H2C2O4(aq)': 1 }, 2, -0.49, { onlyR: true, condR: c => c.T >= 55, noteR: '高锰酸钾氧化草酸需加热 (~60–75 °C)，常温极慢' });
  Hf('CO2/HC2O4', { CO2: 2, 'H+': 1 }, { 'HC2O4-': 1 }, 2, -0.49, { onlyR: true, condR: c => c.T >= 55 });
  Hf('AcOH/EtOH', { 'CH3COOH(aq)': 1, 'H+': 4 }, { C2H5OH: 1, 'H2O': 1 }, 4, 0.058, { onlyR: true, needStrong: true });
  Hf('H+/H2', { 'H+': 2 }, { H2: 1 }, 2, 0.0, { onlyO: true });
  // 金属 (M^n+ + n e- = M)
  const METALS = {
    K: { ion: 'K+', n: 1, E: -2.931, water: 'rapid' }, Ca: { ion: 'Ca^2+', n: 2, E: -2.868, water: 'rapid' }, Na: { ion: 'Na+', n: 1, E: -2.714, water: 'rapid' },
    Mg: { ion: 'Mg^2+', n: 2, E: -2.372, water: 'hot' }, Al: { ion: 'Al^3+', n: 3, E: -1.662, water: 'film', passiv: true }, Zn: { ion: 'Zn^2+', n: 2, E: -0.762, water: 'film' },
    Fe: { ion: 'Fe^2+', n: 2, E: -0.447, water: 'none', passiv: true }, Pb: { ion: 'Pb^2+', n: 2, E: -0.126, water: 'film', coat: true }, Cu: { ion: 'Cu^2+', n: 2, E: 0.342, water: 'none' }, Ag: { ion: 'Ag+', n: 1, E: 0.7996, water: 'none' },
  };
  Object.keys(METALS).forEach(m => { const M = METALS[m]; Hf('M/' + m, { [M.ion]: 1 }, { [m]: 1 }, M.n, M.E, { metal: m }); });
  // 金属 + 强碱形成羟基配合物 (氧化方向用, 还原式 E° 是碱性介质值，已折算到 H+ 型)
  // Al(OH)4- + 3e = Al + 4OH-  E = -2.33 V (pH 14)  → 折算 E°(H+ 型) ≈ -2.33+0.0592*(4/3)*14*... 在引擎中以碱性变体直接处理
  const AMPHO = {
    Al: { prod: { 'Al(OH)4-': 1 }, ohs: 4, n: 3, E14: -2.33, minpH: 12.5 },
    Zn: { prod: { 'Zn(OH)4^2-': 1 }, ohs: 4, n: 2, E14: -1.285, minpH: 13 },
  };

  // 离子颜色: [hex, 吸光系数 k(1/M)]
  const IONCOLOR = {
    'Cu^2+': ['#2a9fe0', 6], 'Fe^3+': ['#c98a28', 5], 'Fe^2+': ['#a8d49c', 1.5], 'MnO4-': ['#8e1fb0', 40], 'Cr2O7^2-': ['#ee7a14', 10], 'CrO4^2-': ['#f2d716', 14],
    'Cr^3+': ['#2e8b57', 3], 'I3-': ['#7a3b10', 18], 'Cu(NH3)4^2+': ['#1b3fc7', 12], 'FeSCN^2+': ['#c4161c', 60], 'Mn^2+': ['#f0c4d0', 0.4], 'Ni^2+': ['#4fbf6f', 2],
    'Zn(NH3)4^2+': ['#ffffff', 0], 'Ag(NH3)2+': ['#ffffff', 0],
  };

  // ---------- 试剂架 ----------
  const REAG = [];
  // R(id, 中文名, 分类, 形态, species, opts)
  function R(id, name, cat, form, sp, o) { REAG.push(Object.assign({ id, name, cat, form, sp }, o || {})); }
  // form: 's' 固体(按质量) | 'l' 纯液体(按体积) | 'aq' 仅作水溶液(按浓度×体积)
  // 酸
  R('HCl', '盐酸', '酸', 'aq', null, { f: 'HCl', M: 36.461, diss: { 'H+': 1, 'Cl-': 1 }, cmax: 12.0, cpre: [0.1, 1, 6, 12], dk: 0.0153, pKa: '强酸 (pKa ≈ −6)', color: '#e8f0f0', dHf: -167.2 + 0, hz: ['腐蚀性', '浓盐酸挥发刺激性 HCl 气体'] , dHfNote: 'H⁺(aq)+Cl⁻(aq): ΔfH = −167.2 kJ/mol' });
  R('H2SO4', '硫酸', '酸', 'aq', null, { f: 'H2SO4', M: 98.079, diss: { 'H+': 1, 'HSO4-': 1 }, cmax: 18.4, cpre: [0.1, 1, 3, 18.4], dk: 0.0457, pKa: 'pKa₁ ≪ 0 (强); pKa₂ = 1.99 (Ka₂ = 1.02×10⁻²)', color: '#f0f0f0', dHf: -909.3, hz: ['强腐蚀性', '浓硫酸稀释剧烈放热 —— 永远将酸加入水', '强脱水性'] });
  R('HNO3', '硝酸', '酸', 'aq', null, { f: 'HNO3', M: 63.012, diss: { 'H+': 1, 'NO3-': 1 }, cmax: 15.4, cpre: [0.1, 1, 6, 15.4], dk: 0.0266, pKa: '强酸 (pKa ≈ −1.4)', color: '#f4f2e0', dHf: -207.4, hz: ['强氧化性、强腐蚀性', '与金属反应产生有毒氮氧化物(NO₂ 红棕色)'] });
  R('H3PO4', '磷酸', '酸', 'aq', null, { f: 'H3PO4', M: 97.994, diss: { 'H3PO4(aq)': 1 }, cmax: 14.6, cpre: [0.1, 1, 14.6], dk: 0.0135, pKa: 'pKa₁=2.15, pKa₂=7.20, pKa₃=12.35 (Ka₁=7.1×10⁻³)', color: '#f4f4f4', dHf: -1288.3, hz: ['腐蚀性'] });
  R('CH3COOH', '乙酸 (醋酸)', '酸', 'l', 'CH3COOH', { f: 'CH3COOH', M: 60.052, rho: 1.049, bp: 118, mp: 16.6, diss: { 'CH3COOH(aq)': 1 }, solution: true, cmax: 17.4, cpre: [0.1, 1, 17.4], dk: 0.0028, pKa: 'pKa = 4.76 (Ka = 1.74×10⁻⁵)', color: '#f6f6f2', hz: ['冰醋酸腐蚀、易燃(闪点 39 °C)', '刺激性气味'] });
  R('HCOOH', '甲酸', '酸', 'l', 'HCOOH', { f: 'HCOOH', M: 46.025, rho: 1.22, bp: 101, diss: { 'HCOOH(aq)': 1 }, solution: true, cmax: 26, cpre: [0.1, 1], dk: 0.01, pKa: 'pKa = 3.75 (Ka = 1.8×10⁻⁴)', color: '#f6f6f2', hz: ['强腐蚀', '刺激性蒸气'] });
  R('H2C2O4', '草酸', '酸', 's', 'H2C2O4', { f: 'H2C2O4', rho: 1.90, diss: { 'H2C2O4(aq)': 1 }, sol: [[0, 3.5], [20, 9.5], [50, 21.5], [100, 120]], pKa: 'pKa₁=1.25, pKa₂=4.27', color: '#fafafa', hz: ['有毒', '腐蚀性'] });
  R('C6H8O7', '柠檬酸', '酸', 's', 'C6H8O7', { f: 'C6H8O7', rho: 1.66, diss: { 'C6H8O7(aq)': 1 }, sol: [[20, 59], [60, 73], [100, 100]], pKa: 'pKa=3.13/4.76/6.40', color: '#fafafa', hz: ['刺激眼睛'] });
  R('C7H6O2', '苯甲酸', '酸', 's', 'C7H6O2', { f: 'C7H5O2H', fdisp: 'C6H5COOH', rho: 1.27, mp: 122, sol: [[0, 0.17], [25, 0.34], [100, 5.6]], pKa: 'pKa = 4.20 (Ka = 6.3×10⁻⁵)', color: '#fafafa', hz: ['刺激性粉尘'] });
  R('C7H6O3', '水杨酸 (邻羟基苯甲酸)', '酸', 's', 'C7H6O3', { f: 'C7H6O3', fdisp: 'HOC6H4COOH', rho: 1.44, mp: 159, sol: [[20, 0.2], [100, 6.7]], pKa: 'pKa = 2.97 (羧基; 酚羟基 ≈ 13.6)', color: '#fbfbf6', hz: ['刺激性', '误服有害'] });
  // 碱
  R('NaOH', '氢氧化钠', '碱', 's', 'NaOH', { f: 'NaOH', rho: 2.13, mp: 318, diss: { 'Na+': 1, 'OH-': 1 }, sol: [[0, 42], [20, 109], [100, 347]], cmax: 19, solution: true, dk: 0.043, pKa: '强碱 (Kb 很大)', color: '#f8f8f8', hz: ['强腐蚀性', '溶解大量放热'] });
  R('KOH', '氢氧化钾', '碱', 's', 'KOH', { f: 'KOH', rho: 2.12, mp: 360, diss: { 'K+': 1, 'OH-': 1 }, sol: [[0, 97], [20, 112], [100, 178]], cmax: 14, solution: true, dk: 0.045, pKa: '强碱', color: '#f8f8f8', hz: ['强腐蚀性', '溶解大量放热'] });
  R('Ca(OH)2', '氢氧化钙 (熟石灰)', '碱', 's', 'Ca(OH)2', { f: 'Ca(OH)2', rho: 2.21, sol: [[0, 0.189], [20, 0.173], [100, 0.077]], ksp: 'Ksp = 5.5×10⁻⁶', pKa: '强碱(微溶, 饱和溶液 pH≈12.4)', color: '#fafafa', hz: ['刺激性、腐蚀性'] });
  R('Mg(OH)2', '氢氧化镁', '碱', 's', 'Mg(OH)2', { f: 'Mg(OH)2', rho: 2.34, ksp: 'Ksp = 5.6×10⁻¹²', pKa: '中强碱(难溶)', color: '#fafafa', hz: [] });
  R('NH3', '氨水', '碱', 'aq', null, { f: 'NH3', M: 17.031, diss: { 'NH3(aq)': 1 }, cmax: 14.8, cpre: [0.1, 1, 6, 14.8], dk: -0.0068, pKa: 'Kb = 1.76×10⁻⁵ (pKb 4.75; NH₄⁺ pKa 9.25)', color: '#f4f6f8', dHf: -80.3, hz: ['刺激性氨气', '浓氨水腐蚀性'] });
  // 盐
  const salts = [
    ['NaCl', '氯化钠 (食盐)', { 'Na+': 1, 'Cl-': 1 }, [[0, 35.7], [20, 35.9], [100, 39.1]], 2.16, '#fafafa', []],
    ['KCl', '氯化钾', { 'K+': 1, 'Cl-': 1 }, [[0, 28.0], [20, 34.2], [100, 56.7]], 1.98, '#fafafa', []],
    ['NaNO3', '硝酸钠', { 'Na+': 1, 'NO3-': 1 }, [[0, 73], [20, 88], [100, 180]], 2.26, '#f6f6f6', ['氧化剂(与可燃物混合危险)']],
    ['KNO3', '硝酸钾', { 'K+': 1, 'NO3-': 1 }, [[0, 13.3], [20, 31.6], [100, 246]], 2.11, '#f6f6f6', ['氧化剂(与可燃物混合危险)']],
    ['AgNO3', '硝酸银', { 'Ag+': 1, 'NO3-': 1 }, [[0, 122], [20, 216], [100, 952]], 4.35, '#f2f2f2', ['腐蚀性，使皮肤变黑', '氧化剂']],
    ['BaCl2', '氯化钡', { 'Ba^2+': 1, 'Cl-': 2 }, [[0, 31.2], [20, 35.8], [100, 58.7]], 3.86, '#f6f6f6', ['有毒(可溶性钡盐)']],
    ['CuSO4', '硫酸铜(无水)', { 'Cu^2+': 1, 'SO4^2-': 1 }, [[0, 14.3], [20, 20.7], [100, 75.4]], 3.60, '#e9f0ec', ['有害，对水生生物有毒']],
    ['CuSO4·5H2O', '五水硫酸铜 (胆矾)', { 'Cu^2+': 1, 'SO4^2-': 1, 'H2O': 5 }, [[0, 31.6], [20, 42.3], [100, 203]], 2.28, '#2f7fd6', ['有害，对水生生物有毒']],
    ['CuCl2', '氯化铜', { 'Cu^2+': 1, 'Cl-': 2 }, [[0, 68.6], [20, 73], [100, 120]], 3.39, '#8a6a2a', ['有害']],
    ['ZnSO4', '硫酸锌', { 'Zn^2+': 1, 'SO4^2-': 1 }, [[0, 41.6], [20, 53.8], [100, 80.8]], 3.54, '#f7f7f7', ['对水生生物有毒']],
    ['ZnCl2', '氯化锌', { 'Zn^2+': 1, 'Cl-': 2 }, [[0, 342], [20, 432], [100, 614]], 2.91, '#f4f4f4', ['腐蚀性']],
    ['FeSO4', '硫酸亚铁', { 'Fe^2+': 1, 'SO4^2-': 1 }, [[0, 15.6], [20, 26.5], [60, 40.2]], 3.65, '#c9dec4', ['有害']],
    ['FeCl3', '氯化铁', { 'Fe^3+': 1, 'Cl-': 3 }, [[0, 74.4], [20, 91.9], [100, 535]], 2.90, '#9a5a2a', ['腐蚀性，酸性溶液']],
    ['Na2SO4', '硫酸钠', { 'Na+': 2, 'SO4^2-': 1 }, [[0, 4.5], [20, 19.5], [40, 48.8], [100, 42.5]], 2.66, '#f8f8f8', []],
    ['K2SO4', '硫酸钾', { 'K+': 2, 'SO4^2-': 1 }, [[0, 7.4], [20, 11.1], [100, 24.1]], 2.66, '#f8f8f8', []],
    ['MgSO4', '硫酸镁', { 'Mg^2+': 1, 'SO4^2-': 1 }, [[0, 22.0], [20, 33.7], [100, 50.4]], 2.66, '#f8f8f8', []],
    ['MgCl2', '氯化镁', { 'Mg^2+': 1, 'Cl-': 2 }, [[0, 52.9], [20, 54.6], [100, 72.7]], 2.32, '#f4f4f4', []],
    ['CaCl2', '氯化钙(无水)', { 'Ca^2+': 1, 'Cl-': 2 }, [[0, 59.5], [20, 74.5], [100, 159]], 2.15, '#f4f4f4', ['溶解大量放热']],
    ['Na2CO3', '碳酸钠 (纯碱)', { 'Na+': 2, 'CO3^2-': 1 }, [[0, 7.0], [20, 21.5], [40, 49]], 2.54, '#fafafa', ['刺激眼睛'], 'Kb₁ = 2.1×10⁻⁴ (CO₃²⁻; pKa(HCO₃⁻)=10.33)'],
    ['NaHCO3', '碳酸氢钠 (小苏打)', { 'Na+': 1, 'HCO3-': 1 }, [[0, 6.9], [20, 9.6], [60, 16.4]], 2.20, '#fafafa', [], 'HCO₃⁻: pKa₁(H₂CO₃)=6.35, pKa₂=10.33'],
    ['CH3COONa', '乙酸钠', { 'Na+': 1, 'CH3COO-': 1 }, [[0, 36.2], [20, 46.4], [100, 170]], 1.53, '#f8f8f8', [], 'Kb = 5.7×10⁻¹⁰ (乙酸根)'],
    ['NH4Cl', '氯化铵', { 'NH4+': 1, 'Cl-': 1 }, [[0, 29.7], [20, 37.2], [100, 77.3]], 1.53, '#f8f8f8', ['刺激性'], 'NH₄⁺: Ka = 5.6×10⁻¹⁰ (pKa 9.25)'],
    ['(NH4)2SO4', '硫酸铵', { 'NH4+': 2, 'SO4^2-': 1 }, [[0, 70.6], [20, 75.4], [100, 103.8]], 1.77, '#f8f8f8', [], 'NH₄⁺: pKa 9.25'],
    ['KI', '碘化钾', { 'K+': 1, 'I-': 1 }, [[0, 128], [20, 144], [100, 206]], 3.12, '#f8f8f8', []],
    ['KBr', '溴化钾', { 'K+': 1, 'Br-': 1 }, [[0, 53.5], [20, 65.9], [100, 104]], 2.74, '#f8f8f8', []],
    ['KSCN', '硫氰酸钾', { 'K+': 1, 'SCN-': 1 }, [[0, 177], [20, 217], [100, 675]], 1.89, '#f8f8f8', ['有害']],
    ['Pb(NO3)2', '硝酸铅', { 'Pb^2+': 1, 'NO3-': 2 }, [[0, 38.8], [20, 56.5], [100, 127]], 4.53, '#f4f4f4', ['剧毒(重金属)，致癌', '氧化剂']],
    ['Al2(SO4)3', '硫酸铝', { 'Al^3+': 2, 'SO4^2-': 3 }, [[0, 31.2], [20, 36.4], [100, 89]], 2.67, '#f8f8f8', ['刺激性'], 'Al³⁺ 水解: pKa ≈ 5.0'],
    ['Na2SO3', '亚硫酸钠', { 'Na+': 2, 'SO3^2-': 1 }, [[0, 14.4], [20, 26.1], [80, 28.3]], 2.63, '#f8f8f8', ['遇酸放出有毒 SO₂'], 'SO₃²⁻: pKa(HSO₃⁻)=7.2'],
    ['Na2S', '硫化钠', { 'Na+': 2, 'S^2-': 1 }, [[0, 12.4], [20, 18.6], [90, 39.1]], 1.86, '#e8d9b0', ['遇酸放出剧毒 H₂S', '腐蚀性'], 'S²⁻: pKa(HS⁻)=12.9; 强碱性'],
    ['K2CrO4', '铬酸钾', { 'K+': 2, 'CrO4^2-': 1 }, [[0, 58.2], [20, 63.7], [100, 79.2]], 2.73, '#f0d41a', ['六价铬: 致癌、剧毒']],
    ['K2Cr2O7', '重铬酸钾', { 'K+': 2, 'Cr2O7^2-': 1 }, [[0, 4.9], [20, 12.5], [100, 102]], 2.68, '#e8761b', ['六价铬: 致癌、强氧化剂']],
    ['KMnO4', '高锰酸钾', { 'K+': 1, 'MnO4-': 1 }, [[0, 2.8], [20, 6.4], [65, 25]], 2.70, '#3a1048', ['强氧化剂', '与有机物/还原性物质接触可着火']],
  ];
  salts.forEach(s => R(s[0], s[1], s[0] === 'KMnO4' || s[0] === 'K2Cr2O7' ? '氧化剂' : '盐', 's', s[0], { f: s[0], diss: s[2], sol: s[3], rho: s[4], color: s[5], hz: s[6], pKa: s[7] || null, solution: true }));
  R('CaCO3', '碳酸钙 (大理石/石灰石)', '盐', 's', 'CaCO3', { f: 'CaCO3', rho: 2.71, ksp: 'Ksp = 3.4×10⁻⁹', pKa: null, color: '#fbfbfb', hz: [] });
  // 金属
  const metals = [['Na', '钠', 0.97, 98, '遇水剧烈反应放出 H₂，可着火；煤油中保存'], ['K', '钾', 0.86, 64, '遇水猛烈反应并起火(紫色火焰)'], ['Ca', '钙', 1.55, 842, '遇水放出 H₂'], ['Mg', '镁带/镁粉', 1.74, 650, '燃烧发强白光(勿直视)'], ['Al', '铝', 2.70, 660, '粉末可燃'], ['Zn', '锌粒', 7.14, 420, ''], ['Fe', '铁粉/铁钉', 7.87, 1538, ''], ['Cu', '铜片', 8.96, 1085, ''], ['Ag', '银', 10.49, 962, ''], ['Pb', '铅', 11.34, 327, '有毒(重金属)']];
  metals.forEach(m => R(m[0], m[1], '金属', 's', m[0], { f: m[0], rho: m[2], mp: m[3], color: SP[m[0]].col, hz: m[4] ? [m[4]] : [], eo: METALS[m[0]] ? METALS[m[0]].E : null }));
  // 非金属单质/氧化物
  R('S', '硫粉', '单质', 's', 'S', { f: 'S', rho: 2.07, mp: 115, color: '#e8d43a', hz: ['燃烧生成刺激性 SO₂'] });
  R('C', '木炭/石墨', '单质', 's', 'C', { f: 'C', rho: 2.26, color: '#262626', hz: [] });
  R('I2', '碘', '单质', 's', 'I2', { f: 'I2', rho: 4.93, mp: 114, color: '#4b2a5e', sol: [[20, 0.029], [60, 0.1]], hz: ['有害，升华产生紫色蒸气'] });
  R('CuO', '氧化铜', '氧化物', 's', 'CuO', { f: 'CuO', rho: 6.31, color: '#1c1c1c', hz: ['有害'] });
  R('CaO', '氧化钙 (生石灰)', '氧化物', 's', 'CaO', { f: 'CaO', rho: 3.34, color: '#f0f0f0', hz: ['遇水剧烈放热', '腐蚀性'] });
  R('MgO', '氧化镁', '氧化物', 's', 'MgO', { f: 'MgO', rho: 3.58, color: '#f6f6f6', hz: [] });
  R('Fe2O3', '氧化铁 (铁红)', '氧化物', 's', 'Fe2O3', { f: 'Fe2O3', rho: 5.24, color: '#8b3a1d', hz: [] });
  R('Al2O3', '氧化铝', '氧化物', 's', 'Al2O3', { f: 'Al2O3', rho: 3.95, color: '#f4f4f4', hz: [] });
  R('MnO2', '二氧化锰', '氧化物', 's', 'MnO2', { f: 'MnO2', rho: 5.03, color: '#2b2218', hz: ['氧化剂'], catalyst: true });
  // 氧化剂(液)
  R('H2O2', '过氧化氢 (双氧水)', '氧化剂', 'aq', null, { f: 'H2O2', M: 34.015, diss: { 'H2O2(aq)': 1 }, cmax: 9.8, cpre: [0.88, 3, 9.8], dk: 0.012, pKa: 'pKa ≈ 11.6 (弱酸, 忽略)', color: '#f4f8fa', dHf: -191.2, hz: ['强氧化剂；浓度≥30% 强腐蚀', '见光/杂质催化分解放出 O₂'] });
  // 有机物
  R('C2H5OH', '乙醇', '有机物', 'l', 'C2H5OH', { f: 'C2H5OH', rho: 0.789, bp: 78.4, mp: -114, ign: 363, fp: 13, solution: true, cmax: 17.1, cpre: [1, 5, 17.1], dk: -0.0, miscible: true, color: '#f4f8f8', hz: ['高度易燃(闪点 13 °C)'], pKa: '极弱酸 (pKa ≈ 15.9)' });
  R('CH3OH', '甲醇', '有机物', 'l', 'CH3OH', { f: 'CH3OH', rho: 0.792, bp: 64.7, ign: 464, fp: 11, miscible: true, color: '#f4f8f8', hz: ['易燃', '有毒(损害视神经)'] });
  R('C3H6O', '丙酮', '有机物', 'l', 'C3H6O', { f: 'CH3COCH3', rho: 0.784, bp: 56, ign: 465, fp: -20, miscible: true, color: '#f4f8f8', hz: ['高度易燃', '蒸气刺激'] });
  R('C6H14', '正己烷', '有机物', 'l', 'C6H14', { f: 'C6H14', rho: 0.655, bp: 69, ign: 225, fp: -22, miscible: false, color: '#f4f8f8', hz: ['高度易燃', '神经毒性'] });
  R('C7H8', '甲苯', '有机物', 'l', 'C7H8', { f: 'C6H5CH3', rho: 0.867, bp: 111, ign: 480, fp: 4, miscible: false, color: '#f4f8f8', hz: ['易燃', '蒸气有害'] });
  R('C6H6O', '苯酚', '有机物', 's', 'C6H6O', { f: 'C6H5OH', rho: 1.07, mp: 41, sol: [[20, 8.3], [66, 100]], pKa: 'pKa = 9.99 (Ka = 1.0×10⁻¹⁰)', color: '#f8eee8', hz: ['剧毒、强腐蚀(经皮吸收)'] });
  R('C4H6O3', '乙酸酐', '有机物', 'l', 'C4H6O3', { f: '(CH3CO)2O', rho: 1.082, bp: 139.8, fp: 49, miscible: false, color: '#f6f6f2', hz: ['易燃、腐蚀、催泪', '遇水放热水解为乙酸'] });
  R('C9H8O4', '乙酰水杨酸 (阿司匹林)', '有机物', 's', 'C9H8O4', { f: 'C9H8O4', rho: 1.40, mp: 135, sol: [[25, 0.33], [37, 1.0]], pKa: 'pKa = 3.5 (Ka = 3.2×10⁻⁴)', color: '#fbfbfb', hz: ['误服有害'] });
  R('CH3COOC2H5', '乙酸乙酯', '有机物', 'l', 'CH3COOC2H5', { f: 'CH3COOC2H5', rho: 0.902, bp: 77, fp: -4, ign: 426, miscible: false, color: '#f4f8f8', hz: ['高度易燃', '香蕉/指甲油气味'] });
  R('C6H12O6', '葡萄糖', '有机物', 's', 'C6H12O6', { f: 'C6H12O6', rho: 1.54, mp: 146, sol: [[20, 91], [50, 244]], color: '#fafafa', hz: [] });
  R('C12H22O11', '蔗糖', '有机物', 's', 'C12H22O11', { f: 'C12H22O11', rho: 1.59, mp: 186, sol: [[0, 179], [20, 204], [100, 487]], color: '#fafafa', hz: [] });
  R('C3H8O3', '甘油 (丙三醇)', '有机物', 'l', 'C3H8O3', { f: 'C3H5(OH)3', rho: 1.261, bp: 290, fp: 160, ign: 370, miscible: true, color: '#f6f8f8', hz: ['与强氧化剂(如高锰酸钾)接触可自燃'] });
  R('CH4N2O', '尿素', '有机物', 's', 'CH4N2O', { f: 'CO(NH2)2', rho: 1.32, mp: 133, sol: [[20, 108], [60, 251]], color: '#fafafa', hz: [] });
  // 溶剂
  R('H2O', '蒸馏水', '溶剂', 'l', 'H2O', { f: 'H2O', rho: 0.998, bp: 100, mp: 0, color: '#eaf6fb', hz: [], miscible: true });

  // 指示剂
  const INDICATORS = [
    { id: 'none', name: '无指示剂', pK: null },
    { id: 'pp', name: '酚酞', range: [8.2, 10.0], pK: 9.1, acid: [255, 255, 255, 0.0], base: [230, 40, 130, 0.85], note: '无色→粉红' },
    { id: 'mo', name: '甲基橙', range: [3.1, 4.4], pK: 3.75, acid: [226, 40, 40, 0.85], base: [250, 205, 40, 0.85], note: '红→橙黄' },
    { id: 'mr', name: '甲基红', range: [4.4, 6.2], pK: 5.3, acid: [226, 50, 50, 0.85], base: [250, 215, 50, 0.85], note: '红→黄' },
    { id: 'btb', name: '溴百里酚蓝', range: [6.0, 7.6], pK: 6.8, acid: [240, 215, 60, 0.85], base: [40, 110, 220, 0.85], note: '黄→蓝' },
    { id: 'litmus', name: '石蕊', range: [5.0, 8.0], pK: 6.5, acid: [225, 60, 70, 0.8], base: [70, 90, 220, 0.8], note: '红→蓝' },
  ];

  const VESSELS = [
    { id: 'beaker', name: '烧杯 250 mL', cap: 250, cv: 45, kind: 'beaker' },
    { id: 'tube', name: '试管 25 mL', cap: 25, cv: 5, kind: 'tube' },
    { id: 'flask', name: '锥形瓶 250 mL', cap: 250, cv: 50, kind: 'flask' },
    { id: 'calor', name: '保温杯量热计 (理想绝热)', cap: 250, cv: 0, kind: 'beaker' },
    { id: 'crucible', name: '坩埚 (干法/高温)', cap: 30, cv: 20, kind: 'crucible' },
  ];

  const CATALYSTS = [
    { id: 'none', name: '无催化剂' },
    { id: 'MnO2', name: '二氧化锰 (MnO₂)' },
    { id: 'KI', name: '碘化钾 (催化 H₂O₂ 分解)' },
    { id: 'Fe3', name: 'Fe³⁺ (FeCl₃ 微量)' },
    { id: 'Pt', name: '铂黑 (Pt)' },
    { id: 'H2SO4', name: '浓硫酸 (催化量, 几滴)' },
    { id: 'H3PO4', name: '磷酸 (催化量)' },
  ];

  const D = { AMASS, SP, SYSTEMS, SOLIDLIMIT, PRECIP, ACIDSOL, EQ, HALF, METALS, AMPHO, IONCOLOR, REAG, INDICATORS, VESSELS, CATALYSTS, fmt, fmtPlain, parseComp, molarMass, chargeOf, stripId, KB_NH3 };
  if (typeof module !== 'undefined' && module.exports) module.exports = D; else g.ChemData = D;
})(typeof window !== 'undefined' ? window : globalThis);
