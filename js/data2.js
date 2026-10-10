/* 虚拟化学实验室 —— 扩展数据 (第二批): 新物种 / 新试剂 / 新平衡 / 半反应 / 焰色与原电池电对表
 * 约定同 data.js: ΔfH° (kJ/mol, 298 K), S° (J/mol/K); 值为 null 表示"无可靠数据" (引擎会如实提示, 不编造);
 * approx:true 表示该值为估算/类比值 (在结果中会标注"含近似 ΔfH°")。
 * 硬性范围限制: 不收录爆炸物 / 军用毒剂 / 违禁药物 的试剂、规则与路线。
 */
(function (g) {
  'use strict';
  const D = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./data.js') : g.ChemData;
  const { S, R, P, Hf, SP, EQ, PRECIP, HALF, METALS, IONCOLOR, REAG, CATALYSTS } = D;
  D.AMASS.Sr = 87.62;

  // ---------- 补充已有物种的熵 ----------
  const S0 = { Fe2O3: 87.4, Al2O3: 50.9, CaSO4: 106.5, MgSO4: 91.6, ZnO: 43.6, C2H4: 219.3, CuO: 42.6, Zn: 41.6, Fe: 27.3 };
  Object.keys(S0).forEach(k => { if (SP[k]) SP[k].S0 = S0[k]; });

  // ---------- 新物种: 气体 ----------
  S('HBr(g)', '溴化氢气体', 'g', -36.3, { S0: 198.7 }); S('CH3CH=CH2', '丙烯', 'g', 20.0, { S0: 267.1 }); S('CH2=C(CH3)2', '异丁烯', 'g', -17.9, { S0: 293.6 });
  S('C2H6', '乙烷', 'g', -84.0, { S0: 229.6 }); S('CH3CH2CH3', '丙烷', 'g', -103.8, { S0: 270.3 }); S('(CH3)3CH', '异丁烷', 'g', -134.2, { S0: 294.6 });
  // ---------- 卤代烃 / 醚 / 醇 / 烯 / 烷 (液) ----------
  S('C2H5Br', '溴乙烷', 'l', -90.4, { cp: 1.0 }); S('(CH3)2CHBr', '2-溴丙烷', 'l', -130.0, { approx: true, cp: 1.1 }); S('(CH3)3CCl', '叔丁基氯(2-氯-2-甲基丙烷)', 'l', -211.2, { approx: true, cp: 1.6 });
  S('(CH3)3CBr', '叔丁基溴', 'l', -163.6, { approx: true }); S('C6H11Br', '溴代环己烷', 'l', -181.3, { approx: true }); S('C2H4Br2', '1,2-二溴乙烷', 'l', -79.3, { S0: 223.1 });
  S('C3H6Br2', '1,2-二溴丙烷', 'l', -111.7, { approx: true }); S('C4H8Br2', '1,2-二溴-2-甲基丙烷', 'l', -149.6, { approx: true }); S('C6H10Br2', '1,2-二溴环己烷', 'l', -170.2, { approx: true });
  S('(C2H5)2O', '乙醚', 'l', -279.5, { S0: 172.4, cp: 2.37 }); S('(CH3)2CHOH', '异丙醇', 'l', -318.1, { S0: 181.1, cp: 2.6 }); S('(CH3)3COH', '叔丁醇', 'l', -359.9, { S0: 189.5, cp: 3.0 });
  S('C6H10', '环己烯', 'l', -38.5, { S0: 214.9, approx: true, cp: 1.8 }); S('C6H12', '环己烷', 'l', -156.4, { S0: 204.4, cp: 1.84 }); S('C6H11OH', '环己醇', 'l', -348.2, { S0: 203.4, cp: 2.0 });
  S('C6H6', '苯', 'l', 49.0, { S0: 173.4, cp: 1.74 }); S('C6H5Br', '溴苯', 'l', 60.9, { approx: true, cp: 1.0 }); S('C6H13Br', '2-溴己烷 (自由基溴代主产物之一)', 'l', null, { cp: 1.5 });
  S('CH3CHO', '乙醛', 'l', -192.2, { S0: 160.2, cp: 2.2 }); S('C7H6O', '苯甲醛', 'l', -87.0, { cp: 1.6 }); S('C6H7N', '苯胺', 'l', 31.3, { S0: 191.9, cp: 2.1 });
  S('C8H9NO', '乙酰苯胺', 's', -209.4, { approx: true }); S('C5H12O', '异戊醇(3-甲基-1-丁醇)', 'l', -356.4, { approx: true, cp: 2.4 });
  S('C7H14O2', '乙酸异戊酯(香蕉油)', 'l', -558.1, { approx: true, cp: 1.9 }); S('C9H10O2', '苯甲酸乙酯', 'l', -380.5, { approx: true, cp: 1.8 }); S('C8H8O3', '水杨酸甲酯(冬青油)', 'l', -549.0, { approx: true, cp: 1.9 });
  S('C8H8', '苯乙烯', 'l', 103.8, { S0: 237.6, cp: 1.8 }); S('[C8H8]', '聚苯乙烯(以重复单元计)', 's', 33.9, { approx: true, col: '#f6f6f6' });
  S('C6H5OC2H5', '苯乙醚(乙氧基苯)', 'l', null, { cp: 1.7 }); S('C17H14O', '二亚苄基丙酮', 's', null, { col: '#e8d020' }); S('C6H12O2', '1,2-环己二醇', 's', null, { col: '#f4f4f4' });
  S('CHI3', '碘仿', 's', null, { col: '#f2d83a' }); S('C6H3Br3O', '2,4,6-三溴苯酚', 's', null, { col: '#f6f6f2' });
  S('C57H104O6', '三油酸甘油酯(橄榄油主成分)', 'l', null, { cp: 2.0 }); S('C18H33O2-', '油酸根(肥皂阴离子)', 'aq', null); S('Ca(C18H33O2)2', '油酸钙(皂垢)', 's', null, { col: '#f1ece0' });
  S('ClCO(CH2)4COCl', '己二酰氯', 'l', null, { cp: 1.4 }); S('H2N(CH2)6NH2', '1,6-己二胺', 's', null); S('[C12H22N2O2]', '尼龙-66 (以重复单元计)', 's', null, { col: '#f2f2f0' });
  S('C6H10O4', '己二酸', 's', null, { col: '#fafafa' }); S('C6H11O7-', '葡萄糖酸根', 'aq', null); S('C4H4O6^2-', '酒石酸根', 'aq', null);
  S('Cu(C4H4O6)2^2-', '双(酒石酸)合铜(II) (斐林试剂的活性铜)', 'aq', null);
  // ---------- 无机新物种 ----------
  S('NaBr', '溴化钠', 's', -361.1, { col: '#f8f8f8' }); S('C2H5ONa', '乙醇钠', 's', -414.3, { approx: true, col: '#f2ead8' });
  S('Br2', '溴', 'l', 0, { S0: 152.2, cp: 0.47, col: '#8b2a10' }); S('Br2(aq)', '溴水(溶解的 Br₂)', 'aq', -2.6);
  S('Cu2O', '氧化亚铜', 's', -168.6, { S0: 93.1, col: '#c0391b' }); S('IO3-', '碘酸根', 'aq', -221.3); S('S2O3^2-', '硫代硫酸根', 'aq', -648.5); S('S4O6^2-', '连四硫酸根', 'aq', null);
  S('Na2S2O3', '硫代硫酸钠', 's', -1123.0, { col: '#f8f8f8' }); S('K2S2O8', '过硫酸钾', 's', -1916.1, { approx: true, col: '#fafafa' }); S('S2O8^2-', '过二硫酸根', 'aq', -1344.7, { approx: true });
  S('BrO3-', '溴酸根', 'aq', -67.1, { S0: 161.7 });
  S('Sr^2+', '锶离子', 'aq', -545.8); S('SrCl2', '氯化锶', 's', -828.9, { col: '#f6f6f6' }); S('LiCl', '氯化锂', 's', -408.6, { col: '#f6f6f6' });
  S('Ni', '镍', 's', 0, { S0: 29.9, col: '#b9bcc0' }); S('Ni^2+', '镍离子', 'aq', -54.0); S('NiSO4', '硫酸镍', 's', -872.9, { col: '#6dbf6d' }); S('Ni(OH)2', '氢氧化镍', 's', -529.7, { col: '#8fd18f' });
  S('Ni(NH3)6^2+', '六氨合镍(II)', 'aq', -630.1, { approx: true }); S('CuCl4^2-', '四氯合铜(II)', 'aq', null);
  // 水合物
  S('CaSO4·2H2O', '石膏', 's', -2022.6, { S0: 194.1, col: '#f6f6f2' }); S('(CaSO4)2·H2O', '熟石膏(半水硫酸钙, 以 2CaSO₄·H₂O 计)', 's', -3150.4, { S0: 261.0, col: '#f8f8f4' });
  S('MgSO4·7H2O', '泻盐(七水硫酸镁)', 's', -3388.7, { S0: 372.0, col: '#f8f8f8' }); S('Na2CO3·10H2O', '洗涤碱(十水碳酸钠)', 's', -4081.3, { S0: 564.7, col: '#f8f8f8' });
  S('CuSO4·H2O', '一水硫酸铜', 's', -1085.8, { approx: true, S0: 146.0, col: '#7fb3d8' });
  SP['Na2CO3'].S0 = SP['Na2CO3'].S0 || 135.0;

  // ---------- 难溶盐 / 配位平衡 ----------
  P('Ni(OH)2', 'Ni^2+', 1, 'OH-', 2, 5.5e-16);
  EQ.push({ id: 'NiNH3', name: '镍氨配合物形成', react: { 'Ni^2+': 1, 'NH3(aq)': 6 }, prod: { 'Ni(NH3)6^2+': 1 }, K: 5.5e8, type: '配位' });
  EQ.push({ id: 'NH3ppt-Ni(OH)2', name: '氨水使 Ni²⁺ 生成 Ni(OH)2', react: { 'Ni^2+': 1, 'NH3(aq)': 2, 'H2O': 2 }, prod: { 'Ni(OH)2': 1, 'NH4+': 2 }, K: Math.pow(D.KB_NH3, 2) / 5.5e-16, type: '沉淀(弱碱)' });
  EQ.push({ id: 'CuCl4', name: 'Cu²⁺ 与高浓度 Cl⁻ 生成黄绿色 [CuCl₄]²⁻', react: { 'Cu^2+': 1, 'Cl-': 4 }, prod: { 'CuCl4^2-': 1 }, K: 1.6e-3, type: '配位 (近似 K)' });
  IONCOLOR['Ni(NH3)6^2+'] = ['#5a4fc0', 6]; IONCOLOR['CuCl4^2-'] = ['#b9c21c', 14]; IONCOLOR['Cu(C4H4O6)2^2-'] = ['#1a49d0', 14]; IONCOLOR['Br2(aq)'] = ['#e5842a', 30]; IONCOLOR['Br2'] = ['#8b2a10', 40];
  IONCOLOR['C6H10Br2'] = ['#e8e8e0', 0];
  // 金属: 镍
  METALS.Ni = { ion: 'Ni^2+', n: 2, E: -0.257, water: 'none' }; Hf('M/Ni', { 'Ni^2+': 1 }, { Ni: 1 }, 2, -0.257, { metal: 'Ni' });
  // 有机物氧化半反应 (还原式), E° 由 ΔfG° 推算 (见 README)
  Hf('Br2aq/Br', { 'Br2(aq)': 1 }, { 'Br-': 2 }, 2, 1.087, { onlyO: true });
  Hf('Br2l/Br', { Br2: 1 }, { 'Br-': 2 }, 2, 1.066, { onlyO: true });
  Hf('S2O8/SO4', { 'S2O8^2-': 1 }, { 'SO4^2-': 2 }, 2, 2.01, { onlyO: true, strong: true });
  Hf('Ac2/iPrOH', { C3H6O: 1, 'H+': 2 }, { '(CH3)2CHOH': 1 }, 2, 0.12, { onlyR: true, needStrong: true });
  Hf('AcOH/CH3CHO', { 'CH3COOH(aq)': 1, 'H+': 2 }, { CH3CHO: 1, 'H2O': 1 }, 2, -0.10, { onlyR: true, needStrong: true });

  // ---------- 新试剂 ----------
  const L = (id, name, f, sp, rho, bp, fp, hz, o) => R(id, name, '有机物', 'l', sp, Object.assign({ f, rho, bp, fp, miscible: false, color: '#f4f8f8', hz }, o || {}));
  L('C2H5Br', '溴乙烷', 'C2H5Br', 'C2H5Br', 1.46, 38, null, ['易挥发、有害', '烷基化试剂'], {});
  L('(CH3)2CHBr', '2-溴丙烷', '(CH3)2CHBr', '(CH3)2CHBr', 1.31, 59, 19, ['易燃', '有害']);
  L('(CH3)3CCl', '叔丁基氯', '(CH3)3CCl', '(CH3)3CCl', 0.84, 51, -9, ['高度易燃', '刺激性']);
  L('C6H10', '环己烯', 'C6H10', 'C6H10', 0.811, 83, -12, ['高度易燃', '可形成过氧化物(久置)'], { ign: 244 });
  L('C6H6', '苯', 'C6H6', 'C6H6', 0.877, 80, -11, ['高度易燃', '致癌(白血病)，实际工作中应以甲苯等替代'], { ign: 498 });
  L('(CH3)2CHOH', '异丙醇', '(CH3)2CHOH', '(CH3)2CHOH', 0.786, 82, 12, ['高度易燃'], { miscible: true, ign: 399 });
  L('(CH3)3COH', '叔丁醇', '(CH3)3COH', '(CH3)3COH', 0.775, 82, 11, ['易燃'], { miscible: true, mp: 25 });
  L('CH3CHO', '乙醛', 'CH3CHO', 'CH3CHO', 0.784, 20.2, -39, ['极易挥发(沸点 20 °C)、极易燃', '刺激性，疑似致癌'], { miscible: true, ign: 175 });
  L('C7H6O', '苯甲醛', 'C6H5CHO', 'C7H6O', 1.044, 179, 64, ['有害', '空气中缓慢氧化为苯甲酸'], {});
  L('C6H7N', '苯胺', 'C6H5NH2', 'C6H7N', 1.022, 184, 70, ['剧毒(高铁血红蛋白症)，经皮吸收', '对水生生物极毒'], { pKa: '共轭酸 pKa(C₆H₅NH₃⁺) = 4.6 (弱碱)' });
  L('C5H12O', '异戊醇', '(CH3)2CHCH2CH2OH', 'C5H12O', 0.81, 131, 43, ['易燃'], { fdisp: '(CH3)2CHCH2CH2OH' });
  L('(C2H5)2O', '乙醚', '(C2H5)2O', '(C2H5)2O', 0.713, 34.6, -45, ['极易燃(闪点 −45 °C)', '久置形成爆炸性过氧化物 → 须新鲜/含稳定剂'], { ign: 160 });
  L('C8H8', '苯乙烯', 'C6H5CH=CH2', 'C8H8', 0.906, 145, 31, ['易燃', '蒸气有害', '含阻聚剂；聚合强放热，可失控'], {});
  L('C57H104O6', '橄榄油 (三油酸甘油酯)', 'C₅₇H₁₀₄O₆', 'C57H104O6', 0.915, null, 225, [], { fdisp: 'C57H104O6' });
  L('ClCO(CH2)4COCl', '己二酰氯', 'ClCO(CH2)4COCl', 'ClCO(CH2)4COCl', 1.26, 105, 72, ['腐蚀性、催泪', '遇水放出 HCl'], {});
  R('H2N(CH2)6NH2', '1,6-己二胺', '有机物', 's', 'H2N(CH2)6NH2', { f: 'H2N(CH2)6NH2', rho: 0.89, mp: 42, color: '#f8f8f8', hz: ['腐蚀性', '有害'] });
  R('C2H5ONa', '乙醇钠', '有机物', 's', 'C2H5ONa', { f: 'C2H5ONa', rho: 0.87, color: '#f2ead8', hz: ['强碱、遇水剧烈反应放热', '易燃固体', '腐蚀性'] });
  R('PS', '聚苯乙烯 (泡沫塑料)', '有机物', 's', '[C8H8]', { f: '(C8H8)n', rho: 1.05, color: '#f6f6f6', hz: ['可燃(冒黑烟)'] });
  // 无机 / 盐
  const sa = (id, name, cat, sp, diss, sol, rho, color, hz, pKa) => R(id, name, cat, 's', sp, { f: id, diss, sol, rho, color, hz: hz || [], pKa: pKa || null, solution: true });
  sa('NaBr', '溴化钠', '盐', 'NaBr', { 'Na+': 1, 'Br-': 1 }, [[0, 79.5], [20, 90.5], [100, 121]], 3.2, '#f8f8f8');
  sa('SrCl2', '氯化锶', '盐', 'SrCl2', { 'Sr^2+': 1, 'Cl-': 2 }, [[0, 43.5], [20, 53.8], [100, 100]], 3.05, '#f6f6f6', ['有害']);
  sa('LiCl', '氯化锂', '盐', 'LiCl', { 'Li+': 1, 'Cl-': 1 }, [[0, 69], [20, 83], [100, 128]], 2.07, '#f6f6f6', ['有害']);
  sa('NiSO4', '硫酸镍', '盐', 'NiSO4', { 'Ni^2+': 1, 'SO4^2-': 1 }, [[0, 29.3], [20, 44.4], [100, 76.7]], 3.68, '#6dbf6d', ['致癌、致敏', '对水生生物极毒']);
  sa('Na2S2O3', '硫代硫酸钠', '盐', 'Na2S2O3', { 'Na+': 2, 'S2O3^2-': 1 }, [[0, 50], [20, 70], [40, 103]], 1.67, '#f8f8f8', ['遇酸分解析出硫、放出 SO₂']);
  sa('K2S2O8', '过硫酸钾', '氧化剂', 'K2S2O8', { 'K+': 2, 'S2O8^2-': 1 }, [[0, 1.76], [20, 4.7], [40, 8.0]], 2.48, '#fafafa', ['强氧化剂；与有机物/还原剂混合可着火', '致敏']);
  R('Ni', '镍片/镍粉', '金属', 's', 'Ni', { f: 'Ni', rho: 8.9, mp: 1455, color: '#b9bcc0', hz: ['致敏、可疑致癌物'], eo: -0.257 });
  R('Cu2O', '氧化亚铜 (红色)', '氧化物', 's', 'Cu2O', { f: 'Cu2O', rho: 6.0, color: '#c0391b', hz: ['有害'] });
  // 水合盐
  R('CaSO4·2H2O', '石膏 (二水硫酸钙)', '盐', 's', 'CaSO4·2H2O', { f: 'CaSO4·2H2O', rho: 2.32, color: '#f6f6f2', hz: [] });
  R('MgSO4·7H2O', '泻盐 (七水硫酸镁)', '盐', 's', 'MgSO4·7H2O', { f: 'MgSO4·7H2O', rho: 1.68, diss: { 'Mg^2+': 1, 'SO4^2-': 1, 'H2O': 7 }, sol: [[0, 70], [20, 113], [60, 200]], color: '#f8f8f8', hz: [], solution: true });
  R('Na2CO3·10H2O', '洗涤碱 (十水碳酸钠)', '盐', 's', 'Na2CO3·10H2O', { f: 'Na2CO3·10H2O', rho: 1.46, diss: { 'Na+': 2, 'CO3^2-': 1, 'H2O': 10 }, sol: [[0, 21.5], [20, 21.5 * 1.8], [30, 38.8]], color: '#f8f8f8', hz: ['刺激'], solution: true });
  // 溴 / 溴水 / 氢溴酸 / 专用试剂
  R('Br2', '液溴', '卤素', 'l', 'Br2', { f: 'Br2', rho: 3.10, bp: 59, color: '#8b2a10', miscible: false, hz: ['剧毒、强腐蚀、强氧化性，蒸气极刺激', '切勿与氨、丙酮、甲苯等混合 (引擎对此类组合返回"不支持")'] });
  R('Br2water', '溴水 (饱和约 0.2 M)', '卤素', 'aq', null, { f: 'Br2(aq)', M: 159.808, diss: { 'Br2(aq)': 1 }, cmax: 0.21, cpre: [0.05, 0.1, 0.21], dk: 0.02, color: '#e5842a', hz: ['腐蚀性、有毒', '强氧化性'], pKa: '—' });
  R('HBr', '氢溴酸 (最浓约 48%, 8.8 M)', '酸', 'aq', null, { f: 'HBr', M: 80.912, diss: { 'H+': 1, 'Br-': 1 }, cmax: 8.8, cpre: [0.1, 1, 5, 8.8], dk: 0.05, color: '#f4f8f8', hz: ['强酸，腐蚀性，刺激性烟雾'], pKa: '强酸 (pKa ≈ −9)' });
  R('Tollens', '银氨溶液 (Tollens 试剂, 现配现用)', '专用试剂', 'aq', null, { f: '[Ag(NH3)2]OH', M: 158.9, diss: { 'Ag(NH3)2+': 1, 'OH-': 1, 'NH3(aq)': 2 }, cmax: 0.1, cpre: [0.02, 0.05, 0.1], dk: 0.02, color: '#f4f6f6', hz: ['必须现配现用，不得存放：久置会析出易爆的雷酸银/氮化银类沉淀', '试验后立即用稀 HNO₃ 酸化处理废液并回收银', '氨水刺激性'], pKa: '碱性 (含游离 NH₃)' });
  R('Fehling', '斐林试剂 (新配, 铜-酒石酸盐碱性液)', '专用试剂', 'aq', null, { f: 'Cu(C4H4O6)2^2-', fdisp: 'Cu(C4H4O6)2^2-', M: 360, diss: { 'Cu(C4H4O6)2^2-': 1, 'Na+': 8, 'OH-': 6 }, cmax: 0.07, cpre: [0.035, 0.07], dk: 0.08, color: '#1a49d0', hz: ['强碱性、腐蚀', '含铜，对水生生物有毒'], pKa: '强碱性' });

  // 催化剂 / 条件
  CATALYSTS.push({ id: 'Pd', name: '钯/炭 (Pd/C, 氢化)' }, { id: 'Ni', name: '雷尼镍 (Ni, 氢化)' }, { id: 'FeBr3', name: '无水 FeBr₃ / 铁粉 (路易斯酸)' }, { id: 'PTSA', name: '对甲苯磺酸 (酸催化, 催化量)' });

  // 焰色试验: [阳离子/金属, 颜色名, hex, 特征波长 nm, 备注]
  const FLAME = [
    { ion: 'Li+', cn: '锂', color: '#e0204a', name: '深红色(胭脂红)', nm: '670.8', note: '' },
    { ion: 'Na+', cn: '钠', color: '#ffd21a', name: '亮黄色', nm: '589.0/589.6', note: '极灵敏且持久，会掩盖其他颜色；常用蓝色钴玻璃滤去' },
    { ion: 'K+', cn: '钾', color: '#b58cf0', name: '淡紫色(透过蓝色钴玻璃观察)', nm: '766.5/769.9', note: '易被钠黄光掩盖，需透过蓝色钴玻璃观察' },
    { ion: 'Ca^2+', cn: '钙', color: '#ff7a2a', name: '砖红色(橙红)', nm: '622 (CaOH 带)', note: '' },
    { ion: 'Sr^2+', cn: '锶', color: '#ff2a2a', name: '洋红/猩红色', nm: '606–688 (SrOH 带), 461', note: '' },
    { ion: 'Ba^2+', cn: '钡', color: '#9ccf3a', name: '黄绿色', nm: '514, 524, 553', note: '' },
    { ion: 'Cu^2+', cn: '铜', color: '#2fd0b0', name: '绿色/蓝绿色', nm: '510–530 (CuCl 带 ~ 420–460 蓝)', note: '卤化铜(CuCl₂)带蓝色外焰' },
  ];

  D.FLAME = FLAME;
  D.LAZY2 = true;
  if (typeof module !== 'undefined' && module.exports) module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
