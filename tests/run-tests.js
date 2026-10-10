/* 虚拟化学实验室 —— 计算正确性验证脚本。运行: node tests/run-tests.js */
'use strict';
const E = require('../js/sim.js');
const D = E.D, SP = E.SP;
let pass = 0, fail = 0; const failures = [];
function ok(cond, name, detail) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; failures.push(name); console.log('  ✗ ' + name + (detail !== undefined ? '   → ' + detail : '')); } }
function near(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name + ' (得到 ' + (typeof a === 'number' ? a.toPrecision(5) : a) + ', 期望 ' + b + ' ±' + tol + ')', a); }
const S = (rid, v, c) => ({ rid, mode: 'solution', volume: v, conc: c }), Mm = (rid, m) => ({ rid, mode: 'solid', mass: m }), Lq = (rid, v) => ({ rid, mode: 'liquid', volume: v });
const run = (adds, extra) => E.run(Object.assign({ additions: adds }, extra || {}));
const main = r => r.events.filter(e => !e.minor)[0];
const solidOf = (r, id) => r.solids.find(s => s.id === id);
const section = t => console.log('\n■ ' + t);

section('0. 数据库完整性');
ok(D.REAG.length >= 60, '试剂数 ≥ 60', D.REAG.length);
ok(D.REAG.every(r => r.name && r.f && r.color && r.cat), '每个试剂都有名称/化学式/颜色/分类');
ok(D.REAG.every(r => (r.M || (SP[r.sp] && SP[r.sp].M)) > 0), '每个试剂都有摩尔质量');
ok(D.REAG.filter(r => r.dHf !== undefined || (SP[r.sp] && SP[r.sp].H !== undefined)).length >= 55, '绝大多数试剂含 ΔfH°');
ok(D.molarMass('C9H8O4') > 180.1 && D.molarMass('C9H8O4') < 180.2, '阿司匹林摩尔质量 180.16', D.molarMass('C9H8O4'));
ok(D.molarMass('Al2(SO4)3') > 342 && D.molarMass('Al2(SO4)3') < 342.3, '含括号公式 Al2(SO4)3 = 342.15', D.molarMass('Al2(SO4)3'));

section('1. 25 mL 0.1 M HCl + 25 mL 0.1 M NaOH (保温杯量热计)');
let r = run([S('HCl', 25, 0.1), S('NaOH', 25, 0.1)], { vessel: 'calor' });
ok(r.status === 'reaction', '发生反应 (酸碱中和)');
near(r.solution.pH, 7.0, 0.01, 'pH = 7');
near(r.energy.Q, 0.1396, 0.004, '放热 Q = 2.5 mmol × 55.8 kJ/mol ≈ 0.140 kJ');
near(r.energy.dT, 0.1396e3 / (50 * 4.184 * 1.0), 0.06, 'ΔT = Q/(m·c) ≈ 0.67 K (热量 0.14 kJ; 溶液 ~50 g)');
console.log('    说明: 题设“ΔT≈0.14 K”实为 Q≈0.14 kJ 的数值; 50 g 溶液 (c=4.18 J/g/K) 的理想绝热温升应为 ≈0.67 K，引擎按物理公式给出。');
r = run([S('HCl', 25, 0.1), S('NaOH', 25, 0.1)]);
ok(r.energy.dT > 0.45 && r.energy.dT < 0.7, '烧杯(含玻璃热容 45 J/K)中 ΔT ≈ 0.55 K', r.energy.dT);

section('2. 0.1 M 醋酸 pH');
r = run([S('CH3COOH', 100, 0.1)]);
near(r.solution.pH, 2.88, 0.01, 'pH(0.1 M HAc) ≈ 2.88 (Ka=1.74e-5)');
ok(r.status === 'physical', '单一试剂: 无化学反应', r.status);
r = run([S('CH3COOH', 50, 0.2), S('CH3COOH', 0.0001, 1)]); // 稀释无意义，仅检查不崩溃
r = run([S('CH3COOH', 25, 0.2), S('NaOH', 25, 0.1)]);
near(r.solution.pH, 4.76, 0.02, '半中和缓冲液 pH = pKa = 4.76');
r = run([S('NaOH', 100, 0.1)]); near(r.solution.pH, 13.0, 0.01, '0.1 M NaOH pH = 13.00');
r = run([S('NH3', 100, 0.1)]); near(r.solution.pH, 11.13, 0.02, '0.1 M NH3 pH ≈ 11.13');
r = run([S('H3PO4', 100, 0.1)]); near(r.solution.pH, 1.62, 0.04, '0.1 M H3PO4 pH ≈ 1.6 (只计 Ka1)');
r = run([S('Na2CO3', 100, 0.1)]); near(r.solution.pH, 11.66, 0.05, '0.1 M Na2CO3 pH ≈ 11.6–11.7');

section('3. 置换反应 (活动性 / E°)');
r = run([Mm('Zn', 1.0), S('CuSO4', 50, 0.1)]);
ok(r.status === 'reaction' && /Cu/.test(E.plain(main(r).eq)), 'Zn + CuSO4 → Cu + ZnSO4 发生', r.verdict);
near(r.energy.Q, 0.005 * 218.7 * 1.0 * 0.999, 0.03, 'Zn+Cu²⁺ ΔH ≈ −218.7 kJ/mol × 5 mmol ≈ 1.09 kJ');
near(solidOf(r, 'Cu').formed * 63.546, 0.3177, 0.003, '析出 Cu 0.318 g (5 mmol 受 Cu²⁺ 限制)');
ok(main(r).balance === undefined || main(r).balance.ok, '方程式原子/电荷守恒');
r = run([Mm('Cu', 1.0), S('ZnSO4', 50, 0.1)]);
ok(r.status === 'none' && /E°cell|不能自发/.test(r.reasons.join('')), 'Cu + ZnSO4 不反应, 给出 E°cell<0 依据', r.verdict);
r = run([Mm('Fe', 1.0), S('CuSO4', 50, 0.1)]); ok(r.status === 'reaction', 'Fe + CuSO4 反应');
r = run([Mm('Cu', 1.0), S('HCl', 50, 1)]); ok(r.status === 'none', 'Cu + 稀盐酸 不反应 (氢后金属)');
r = run([Mm('Zn', 1.0), S('HCl', 50, 1)]);
ok(r.status === 'reaction' && r.gases[0] && r.gases[0].id === 'H2', 'Zn + HCl 放出 H2');
near(r.gases[0].n, 1 / 65.38, 2e-4, 'H2 物质的量 = n(Zn)');
near(r.gases[0].V_STP * 1000, 342.9, 2, 'H2 STP 体积 ≈ 343 mL');
r = run([Mm('Na', 0.23), Lq('H2O', 100)]);
ok(r.status === 'reaction' && r.solution.pH > 12.9, '钠 + 水: 反应, 强碱性 pH≈13');
near(r.gases[0].n * 1000, 5.0, 0.05, '钠 0.23 g → H2 5.0 mmol');
ok(r.hazards.join('').includes('H₂') || r.hazards.join('').includes('钠'), '给出危险提示');
r = run([Mm('Al', 1), S('NaOH', 50, 1)]); ok(r.status === 'reaction' && r.gases.some(g => g.id === 'H2'), '铝 + NaOH(aq) 放 H2 (两性)');
r = run([Mm('Mg', 0.5), S('HCl', 50, 1)]); ok(r.status === 'reaction', 'Mg + HCl 反应');
r = run([Mm('Ag', 1), S('HCl', 50, 1)]); ok(r.status === 'none', 'Ag + HCl 不反应');

section('4. 沉淀 (Ksp)');
r = run([S('AgNO3', 25, 0.1), S('NaCl', 25, 0.1)]);
ok(r.status === 'reaction' && solidOf(r, 'AgCl'), 'AgNO3 + NaCl → AgCl↓');
near(solidOf(r, 'AgCl').formed * 143.32, 0.3583, 0.002, 'AgCl 沉淀 0.358 g');
ok(/Ksp|Qsp/.test(main(r).why), '判据包含 Qsp 与 Ksp');
ok(r.limiting.length > 0, '给出限量试剂');
r = run([S('BaCl2', 25, 0.1), S('Na2SO4', 25, 0.1)]); near(solidOf(r, 'BaSO4').formed * 233.39, 0.5834, 0.003, 'BaSO4 沉淀 0.583 g');
r = run([S('CuSO4', 25, 0.1), S('NaOH', 50, 0.1)]); ok(solidOf(r, 'Cu(OH)2') && solidOf(r, 'Cu(OH)2').formed > 2e-3, 'Cu²⁺ + 2OH⁻ → Cu(OH)2↓ (蓝色)');
r = run([S('Pb(NO3)2', 25, 0.1), S('KI', 25, 0.2)]); ok(solidOf(r, 'PbI2') && solidOf(r, 'PbI2').formed > 2.3e-3, 'Pb²⁺ + 2I⁻ → PbI2↓ (黄色)');
r = run([S('NaCl', 25, 0.1), S('KNO3', 25, 0.1)]); ok(r.status === 'none', 'NaCl + KNO3 无反应 (全部可溶、无弱电解质)', r.verdict);
r = run([S('CuSO4', 10, 0.1), S('NH3', 10, 2)]); ok(r.status === 'reaction' && /Cu\(NH₃\)₄|Cu\(NH3\)4/.test(E.plain(main(r).eq)), 'Cu²⁺ + 过量 NH3 → [Cu(NH3)4]²⁺ 配位');

section('5. 气体逸出 / 酸碱');
r = run([Mm('NaHCO3', 0.84), S('HCl', 20, 1)]); ok(r.gases[0] && r.gases[0].id === 'CO2', 'NaHCO3 + HCl 放 CO2');
near(r.gases[0].n * 1000, 8.8, 1.0, 'CO2 ≈ 10 mmol (部分留在溶液中)');
r = run([Mm('CaCO3', 1), S('CH3COOH', 50, 1)]); ok(r.gases.some(g => g.id === 'CO2') && r.status === 'reaction', 'CaCO3 + 醋酸 放 CO2');
r = run([Mm('NH4Cl', 1), Mm('Ca(OH)2', 1)], {}); ok(r.status !== 'reaction', '固体 NH4Cl + Ca(OH)2 常温不反应 (需加热)', r.verdict);

section('6. 氧化还原');
r = run([S('KMnO4', 20, 0.02), S('FeSO4', 25, 0.1), S('H2SO4', 10, 1)]); ok(r.status === 'reaction', 'KMnO4 + Fe²⁺ (酸性) 反应');
ok(/5 Fe/.test(E.plain(main(r).eq)), '配平 MnO4⁻ + 5Fe²⁺ + 8H⁺', E.plain(main(r).eq));
ok(main(r).balance && main(r).balance.ok, '原子与电荷守恒');
r = run([S('H2O2', 25, 0.88)]); ok(r.status !== 'reaction', 'H2O2 常温无催化剂: 动力学稳定');
r = run([S('H2O2', 25, 0.88), Mm('MnO2', 0.2)]); ok(r.status === 'reaction' && r.gases.some(g => g.id === 'O2'), 'H2O2 + MnO2 催化分解放 O2');

section('7. 有机: 酰化 / 酯化');
r = run([Mm('C7H6O3', 2.0), Lq('C4H6O3', 5)], { catalyst: 'H2SO4', T0: 70, plate: true });
ok(r.status === 'reaction', '水杨酸 + 乙酸酐 (酸催化, 70 °C) → 阿司匹林');
const asp = r.yields.find(y => y.id === 'C9H8O4');
near(asp.mTheo, 2.0 / 138.121 * 180.159, 0.01, '理论产量 = 2.0 g ÷138.12 × 180.16 = 2.609 g');
near(asp.mTheo * 0.75, 1.957, 0.01, '75% 产率 → 实际 1.957 g');
ok(r.limiting.some(l => /水杨酸/.test(l.name)), '限量试剂为水杨酸 (乙酸酐过量)', JSON.stringify(r.limiting));
r = run([Mm('C7H6O3', 2.0), Lq('C4H6O3', 5)]); ok(r.status !== 'reaction', '无催化剂/常温: 速率过慢，不反应 (给出原因)', r.verdict);
r = run([Lq('CH3COOH', 10), Lq('C2H5OH', 10)], { catalyst: 'H2SO4', T0: 70, plate: true });
ok(r.yields.length && r.yields[0].eqPct > 55 && r.yields[0].eqPct < 80, '酯化平衡: K≈4, 近等摩尔 → 转化率 ≈ 67%', r.yields[0] && r.yields[0].eqPct);
r = run([Lq('CH3COOH', 10), Lq('C2H5OH', 10)]); ok(r.status !== 'reaction', '酯化无强酸催化/常温: 不反应');

section('8. 燃烧 / 热分解 / 电解 / 浓酸');
r = run([Mm('Mg', 1)], { ignite: true, vessel: 'crucible' }); ok(r.status === 'reaction' && solidOf(r, 'MgO'), '镁燃烧 → MgO');
near(solidOf(r, 'MgO').m, 1.658, 0.01, 'MgO 质量 1.658 g');
near(r.energy.Q, 601.6 / 24.305, 0.5, 'Mg 燃烧放热 ≈ 24.75 kJ/g (ΔfH°(MgO) = −601.6 kJ/mol)');
r = run([Mm('Mg', 1)], { vessel: 'crucible' }); ok(r.status !== 'reaction', '镁无点火源/常温: 不燃烧');
r = run([Lq('C2H5OH', 5)], { ignite: true, vessel: 'crucible' }); ok(r.status === 'reaction' && r.gases.some(g => g.id === 'CO2'), '乙醇燃烧 → CO2 + H2O');
r = run([Mm('CaCO3', 5)], { T0: 900, plate: true, vessel: 'crucible' }); ok(r.status === 'reaction' && solidOf(r, 'CaO'), 'CaCO3 900 °C 分解 → CaO + CO2');
near(solidOf(r, 'CaO').m, 2.801, 0.01, 'CaO 2.80 g');
r = run([Mm('CaCO3', 5)], { T0: 300, plate: true, vessel: 'crucible' }); ok(r.status !== 'reaction', 'CaCO3 300 °C: ΔG>0, 不分解');
r = run([S('CuSO4', 100, 0.1)], { electro: { on: true, V: 5, I: 1, t: 600, electrode: 'graphite' } });
ok(r.status === 'reaction' && r.electro, 'CuSO4 电解');
near(solidOf(r, 'Cu').m, 600 / 96485 / 2 * 63.546, 0.003, '法拉第定律: m(Cu) = It M/(zF) = 0.198 g');
ok(r.solution.pH < 3, '阳极放 O2, 溶液变酸', r.solution.pH);
r = run([Mm('C12H22O11', 5), S('H2SO4', 10, 18.4)]); ok(r.status === 'reaction' && solidOf(r, 'C'), '浓硫酸使蔗糖脱水炭化');
r = run([Mm('KMnO4', 5), Lq('C3H8O3', 2)], { vessel: 'crucible' }); ok(r.status === 'reaction' && /氧化剂/.test(r.events[0].type), '强氧化剂 + 有机物: 剧烈放热反应');

section('9. 诚实性: 无数据 / 不支持');
r = run([Lq('C6H14', 10), S('KMnO4', 10, 0.02)]); ok(r.status === 'nodata', '引擎无该组合数据 → 返回“引擎无数据”而非编造', r.status + ' ' + r.verdict);
r = run([S('HNO3', 10, 15), Lq('C3H8O3', 5), S('H2SO4', 10, 18)]); ok(r.status === 'unsupported', '受限类别组合 → “不支持”', r.status);
r = run([]); ok(r.status === 'invalid', '空容器 → 提示加入试剂');

section('10. 方程式守恒 (批量检查所有事件的原子/电荷平衡)');
const battery = [[S('HCl', 25, 0.1), S('NaOH', 25, 0.1)], [Mm('Zn', 1), S('CuSO4', 50, 0.1)], [S('AgNO3', 25, 0.1), S('NaCl', 25, 0.1)], [Mm('Na', 0.23), Lq('H2O', 100)], [Mm('Zn', 1), S('HCl', 50, 1)], [Mm('CaCO3', 1), S('CH3COOH', 50, 1)], [Mm('NaHCO3', 0.84), S('HCl', 20, 1)], [S('KMnO4', 20, 0.02), S('FeSO4', 25, 0.1), S('H2SO4', 10, 1)], [Mm('Al', 1), S('NaOH', 50, 1)], [Mm('Na2CO3', 1), S('HCl', 50, 0.5)], [Mm('Fe', 1), S('CuSO4', 50, 0.1)], [S('CuSO4', 10, 0.1), S('NH3', 10, 2)], [S('Pb(NO3)2', 25, 0.1), S('KI', 25, 0.2)], [S('FeCl3', 10, 0.1), S('NaOH', 40, 0.1)]];
let nev = 0, nbad = 0; battery.forEach(a => { const x = run(a); (x.events || []).forEach(e => { if (e.qual) return; nev++; if (e.balance && !e.balance.ok) { nbad++; console.log('    不平衡:', E.plain(e.eq), JSON.stringify(e.balance)); } }); });
ok(nbad === 0, '共 ' + nev + ' 个反应事件，全部原子与电荷守恒', nbad + ' 个不平衡');

section('11. 滴定曲线');
const crv = (a, t, V, st) => E.titrationCurve({ analyte: a, titrant: t }, V, st || 0.5);
let c = crv({ rid: 'HCl', V: 25, c: 0.1 }, { rid: 'NaOH', c: 0.1 }, 50);
ok(c.eq.length === 1, 'HCl/NaOH 一个等当点'); near(c.eq[0].v, 25, 0.05, '等当体积 25.00 mL'); near(c.eq[0].pH, 7.0, 0.1, '等当点 pH 7');
near(E.titrationPH({ analyte: { rid: 'HCl', V: 25, c: 0.1 }, titrant: { rid: 'NaOH', c: 0.1 } }, 24.9), 3.70, 0.03, '差 0.1 mL (−0.4%): [H⁺]=0.01 mmol/49.9 mL → pH ≈ 3.70');
near(E.titrationPH({ analyte: { rid: 'HCl', V: 25, c: 0.1 }, titrant: { rid: 'NaOH', c: 0.1 } }, 25.1), 10.30, 0.03, '过 0.1 mL: pH ≈ 10.30');
c = crv({ rid: 'CH3COOH', V: 25, c: 0.1 }, { rid: 'NaOH', c: 0.1 }, 50);
near(c.eq[0].v, 25, 0.05, '醋酸/NaOH 等当 25 mL'); near(c.eq[0].pH, 8.73, 0.05, '醋酸钠水解: 等当点 pH ≈ 8.73');
near(E.titrationPH({ analyte: { rid: 'CH3COOH', V: 25, c: 0.1 }, titrant: { rid: 'NaOH', c: 0.1 } }, 12.5), 4.76, 0.02, '半等当点 pH = pKa');
c = crv({ rid: 'H3PO4', V: 25, c: 0.1 }, { rid: 'NaOH', c: 0.1 }, 70);
ok(c.eq.length === 2 && Math.abs(c.eq[0].v - 25) < 0.1 && Math.abs(c.eq[1].v - 50) < 0.1, 'H3PO4: 两个突跃 25 / 50 mL', JSON.stringify(c.eq.map(e => e.v)));
c = crv({ rid: 'Na2CO3', V: 25, c: 0.1 }, { rid: 'HCl', c: 0.1 }, 60);
ok(c.eq.length === 2 && Math.abs(c.eq[0].v - 25) < 0.1 && Math.abs(c.eq[1].v - 50) < 0.1, 'Na2CO3/HCl: 两个突跃 25 / 50 mL', JSON.stringify(c.eq.map(e => e.v)));
c = crv({ rid: 'NH3', V: 25, c: 0.1 }, { rid: 'HCl', c: 0.1 }, 50);
near(c.eq[0].pH, 5.28, 0.1, 'NH3/HCl 等当点 pH ≈ 5.28 (NH4⁺ 水解)');

section('12. 指示剂');
const ind = D.INDICATORS.find(i => i.id === 'pp');
ok(E.indicatorColor(ind, 3).a < 0.05, '酚酞 pH 3 无色'); ok(E.indicatorColor(ind, 11).rgb[1] < 120, '酚酞 pH 11 粉红');

console.log('\n========================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) { console.log('失败项:\n - ' + failures.join('\n - ')); process.exit(1); }
