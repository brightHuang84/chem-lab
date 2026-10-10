/* 虚拟化学实验室 —— 化学平衡 (Le Chatelier) 与反应动力学(轻量)
 * 1) Fe³⁺ + SCN⁻ ⇌ FeSCN²⁺ (浓度扰动)  2) 2 CrO₄²⁻ + 2 H⁺ ⇌ Cr₂O₇²⁻ + H₂O (pH)
 * 3) N₂O₄ ⇌ 2 NO₂ (温度/压强, 由 ΔfH°、S° 经 van't Hoff 得 Kp)  4) Cu²⁺ + 4 Cl⁻ ⇌ CuCl₄²⁻ (Cl⁻ 浓度)
 * 5) 碘钟 (过硫酸盐-碘离子-硫代硫酸盐) 动力学 + Arrhenius 温度效应
 */
(function (g) {
  'use strict';
  const R = 8.314462;
  // ---- 1. Fe3+ / SCN- ----
  const K_FESCN = 890; // L/mol (与 data.js 中 EQ 'FeSCN' 一致)
  function feScn(Fe0, S0, K) {
    K = K || K_FESCN; // x/((a-x)(b-x)) = K → K x² − (K(a+b)+1) x + K a b = 0
    const a = Fe0, b = S0; const B = K * (a + b) + 1; const disc = B * B - 4 * K * K * a * b; const x = (B - Math.sqrt(Math.max(disc, 0))) / (2 * K);
    return { x, Fe: a - x, SCN: b - x, K, Q: x / ((a - x) * (b - x)) || 0, absorb: x }; // 吸光度 ∝ [FeSCN2+]
  }
  // 在平衡态加入 dFe / dSCN (mol/L, 体积变化忽略) 后: 返回 Q, 方向与新平衡
  function perturb(state, dFe, dSCN, K) {
    K = K || K_FESCN; const a = state.Fe + state.x + (dFe || 0), b = state.SCN + state.x + (dSCN || 0);
    const Q = Math.max(state.x, 1e-300) / (Math.max(state.Fe + (dFe || 0), 1e-300) * Math.max(state.SCN + (dSCN || 0), 1e-300));
    const eq = feScn(Math.max(a, 0), Math.max(b, 0), K);
    return { Q, K, dir: Q < K ? 'right' : (Q > K ? 'left' : 'none'), eq };
  }
  // ---- 2. 铬酸根/重铬酸根 ----
  const K_CR = 4.2e14; // [Cr2O7]/([CrO4]^2[H+]^2), 25 °C (常用教材值)
  function chromate(Ctot, pH) { // Ctot = n(Cr) mol/L; 2 CrO4 -> Cr2O7
    const h2 = Math.pow(10, -2 * pH); const k = K_CR * h2; // [Cr2O7] = k [CrO4]^2 ; Ctot = [CrO4] + 2 k [CrO4]^2
    const a = 2 * k, b = 1, c = -Ctot; const cro4 = a > 1e-300 ? (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a) : Ctot; const cr2 = k * cro4 * cro4;
    return { CrO4: cro4, Cr2O7: cr2, fracDichromate: 2 * cr2 / Ctot, pHmid: null };
  }
  function chromateMidpoint(Ctot) { // 两种形式各占 50% (按 Cr 原子计)
    let lo = 0, hi = 14; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; const f = chromate(Ctot, m).fracDichromate; if (f > 0.5) lo = m; else hi = m; } return (lo + hi) / 2;
  }
  // ---- 3. N2O4 <=> 2 NO2 ----
  const NO2 = { H: 33.2, S: 240.1 }, N2O4 = { H: 9.2, S: 304.3 }; // kJ/mol, J/mol/K (气态, 298 K)
  function kpN2O4(Tc) { const TK = Tc + 273.15; const dH = 2 * NO2.H - N2O4.H, dS = 2 * NO2.S - N2O4.S; const dG = dH - TK * dS / 1000; return { Kp: Math.exp(-dG * 1000 / (R * TK)), dH, dS, dG }; }
  function no2(Tc, P) { // P: 总压 atm; α = 解离度(以 N2O4 计)
    const k = kpN2O4(Tc).Kp; const alpha = Math.sqrt(k / (k + 4 * P)); const yNO2 = 2 * alpha / (1 + alpha);
    return { Kp: k, alpha, yNO2, pNO2: yNO2 * P, pN2O4: (1 - yNO2) * P, Tc, P };
  }
  // ---- 4. Cu2+ / Cl- ----
  const K_CUCL = 1.6e-3; // [CuCl4]/([Cu][Cl]^4) (近似, 使 ~5 mol/L Cl⁻ 时约各半)
  function cuCl(Cu0, Cl) { const k = K_CUCL * Math.pow(Cl, 4); const frac = k / (1 + k); return { CuCl4: Cu0 * frac, Cu: Cu0 * (1 - frac), frac, K: K_CUCL }; }
  // ---- 5. 碘钟 ----
  const CLOCK = { k25: 5.0e-3, Ea: 52000 }; // L/mol/s (近似的教学参数), J/mol
  function kT(Tc, k25, Ea) { k25 = k25 || CLOCK.k25; Ea = Ea || CLOCK.Ea; return k25 * Math.exp(-Ea / R * (1 / (Tc + 273.15) - 1 / 298.15)); }
  // 浓度均为混合后的浓度 (mol/L). 速率 v = k[S2O8][I-]; 每 1 mol I2 消耗 2 mol S2O3 → 变色时间 t = [S2O3]0 / (2 v)
  function clock(S2O8, I, S2O3, Tc, k25, Ea) {
    const k = kT(Tc, k25, Ea), v = k * S2O8 * I; const tc = S2O3 > 0 && v > 0 ? S2O3 / (2 * v) : 0;
    return { k, v, tClock: tc, Ea: Ea || CLOCK.Ea, order: 'v = k[S₂O₈²⁻][I⁻] (总二级)' };
  }
  function clockTrace(p, tEnd, n) {
    const c = clock(p.S2O8, p.I, p.S2O3, p.T, p.k25, p.Ea); const out = [];
    for (let i = 0; i <= n; i++) { const t = tEnd * i / n; const consumed = Math.min(p.S2O3, 2 * c.v * t); const I2 = Math.max(0, c.v * (t - c.tClock)); out.push({ t, S2O3: p.S2O3 - consumed, I2 }); }
    return { c, pts: out };
  }
  // 反应速率的温度因子 (Arrhenius)
  function arrhenius(k1, T1c, T2c, Ea) { return k1 * Math.exp(-Ea / R * (1 / (T2c + 273.15) - 1 / (T1c + 273.15))); }
  const API = { feScn, perturb, chromate, chromateMidpoint, kpN2O4, no2, cuCl, clock, clockTrace, kT, arrhenius, K_FESCN, K_CR, K_CUCL, CLOCK };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else g.ChemEquil = API;
})(typeof window !== 'undefined' ? window : globalThis);
