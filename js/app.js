/* 虚拟化学实验室 —— 界面逻辑 */
(function () {
  'use strict';
  const E = window.ChemEngine, D = E.D, SP = E.SP, REAGBY = E.REAGBY, fnum = E.fnum;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = E.plain;
  const FORMLABEL = { s: '固体', l: '液体', aq: '水溶液' };
  const state = { adds: [], sel: null, res: null, yieldPct: 100, nbKey: 'chemlab.notebook.v1' };
  const viz = new ChemViz.Viz($('#vessel'));

  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2400); }
  const molarMass = r => r.M || (r.sp && SP[r.sp] ? SP[r.sp].M : null);
  const fHtml = r => r.fdisp ? D.fmt(r.fdisp) : D.fmt(r.f || r.id);

  // ---------------- 标签页 ----------------
  $$('#tabs button').forEach(b => b.onclick = () => {
    $$('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    $$('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + b.dataset.view));
    if (b.dataset.view === 'titr') titrRefresh(); if (b.dataset.view === 'note') renderNotebook();
  });
  $$('.rtabs button').forEach(b => b.onclick = () => { $$('.rtabs button').forEach(x => x.classList.toggle('on', x === b)); $$('.rt').forEach(v => v.classList.toggle('on', v.id === 'rt-' + b.dataset.rt)); });

  // ---------------- 试剂架 ----------------
  const cats = ['全部'].concat(Array.from(new Set(D.REAG.map(r => r.cat))));
  $('#shelfCat').innerHTML = cats.map(c => '<option>' + c + '</option>').join('');
  function renderShelf() {
    const q = $('#shelfSearch').value.trim().toLowerCase(), c = $('#shelfCat').value;
    const list = D.REAG.filter(r => (c === '全部' || r.cat === c) && (!q || (r.name + r.f + (r.fdisp || '') + r.id).toLowerCase().includes(q)));
    $('#shelfList').innerHTML = list.map(r => '<div class="rcard' + (state.sel === r.id ? ' sel' : '') + '" data-id="' + esc(r.id) + '"><i class="sw" style="background:' + r.color + '"></i><div><b>' + esc(r.name) + '</b><span class="f">' + fHtml(r) + '</span></div><em class="tag t-' + r.form + '">' + FORMLABEL[r.form] + '</em></div>').join('') || '<p class="muted pad">无匹配试剂</p>';
    $$('.rcard', $('#shelfList')).forEach(el => el.onclick = () => { state.sel = el.dataset.id; renderShelf(); renderDetail(); });
  }
  $('#shelfSearch').oninput = renderShelf; $('#shelfCat').onchange = renderShelf;

  function solText(r) { return r.sol ? r.sol.map(p => p[0] + ' °C: ' + p[1] + ' g/100 g水').join('；') : (r.miscible ? '与水互溶' : null); }
  function renderDetail() {
    const r = REAGBY[state.sel]; const box = $('#reagentDetail'); if (!r) return;
    const M = molarMass(r); const H = r.dHf !== undefined ? r.dHf : (r.sp && SP[r.sp] ? SP[r.sp].H : null);
    const rows = [['化学式', fHtml(r)], ['摩尔质量', M ? fnum(M, 3) + ' g/mol' : '—'], ['状态', FORMLABEL[r.form] + (r.form === 'aq' ? '（商品为水溶液，按浓度×体积加入）' : '')], ['密度', r.rho ? r.rho + ' g/cm³' : (r.dk ? '溶液密度 ≈ 1 + ' + r.dk + '·c' : '—')], ['熔点/沸点', [r.mp !== undefined ? r.mp + ' °C' : '—', r.bp !== undefined ? r.bp + ' °C' : '—'].join(' / ')], ['pKa / Kb', r.pKa || '—'], ['ΔfH°(298 K)', H !== null && H !== undefined ? fnum(H, 1) + ' kJ/mol' : '数据缺失'], ['溶解度', (solText(r) || '—') + (r.ksp ? '；' + r.ksp : '')], ['颜色', '<i class="sw inl" style="background:' + r.color + '"></i> ' + r.color]];
    if (r.eo !== undefined) rows.push(['标准电极电势', 'E° = ' + r.eo + ' V']);
    const modes = []; if (r.form === 's') modes.push(['solid', '固体称量 (g)']); if (r.form === 'l') modes.push(['liquid', '液体量取 (mL)']); if (r.form === 'aq' || r.solution) modes.push(['solution', '配成水溶液 (mL × mol/L)']);
    const cpre = (r.cpre || [0.01, 0.1, 1]).concat(r.form === 's' && r.solution ? [] : []);
    box.innerHTML = '<h3>' + esc(r.name) + ' <small>' + esc(r.cat) + '</small></h3><table class="props">' + rows.map(x => '<tr><th>' + x[0] + '</th><td>' + x[1] + '</td></tr>').join('') + '</table>' +
      (r.hz && r.hz.length ? '<div class="hz">⚠ ' + r.hz.map(esc).join('；') + '</div>' : '') +
      '<div class="addform"><label>方式<select id="aMode">' + modes.map(m => '<option value="' + m[0] + '">' + m[1] + '</option>').join('') + '</select></label>' +
      '<label>量具<select id="aTool"></select></label>' +
      '<div class="row2"><label><span id="aLab1">质量 (g)</span><input id="aAmt" type="number" min="0" step="any" value="1"></label><label id="aConcWrap"><span>浓度 (mol/L)</span><input id="aConc" type="number" min="0" step="any" value="0.1"></label></div>' +
      '<div id="aPre" class="chips"></div>' +
      '<label>步骤 <input id="aStage" type="number" min="1" max="9" value="1" style="width:60px"></label>' +
      '<button id="aAdd" class="primary">＋ 加入容器</button></div>';
    const upd = () => {
      const mode = $('#aMode').value; $('#aConcWrap').style.display = mode === 'solution' ? '' : 'none';
      $('#aLab1').textContent = mode === 'solid' ? '质量 (g)' : '体积 (mL)';
      const tools = mode === 'solid' ? [['bal', '电子天平 (0.001 g)', 0.001]] : [['cyl', '量筒 (0.5 mL)', 0.5], ['pip', '移液管 (0.01 mL)', 0.01], ['bur', '滴定管 (0.01 mL)', 0.01]];
      $('#aTool').innerHTML = tools.map(t => '<option value="' + t[2] + '">' + t[1] + '</option>').join('');
      $('#aAmt').step = tools[0][2];
      if (mode === 'solution') { const mx = r.cmax || 18; $('#aPre').innerHTML = '常用浓度: ' + cpre.map(c => '<button class="chip" data-c="' + c + '">' + c + ' M</button>').join(''); $$('#aPre .chip').forEach(b => b.onclick = () => { $('#aConc').value = b.dataset.c; }); if ($('#aConc').value > mx) $('#aConc').value = mx; $('#aAmt').value = 25; }
      else { $('#aPre').innerHTML = ''; $('#aAmt').value = mode === 'solid' ? 1 : 10; }
    };
    $('#aMode').onchange = upd; $('#aTool').onchange = () => { $('#aAmt').step = $('#aTool').value; }; upd();
    $('#aAdd').onclick = () => {
      const mode = $('#aMode').value, res = parseFloat($('#aTool').value) || 0.001; let amt = parseFloat($('#aAmt').value);
      if (!(amt > 0)) return toast('请输入大于 0 的量');
      amt = Math.round(amt / res) * res; if (amt <= 0) amt = res; amt = +amt.toFixed(4);
      const a = { rid: r.id, mode, stage: parseInt($('#aStage').value) || 1 };
      if (mode === 'solid') a.mass = amt; else a.volume = amt;
      if (mode === 'solution') { const c = parseFloat($('#aConc').value); if (!(c > 0)) return toast('浓度必须 > 0'); a.conc = c; }
      state.adds.push(a); afterAddsChange(); toast('已加入 ' + r.name);
    };
  }

  // ---------------- 已加入列表 / 预览 ----------------
  function addMoles(a) { const r = REAGBY[a.rid]; const M = molarMass(r); if (a.mode === 'solid') return M ? a.mass / M : null; if (a.mode === 'solution') return a.volume * a.conc / 1000; return M && r.rho ? a.volume * r.rho / M : null; }
  function addDesc(a) { return a.mode === 'solid' ? fnum(a.mass, 3) + ' g' : (a.mode === 'solution' ? a.volume + ' mL × ' + a.conc + ' M' : a.volume + ' mL'); }
  function addMass(a) { const r = REAGBY[a.rid]; if (a.mode === 'solid') return a.mass; if (a.mode === 'liquid') return a.volume * (r.rho || 1); return a.volume * (1 + (r.dk || 0) * a.conc); }
  function renderAdds() {
    $('#addList').innerHTML = state.adds.length ? state.adds.map((a, i) => { const r = REAGBY[a.rid]; const n = addMoles(a); return '<div class="aitem"><i class="sw" style="background:' + r.color + '"></i><b>' + esc(r.name) + '</b> <span class="f">' + fHtml(r) + '</span><span class="amt">' + addDesc(a) + (n ? ' ≈ ' + fnum(n * 1000, 3) + ' mmol' : '') + '</span><span class="stg">步骤 ' + (a.stage || 1) + '</span><button class="x" data-i="' + i + '" title="移除">✕</button></div>'; }).join('') : '<p class="muted">容器是空的。</p>';
    $$('#addList .x').forEach(b => b.onclick = () => { state.adds.splice(+b.dataset.i, 1); afterAddsChange(); });
  }
  function collectSetup() {
    const T = parseFloat($('#tRange').value);
    const s = { additions: state.adds.map(a => Object.assign({}, a)), vessel: $('#vessel_sel').value, T0: T, plate: $('#plate').checked, ice: $('#ice').checked, catalyst: $('#catalyst').value, atmosphere: $('#atm').value, ignite: $('#ignite').checked, indicator: $('#indicator').value, stir: $('#stir').checked, light: $('#light').checked, flameTest: $('#flameTest').checked, corrosion: $('#corrosion').checked };
    if ($('#electro').checked) s.electro = { on: true, V: +$('#eV').value, I: +$('#eI').value, t: +$('#eT').value, electrode: $('#eElec').value, eff: +$('#eEff').value || 100, area: +$('#eArea').value || 0 };
    return s;
  }
  function afterAddsChange() {
    state.res = null; renderAdds(); updatePreview();
    $('#resultBox').className = 'muted pad'; $('#resultBox').innerHTML = state.adds.length ? '条件已改变。点击“开始反应”。' : '加入试剂后点击“开始反应”。';
    $('#phVal').textContent = '—'; $('#phName').textContent = '';
  }
  function updatePreview() {
    const setup = collectSetup(); viz.setKind((D.VESSELS.find(v => v.id === setup.vessel) || {}).kind || 'beaker');
    viz.stir = setup.stir; viz.plate = setup.plate; viz.ice = setup.ice;
    let mass = 0, vol = 0; state.adds.forEach(a => { mass += addMass(a); if (a.mode !== 'solid') vol += a.volume; });
    $('#balVal').textContent = fnum(mass, 3); $('#volVal').textContent = fnum(vol, 1);
    const ves = D.VESSELS.find(v => v.id === setup.vessel) || D.VESSELS[0];
    $('#vesselLabel').textContent = ves.name + (vol > ves.cap ? ' ⚠ 超出容量' : '');
    const T = setup.ice ? 0 : setup.T0; setThermo(T);
    if (!state.adds.length) { viz.setPreview({ level: 0 }); return; }
    const solids = state.adds.filter(a => a.mode === 'solid').map(a => ({ color: REAGBY[a.rid].color, amount: a.mass, metal: REAGBY[a.rid].cat === '金属', scale: 1 }));
    let c = [226, 242, 250], al = .4;
    try { const r = E.run(Object.assign({}, setup, { ignite: false, electro: null })); if (r.anim) { c = r.anim.c0; al = r.anim.a0; } } catch (e) { }
    viz.setPreview({ level: Math.min(1, vol / ves.cap) || 0, c, a: al, solids });
  }
  function setThermo(T) { $('#thermoVal').textContent = fnum(T, 1); $('#thermoFill').style.height = Math.max(4, Math.min(100, (T + 10) / 130 * 100)) + '%'; }
  viz.onTemp = setThermo;

  // ---------------- 设备控件 ----------------
  $('#vessel_sel').innerHTML = D.VESSELS.map(v => '<option value="' + v.id + '">' + v.name + '</option>').join('');
  $('#catalyst').innerHTML = D.CATALYSTS.map(v => '<option value="' + v.id + '">' + v.name + '</option>').join('');
  $('#indicator').innerHTML = D.INDICATORS.map(v => '<option value="' + v.id + '">' + v.name + (v.note ? ' (' + v.note + ')' : '') + '</option>').join('');
  $('#tRange').oninput = () => { $('#tVal').textContent = $('#tRange').value; updatePreview(); };
  ['vessel_sel', 'plate', 'ice', 'stir', 'catalyst', 'atm', 'ignite', 'indicator', 'light', 'flameTest', 'corrosion'].forEach(id => $('#' + id).onchange = () => { if (id === 'ice' && $('#ice').checked) { $('#plate').checked = false; } if (id === 'plate' && $('#plate').checked) $('#ice').checked = false; updatePreview(); });
  $('#electro').onchange = () => $('#electroBox').classList.toggle('hide', !$('#electro').checked);
  $('#btnClear').onclick = () => { state.adds = []; afterAddsChange(); };

  // ---------------- 示例 ----------------
  const S = (rid, v, c, st) => ({ rid, mode: 'solution', volume: v, conc: c, stage: st || 1 }), M = (rid, m, st) => ({ rid, mode: 'solid', mass: m, stage: st || 1 }), Lq = (rid, v, st) => ({ rid, mode: 'liquid', volume: v, stage: st || 1 });
  const EXAMPLES = [
    ['— 选择示例 —', null],
    ['中和热: 25 mL 0.1 M HCl + 25 mL 0.1 M NaOH (量热计)', { additions: [S('HCl', 25, 0.1), S('NaOH', 25, 0.1)], vessel: 'calor' }],
    ['0.1 M 醋酸的 pH (弱酸)', { additions: [S('CH3COOH', 100, 0.1)] }],
    ['置换: 锌 + 硫酸铜', { additions: [M('Zn', 1), S('CuSO4', 50, 0.1)] }],
    ['不反应: 铜 + 硫酸锌', { additions: [M('Cu', 1), S('ZnSO4', 50, 0.1)] }],
    ['沉淀: AgNO₃ + NaCl', { additions: [S('AgNO3', 25, 0.1), S('NaCl', 25, 0.1)] }],
    ['沉淀: Pb(NO₃)₂ + KI (黄色 PbI₂)', { additions: [S('Pb(NO3)2', 25, 0.1), S('KI', 25, 0.2)] }],
    ['沉淀→配位: CuSO₄ + 过量氨水', { additions: [S('CuSO4', 10, 0.1), S('NH3', 10, 2)] }],
    ['气体: 小苏打 + 盐酸', { additions: [M('NaHCO3', 0.84), S('HCl', 20, 1)] }],
    ['气体: 碳酸钙 + 醋酸', { additions: [M('CaCO3', 1), S('CH3COOH', 50, 1)] }],
    ['活泼金属: 钠 + 水', { additions: [M('Na', 0.23), Lq('H2O', 100)] }],
    ['金属 + 酸: 锌 + 盐酸', { additions: [M('Zn', 1), S('HCl', 50, 1)] }],
    ['两性金属: 铝 + NaOH', { additions: [M('Al', 1), S('NaOH', 50, 1)] }],
    ['氧化还原: KMnO₄ + FeSO₄ + H₂SO₄', { additions: [S('KMnO4', 20, 0.02), S('FeSO4', 25, 0.1), S('H2SO4', 10, 1)] }],
    ['催化分解: H₂O₂ + MnO₂', { additions: [S('H2O2', 25, 0.88), M('MnO2', 0.2)] }],
    ['酰化: 水杨酸 + 乙酸酐 → 阿司匹林 (酸催化 70 °C)', { additions: [M('C7H6O3', 2.0), Lq('C4H6O3', 5)], catalyst: 'H2SO4', T0: 70, plate: true }],
    ['酯化平衡: 乙酸 + 乙醇 (H₂SO₄ 催化, 70 °C)', { additions: [Lq('CH3COOH', 10), Lq('C2H5OH', 10)], catalyst: 'H2SO4', T0: 70, plate: true }],
    ['燃烧: 镁带', { additions: [M('Mg', 1)], ignite: true, vessel: 'crucible' }],
    ['燃烧: 乙醇', { additions: [Lq('C2H5OH', 5)], ignite: true, vessel: 'crucible' }],
    ['热分解: CaCO₃ 900 °C', { additions: [M('CaCO3', 5)], T0: 900, plate: true, vessel: 'crucible' }],
    ['强氧化剂 + 有机物: KMnO₄ + 甘油', { additions: [M('KMnO4', 5), Lq('C3H8O3', 2)], vessel: 'crucible' }],
    ['浓硫酸使蔗糖脱水', { additions: [M('C12H22O11', 5), S('H2SO4', 10, 18.4)] }],
    ['电解: CuSO₄ 溶液 (石墨电极)', { additions: [S('CuSO4', 100, 0.1)], electro: { on: true, V: 5, I: 1, t: 600, electrode: 'graphite' } }],
    ['显色: 水杨酸 + FeCl₃ (酚羟基检验)', { additions: [M('C7H6O3', 0.1), Lq('H2O', 50), S('FeCl3', 5, 0.1)] }],
    ['混合无反应: NaCl + KNO₃', { additions: [S('NaCl', 25, 0.1), S('KNO3', 25, 0.1)] }],
  ];
  if (window.ChemExamples2) window.ChemExamples2.forEach(e => EXAMPLES.push([e[0], e[1]]));
  $('#examples').innerHTML = EXAMPLES.map((e, i) => '<option value="' + i + '">' + e[0] + '</option>').join('');
  function loadSetup(s) {
    state.adds = (s.additions || []).map(a => Object.assign({}, a));
    $('#vessel_sel').value = s.vessel || 'beaker'; $('#tRange').value = s.T0 === undefined ? 25 : s.T0; $('#tVal').textContent = $('#tRange').value;
    $('#plate').checked = !!s.plate; $('#ice').checked = !!s.ice; $('#stir').checked = !!s.stir; $('#ignite').checked = !!s.ignite; $('#light').checked = !!s.light; $('#flameTest').checked = !!s.flameTest; $('#corrosion').checked = !!s.corrosion;
    $('#catalyst').value = s.catalyst || 'none'; $('#atm').value = s.atmosphere || 'air'; $('#indicator').value = s.indicator || 'none';
    $('#electro').checked = !!(s.electro && s.electro.on); $('#electroBox').classList.toggle('hide', !$('#electro').checked);
    if (s.electro) { $('#eV').value = s.electro.V; $('#eI').value = s.electro.I; $('#eT').value = s.electro.t; $('#eElec').value = s.electro.electrode || 'graphite'; $('#eEff').value = s.electro.eff || 100; $('#eArea').value = s.electro.area || 0; }
    afterAddsChange();
  }
  $('#examples').onchange = () => { const e = EXAMPLES[+$('#examples').value]; if (e[1]) { loadSetup(e[1]); react(); } };

  // ---------------- 运行 & 结果 ----------------
  function react() {
    const setup = collectSetup();
    const res = E.run(setup); state.res = res; state.setup = setup;
    renderResult(res, setup);
    if (res.anim) { res.anim.T0 = res.energy ? res.energy.T0 : 25; res.anim.Tfinal = res.energy ? res.energy.Tfinal : 25; res.anim.flameStay = !!(res.anim.flame && res.energy && res.energy.combustion); viz.setKind((D.VESSELS.find(v => v.id === setup.vessel) || {}).kind || 'beaker'); viz.stir = setup.stir; viz.plate = setup.plate; viz.ice = setup.ice; viz.play(res.anim); }
    if (res.solution && res.solution.pH !== null && res.solution.pH !== undefined) { $('#phVal').textContent = fnum(res.solution.pH, 2); $('#phName').textContent = phName(res.solution.pH); } else { $('#phVal').textContent = '—'; $('#phName').textContent = '无水相'; }
    if (res.energy && res.energy.Tfinal === null) $('#thermoVal').textContent = '火焰';
  }
  $('#btnReact').onclick = react;
  function phName(p) { return p < 3 ? '强酸性' : p < 6.5 ? '弱酸性' : p <= 7.5 ? '中性' : p < 11 ? '弱碱性' : '强碱性'; }
  const KIND_ICON = { gas: '🫧', precip: '⚪', solid: '🔶', color: '🎨', heat: '🔥', cold: '❄', smell: '👃', flame: '🔥', steam: '♨', smoke: '💨', electro: '⚡' };
  const sub = (title, body, cls) => '<section class="rsec ' + (cls || '') + '"><h4>' + title + '</h4>' + body + '</section>';
  function renderResult(res, setup) {
    const box = $('#resultBox'); box.className = 'resbox';
    let h = '<div class="verdict v-' + (res.verdictClass || 'none') + '"><b>' + esc(res.verdict || '') + '</b></div>';
    if (res.status === 'unsupported' || res.status === 'invalid') { h += '<p class="pad">' + esc(res.message || '') + '</p>'; box.innerHTML = h; $('#logBox').innerHTML = '<p class="muted pad">—</p>'; return; }
    if (res.reasons && res.reasons.length && res.status !== 'reaction') h += sub(res.status === 'nodata' ? '为什么没有结果' : '判断依据', '<ul class="reasons">' + res.reasons.map(r => '<li>' + r + '</li>').join('') + '</ul>', res.status);
    const evs = res.events.filter(e => !e.minor);
    if (evs.length) h += sub('反应方程式', evs.map(e => '<div class="eqrow"><span class="etype">' + esc(e.type) + '</span><div class="eq">' + e.eq + '</div>' + (e.eqMol ? '<div class="eq mol">' + e.eqMol + '</div>' : '') + (e.why ? '<div class="why">' + e.why + '</div>' : '') + '<div class="dh">ΔH(每式) = ' + (e.qual ? '—' : fnum(e.dH_eq, 1) + ' kJ') + (e.limiting ? ' · 限量: ' + esc(e.limiting) : '') + '</div></div>').join(''));
    const mn = res.events.filter(e => e.minor); if (mn.length) h += sub('物理过程', '<ul class="reasons">' + mn.map(e => '<li>' + esc(e.name) + ' <small class="muted">' + e.eq + '</small></li>').join('') + '</ul>', 'minor');
    if (res.limiting && res.limiting.length) h += sub('限量试剂', '<ul class="reasons">' + res.limiting.map(l => '<li>' + esc(l.name) + ' <small class="muted">（' + l.event + '）</small></li>').join('') + '</ul>');
    if (res.consumption && res.consumption.length) h += sub('试剂消耗', '<table class="tbl"><tr><th>物种</th><th>加入 (mmol)</th><th>剩余 (mmol)</th><th>消耗</th></tr>' + res.consumption.map(c => '<tr><td>' + c.html + '</td><td>' + fnum(c.n0 * 1000, 3) + '</td><td>' + fnum(c.n1 * 1000, 3) + '</td><td><div class="bar"><i style="width:' + Math.min(100, c.pct) + '%"></i></div>' + fnum(c.pct, 1) + '%</td></tr>').join('') + '</table>');
    if (res.products && res.products.length) h += sub('产物', '<table class="tbl"><tr><th>产物</th><th>物质的量 (mmol)</th><th>质量 (g)</th></tr>' + res.products.map(p => '<tr><td>' + p.html + ' <small class="muted">' + esc(p.name) + '</small></td><td>' + fnum(p.n * 1000, 3) + '</td><td>' + (p.ph === 'aq' && p.ion ? '—' : fnum(p.m, 4)) + '</td></tr>').join('') + '</table>');
    if (res.yields && res.yields.length) {
      const y0 = res.yields[0]; if (state.yieldPct === null || !state.yieldKeep) state.yieldPct = Math.round(Math.min(100, y0.eqPct) * 10) / 10;
      h += sub('理论产量与实际产率', '<table class="tbl" id="yTbl"><tr><th>产物</th><th>理论产量 (限量试剂完全转化)</th><th>引擎模拟产量</th><th>实际产量</th></tr>' + res.yields.map((y, i) => '<tr data-i="' + i + '"><td>' + y.html + '</td><td>' + fnum(y.mTheo, 4) + ' g<br><small>' + fnum(y.nTheo * 1000, 3) + ' mmol</small></td><td>' + fnum(y.mMax, 4) + ' g<br><small>' + fnum(y.eqPct, 1) + '% (平衡/Ksp/电量限制)</small></td><td class="yact">—</td></tr>').join('') + '</table><div class="yslider"><label>实际产率 <b id="yPct">' + state.yieldPct + '</b>% <input id="ySlider" type="range" min="0" max="100" step="0.5" value="' + state.yieldPct + '"></label><small class="muted">实际产量 = 理论产量 × 产率；真实实验中因副反应、转移损失、重结晶损失，产率一般低于 100%。</small></div>');
    }
    if (res.solution && res.solution.aq) {
      const s = res.solution; let t = '<div class="kv"><div><span>终态 pH</span><b>' + fnum(s.pH, 2) + '</b> <small>' + phName(s.pH) + '</small></div><div><span>[H⁺]</span><b>' + (Math.pow(10, -s.pH)).toExponential(2) + ' M</b></div><div><span>体积</span><b>' + fnum(s.V, 1) + ' mL</b></div><div><span>溶液颜色</span><b>' + esc(s.colorName) + '</b></div></div>';
      if (s.spec && s.spec.length) t += '<table class="tbl"><tr><th>弱酸/碱体系</th><th>总浓度 (M)</th><th>型体分布 (pH=' + fnum(s.pH, 2) + ')</th></tr>' + s.spec.map(x => '<tr><td>' + esc(x.name) + '</td><td>' + fnum(x.tot, 4) + '</td><td>' + x.forms.filter(f => f.frac > 0.0005).map(f => E.dispId(f.id) + ' ' + fnum(f.frac * 100, 1) + '%').join(' · ') + '</td></tr>').join('') + '</table>';
      h += sub('溶液性质', t);
    }
    const en = res.energy; if (en) {
      let t = '<div class="kv"><div><span>ΔH 总</span><b>' + (en.incomplete ? '—' : fnum(en.dH, 3) + ' kJ') + '</b> <small>' + (en.incomplete ? '数据缺失' : en.dH < 0 ? '放热' : en.dH > 0 ? '吸热' : '') + '</small></div><div><span>热容 C</span><b>' + fnum(en.C, 1) + ' J/K</b></div>';
      t += en.combustion ? '<div class="wide"><span>燃烧</span><b>放热 ' + fnum(en.Q, 1) + ' kJ</b> <small>火焰温度不适用 q=mcΔT</small></div>' : '<div><span>ΔT = Q/C</span><b>' + (en.incomplete ? '—' : en.hold ? '恒温' : (en.dT >= 0 ? '+' : '') + fnum(en.dT, 2) + ' K') + '</b></div><div><span>温度</span><b>' + (en.incomplete ? fnum(en.T0, 1) + ' °C (未计算)' : fnum(en.T0, 1) + ' → ' + fnum(en.Tfinal, 1) + ' °C') + '</b></div>';
      t += '</div>'; if (en.hold) t += '<p class="note">温度被' + (state.setup && state.setup.ice ? '冰浴' : '加热板') + '维持恒定' + (en.iceG ? '；约融化 ' + fnum(en.iceG, 1) + ' g 冰' : '') + '。</p>'; if (en.boiled > 0) t += '<p class="note warn">溶液沸腾，约 ' + fnum(en.boiled, 1) + ' g 水汽化。</p>'; if (en.excessNote) t += '<p class="note">' + en.excessNote + '</p>';
      if (en.missing && en.missing.length) t += '<p class="note warn">缺少 ΔfH° 数据的物种: ' + en.missing.map(i => E.dispId(i)).join('、') + '（热效应未计入）</p>';
      h += sub('热效应 q = m·c·ΔT', t);
    }
    if (res.gases && res.gases.length) h += sub('气体', '<table class="tbl"><tr><th>气体</th><th>n (mmol)</th><th>体积 (终态 T, 1 atm)</th><th>STP</th></tr>' + res.gases.map(g => '<tr><td>' + g.html + ' <small class="muted">' + esc(g.name) + '</small></td><td>' + fnum(g.n * 1000, 3) + '</td><td>' + fnum(g.V_T * 1000, 1) + ' mL</td><td>' + fnum(g.V_STP * 1000, 1) + ' mL</td></tr>').join('') + '</table>');
    const sol = (res.solids || []).filter(s => s.formed > 1e-7 || s.n > 1e-7); if (sol.length) h += sub('固体 / 沉淀', '<table class="tbl"><tr><th>固体</th><th>总量 (g)</th><th>新生成 (g)</th><th>颜色</th></tr>' + sol.map(s => '<tr><td>' + s.html + ' <small class="muted">' + esc(s.name) + '</small></td><td>' + fnum(s.m, 4) + '</td><td>' + (s.formed > 1e-7 ? fnum(s.formed * s.m / s.n, 4) : '—') + '</td><td>' + esc(s.cname || '') + '</td></tr>').join('') + '</table>');
    if (res.electro && !res.electro.fail) h += sub('电解', '<ul class="reasons">' + res.electro.lines.map(l => '<li>' + l + '</li>').join('') + '</ul>');
    if (res.phen && res.phen.length) h += sub('现象', '<ul class="phen">' + res.phen.map(p => '<li><span>' + (KIND_ICON[p.kind] || '•') + '</span>' + p.text + '</li>').join('') + '</ul>');
    if (res.hazards && res.hazards.length) h += sub('⚠ 危险提示（仅供理论参考）', '<ul class="hzl">' + res.hazards.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>', 'hazard');
    if (res.notes && res.notes.length) h += sub('备注', '<ul class="reasons">' + res.notes.map(x => '<li>' + x + '</li>').join('') + '</ul>');
    box.innerHTML = h;
    const upY = () => { $$('#yTbl tr[data-i]').forEach(tr => { const y = res.yields[+tr.dataset.i]; tr.querySelector('.yact').innerHTML = '<b>' + fnum(y.mTheo * state.yieldPct / 100, 4) + ' g</b><br><small>' + fnum(y.nTheo * state.yieldPct / 100 * 1000, 3) + ' mmol</small>'; }); };
    if ($('#ySlider')) { state.yieldKeep = true; $('#ySlider').oninput = () => { state.yieldPct = parseFloat($('#ySlider').value); $('#yPct').textContent = state.yieldPct; upY(); }; upY(); state.yieldKeep = false; }
    $('#logBox').className = 'log'; $('#logBox').innerHTML = (res.log || []).map(l => '<p>' + l + '</p>').join('');
  }

  // ---------------- 笔记本 ----------------
  const nb = { load() { try { return JSON.parse(localStorage.getItem(state.nbKey) || '[]'); } catch (e) { return []; } }, save(a) { try { localStorage.setItem(state.nbKey, JSON.stringify(a)); } catch (e) { toast('无法写入本地存储'); } } };
  function summary(res, setup) {
    const evs = (res.events || []).filter(e => !e.minor);
    return { time: new Date().toLocaleString('zh-CN', { hour12: false }), verdict: res.verdict, status: res.status, equations: evs.map(e => plain(e.eq)), molecular: evs.map(e => e.eqMol ? plain(e.eqMol) : '').filter(Boolean), pH: res.solution && res.solution.pH !== null && res.solution.pH !== undefined ? +fnum(res.solution.pH, 2).replace(/,/g, '') : null, dT: res.energy && !res.energy.hold && !res.energy.combustion ? +res.energy.dT.toFixed(3) : null, Tfinal: res.energy && res.energy.Tfinal !== null ? +res.energy.Tfinal.toFixed(1) : null, dH: res.energy ? +res.energy.dH.toFixed(3) : null, products: (res.products || []).map(p => plain(p.html) + ' ' + fnum(p.n * 1000, 3) + ' mmol' + (p.m && !p.ion ? ' (' + fnum(p.m, 3) + ' g)' : '')), yields: (res.yields || []).map(y => plain(y.html) + ' 理论 ' + fnum(y.mTheo, 4) + ' g'), phenomena: (res.phen || []).map(p => plain(p.text)), hazards: res.hazards || [], reasons: (res.reasons || []).map(plain) };
  }
  $('#btnSave').onclick = () => {
    if (!state.res || !state.res.events) return toast('请先运行一次实验');
    const arr = nb.load(); const setup = state.setup;
    const title = setup.additions.map(a => REAGBY[a.rid].name).join(' + ');
    arr.unshift({ id: Date.now().toString(36), title, setup, result: summary(state.res, setup), note: '' }); nb.save(arr); renderNbBadge(); toast('已保存到笔记本');
  };
  function renderNbBadge() { $('#nbCount').textContent = nb.load().length; }
  function describeSetup(s) { return s.additions.map(a => REAGBY[a.rid] ? REAGBY[a.rid].name + ' ' + addDesc(a) : a.rid).join('；') + ' ｜ ' + (D.VESSELS.find(v => v.id === s.vessel) || {}).name + ' ｜ ' + (s.ice ? '冰浴' : (s.plate ? '加热板 ' : '起始 ') + s.T0 + ' °C') + (s.catalyst && s.catalyst !== 'none' ? ' ｜ 催化剂 ' + s.catalyst : '') + (s.ignite ? ' ｜ 点火' : '') + (s.electro && s.electro.on ? ' ｜ 电解 ' + s.electro.V + ' V ' + s.electro.I + ' A ' + s.electro.t + ' s' : ''); }
  function renderNotebook() {
    const arr = nb.load(); renderNbBadge();
    $('#nbList').innerHTML = arr.length ? arr.map((e, i) => '<article class="nbitem"><header><b>' + esc(e.title) + '</b><span class="muted">' + esc(e.result.time) + '</span><span class="vtag v-' + (e.result.status === 'reaction' ? 'ok' : e.result.status === 'nodata' ? 'warn' : 'none') + '">' + esc(e.result.verdict || '') + '</span></header><p class="setup">' + esc(describeSetup(e.setup)) + '</p>' +
      (e.result.equations.length ? '<p class="eqs">' + e.result.equations.map(esc).join('<br>') + '</p>' : '') +
      '<p class="nums">' + [e.result.pH !== null ? 'pH ' + e.result.pH : '', e.result.dT !== null ? 'ΔT ' + e.result.dT + ' K' : '', e.result.dH !== null ? 'ΔH ' + e.result.dH + ' kJ' : ''].filter(Boolean).join(' · ') + '</p>' +
      (e.result.products.length ? '<p class="muted">产物: ' + e.result.products.map(esc).join('；') + '</p>' : '') + (e.result.phenomena.length ? '<p class="muted">现象: ' + e.result.phenomena.map(esc).join('；') + '</p>' : '') +
      '<textarea data-i="' + i + '" placeholder="实验备注 / 心得…">' + esc(e.note || '') + '</textarea><div class="btns"><button data-act="load" data-i="' + i + '">载入并重做</button><button data-act="del" data-i="' + i + '" class="danger">删除</button></div></article>').join('') : '<p class="muted pad">还没有记录。在实验台运行后点击“保存到笔记本”。</p>';
    $$('#nbList textarea').forEach(t => t.onchange = () => { const a = nb.load(); a[+t.dataset.i].note = t.value; nb.save(a); });
    $$('#nbList button').forEach(b => b.onclick = () => { const a = nb.load(), i = +b.dataset.i; if (b.dataset.act === 'del') { a.splice(i, 1); nb.save(a); renderNotebook(); } else { loadSetup(a[i].setup); $$('#tabs button')[0].click(); react(); } });
  }
  function download(name, text, mime) { const blob = new Blob(['\ufeff' + text], { type: mime + ';charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  $('#nbJson').onclick = () => download('chem-lab-notebook.json', JSON.stringify(nb.load(), null, 2), 'application/json');
  $('#nbMd').onclick = () => { const a = nb.load(); download('chem-lab-notebook.md', '# 虚拟化学实验室 · 实验笔记本\n\n' + a.map((e, i) => '## ' + (a.length - i) + '. ' + e.title + '\n\n- 时间: ' + e.result.time + '\n- 条件: ' + describeSetup(e.setup) + '\n- 结论: **' + e.result.verdict + '**\n' + (e.result.equations.length ? '- 方程式:\n' + e.result.equations.map(x => '  - `' + x + '`').join('\n') + '\n' : '') + (e.result.molecular.length ? '- 总方程式:\n' + e.result.molecular.map(x => '  - `' + x + '`').join('\n') + '\n' : '') + '- pH: ' + (e.result.pH === null ? '—' : e.result.pH) + '；ΔT: ' + (e.result.dT === null ? '—' : e.result.dT + ' K') + '；ΔH: ' + (e.result.dH === null ? '—' : e.result.dH + ' kJ') + '\n' + (e.result.products.length ? '- 产物: ' + e.result.products.join('；') + '\n' : '') + (e.result.yields.length ? '- 理论产量: ' + e.result.yields.join('；') + '\n' : '') + (e.result.phenomena.length ? '- 现象: ' + e.result.phenomena.join('；') + '\n' : '') + (e.result.hazards.length ? '- 危险提示: ' + e.result.hazards.join('；') + '\n' : '') + (e.note ? '- 备注: ' + e.note + '\n' : '')).join('\n'), 'text/markdown'); };
  $('#nbCsv').onclick = () => { const q = s => '"' + String(s === null || s === undefined ? '' : s).replace(/"/g, '""') + '"'; const rows = [['时间', '标题', '条件', '结论', '方程式', 'pH', 'ΔT(K)', 'ΔH(kJ)', '产物', '现象', '备注']].concat(nb.load().map(e => [e.result.time, e.title, describeSetup(e.setup), e.result.verdict, e.result.equations.join(' ; '), e.result.pH, e.result.dT, e.result.dH, e.result.products.join(' ; '), e.result.phenomena.join(' ; '), e.note])); download('chem-lab-notebook.csv', rows.map(r => r.map(q).join(',')).join('\r\n'), 'text/csv'); };
  $('#nbClear').onclick = () => { if (confirm('清空全部笔记？')) { nb.save([]); renderNotebook(); } };
  $('#nbImport').onchange = ev => { const f = ev.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { const a = JSON.parse(String(rd.result).replace(/^\ufeff/, '')); if (!Array.isArray(a)) throw 0; nb.save(a.concat(nb.load())); renderNotebook(); toast('已导入 ' + a.length + ' 条'); } catch (e) { toast('文件格式不正确'); } }; rd.readAsText(f); };

  // ---------------- 滴定模式 ----------------
  const T = { spec: null, curve: null, v: 0, timer: null, hover: null };
  const titrable = D.REAG.filter(r => E.protonCapacity(r.id) && (r.form === 'aq' || r.solution));
  const optHtml = titrable.map(r => '<option value="' + r.id + '">' + r.name + ' (' + plain(fHtml(r)) + ')</option>').join('');
  $('#tAn').innerHTML = optHtml; $('#tTi').innerHTML = optHtml; $('#tAn').value = 'HCl'; $('#tTi').value = 'NaOH';
  $('#tInd').innerHTML = D.INDICATORS.map(v => '<option value="' + v.id + '">' + v.name + (v.note ? ' (' + v.note + ')' : '') + '</option>').join(''); $('#tInd').value = 'pp';
  const tflask = new ChemViz.Viz($('#tFlask')); tflask.setKind('flask'); tflask.stir = true;
  function indObj() { return D.INDICATORS.find(i => i.id === $('#tInd').value); }
  function indCss(pH) { const ind = indObj(); if (!ind || !ind.acid) return '#4fd1c5'; const c = E.indicatorColor(ind, pH); const a = c.a; const mix = c.rgb.map(v => Math.round(255 - (255 - v) * Math.min(1, a))); return 'rgb(' + mix.join(',') + ')'; }
  function titrBuild() {
    const an = $('#tAn').value, ti = $('#tTi').value;
    const spec = { analyte: { rid: an, V: +$('#tAnV').value, c: +$('#tAnC').value }, titrant: { rid: ti, c: +$('#tTiC').value }, water: +$('#tWater').value };
    const capA = E.protonCapacity(an), capT = E.protonCapacity(ti);
    const isAcid = r => D.REAG.find(x => x.id === r).cat === '酸' || ['NH4Cl'].includes(r); const aAcid = isAcid(an), tAcid = isAcid(ti);
    if (aAcid === tAcid && !(an === 'Na2CO3' || ti === 'Na2CO3' || an === 'NaHCO3' || ti === 'NaHCO3' || an === 'CH3COONa')) { $('#tTheory').innerHTML = '<b class="warn">待测液与标准液同为酸或同为碱，不能滴定。</b>'; T.spec = null; return false; }
    const veq = spec.analyte.c * spec.analyte.V * capA / (spec.titrant.c * capT);
    T.veqTheory = veq; T.spec = spec;
    let Vmax = +$('#tVmax').value; if (T.autoVmax !== false && !T.userVmax) { Vmax = Math.max(10, Math.min(150, Math.ceil(veq * 2.1 / 5) * 5)); $('#tVmax').value = Vmax; }
    T.Vmax = Vmax; $('#tSlider').max = Vmax; if (T.v > Vmax) T.v = Vmax;
    T.curve = E.titrationCurve(spec, Vmax, Vmax / 240);
    $('#tTheory').innerHTML = '化学计量估算: 每摩尔待测物可中和 ' + capA + ' 当量，标准液 ' + capT + ' 当量/摩尔 → 完全中和需 V<sub>eq</sub> = c₁V₁·n₁/(c₂·n₂) = <b>' + fnum(veq, 2) + ' mL</b>（对多元酸为第 ' + capA + ' 个突跃）。曲线上用 pH 对体积的导数极大值自动识别等当点。';
    return true;
  }
  function titrRefresh() { if (!T.spec && !titrBuild()) return; titrDraw(); }
  function titrDraw() {
    if (!T.spec) return;
    const v = T.v, pH = E.titrationPH(T.spec, v), ind = indObj();
    $('#tV').textContent = fnum(v, 2); $('#tPH').textContent = fnum(pH, 2); $('#buRead').textContent = fnum(v, 2); $('#tSlider').value = v;
    $('#buFill').style.height = Math.max(0, 100 - v / T.Vmax * 100) + '%';
    let rgb = [226, 242, 250], al = .45, cname = '无色';
    if (ind && ind.acid) { const ic = E.indicatorColor(ind, pH); rgb = ic.rgb.map((x, i) => Math.round(x * Math.min(1, ic.a) + [226, 242, 250][i] * (1 - Math.min(1, ic.a)))); al = .45 + .4 * Math.min(1, ic.a); cname = E.colorName(ic.rgb, 1, ic.a * 1); if (ic.a < .05) cname = '无色'; }
    $('#tColor').style.background = 'rgb(' + rgb.join(',') + ')'; $('#tColorName').textContent = cname;
    const Vtot = T.spec.analyte.V + v + T.spec.water; tflask.setPreview({ level: Math.min(1, .25 + Vtot / 400), c: rgb, a: al, solids: [] }); tflask.stir = true;
    // 报告
    const eq = T.curve.eq; let rep = eq.length ? '检测到 ' + eq.length + ' 个等当点: ' + eq.map(e => '<b>' + e.v.toFixed(2) + ' mL</b> (pH ' + e.pH.toFixed(2) + ')').join('，') : '曲线上未检测到明显突跃（弱酸+弱碱，或浓度过低）。';
    if (ind && ind.pK && eq.length) { const ep = (() => { for (let i = 1; i < T.curve.pts.length; i++) { const a = T.curve.pts[i - 1], b = T.curve.pts[i]; if ((a.pH - ind.pK) * (b.pH - ind.pK) <= 0 && a.pH !== b.pH) { const k = (ind.pK - a.pH) / (b.pH - a.pH); return a.v + k * (b.v - a.v); } } return null; })(); if (ep !== null) { const near = eq.reduce((p, q) => Math.abs(q.v - ep) < Math.abs(p.v - ep) ? q : p); rep += '<br>指示剂 ' + ind.name + ' 在 pH=pK<sub>In</sub>=' + ind.pK + ' 处变色，对应滴定体积 ' + ep.toFixed(2) + ' mL，与最近等当点相差 ' + (ep - near.v >= 0 ? '+' : '') + (ep - near.v).toFixed(2) + ' mL（滴定终点误差' + (Math.abs(ep - near.v) / near.v < 0.002 ? '很小(<0.2%)，指示剂选择合适' : Math.abs(ep - near.v) / near.v < 0.01 ? '约 ' + (Math.abs(ep - near.v) / near.v * 100).toFixed(1) + '%，在常规允许误差内' : '较大，宜换用变色范围落在突跃内的指示剂') + '）。'; } else rep += '<br>该指示剂的变色点不在本曲线范围内。'; }
    if (eq.length && T.veqTheory) rep += '<br>理论等当体积 ' + fnum(T.veqTheory, 2) + ' mL；曲线检测值与之吻合度: ' + (eq.some(e => Math.abs(e.v - T.veqTheory) < 0.2) ? '✓ 一致' : '见上方各等当点');
    $('#tReport').innerHTML = rep;
    ChemViz.drawTitration($('#tCurve'), { pts: T.curve.pts, Vmax: T.Vmax, cur: { v, pH }, eq, ind, colorAt: indCss, hover: T.hover });
  }
  ['tAn', 'tAnV', 'tAnC', 'tTi', 'tTiC', 'tWater', 'tInd'].forEach(id => $('#' + id).onchange = () => { T.userVmax = false; T.v = 0; if (titrBuild()) titrDraw(); });
  $('#tVmax').onchange = () => { T.userVmax = true; if (titrBuild()) titrDraw(); };
  $('#tSlider').oninput = () => { T.v = parseFloat($('#tSlider').value); titrDraw(); };
  $$('[data-dv]').forEach(b => b.onclick = () => { if (!T.spec) return; T.v = Math.min(T.Vmax, T.v + parseFloat(b.dataset.dv)); tflask.addDrop([220, 230, 240]); titrDraw(); });
  $('#tReset').onclick = () => { T.v = 0; stopAuto(); titrDraw(); };
  $('#tToEq').onclick = () => { if (T.curve && T.curve.eq.length) { T.v = T.curve.eq[0].v; titrDraw(); } };
  function stopAuto() { if (T.timer) { clearInterval(T.timer); T.timer = null; $('#tAuto').textContent = '▶ 连续滴定'; } }
  $('#tAuto').onclick = () => { if (T.timer) return stopAuto(); if (!T.spec) return; $('#tAuto').textContent = '⏸ 暂停'; T.timer = setInterval(() => { const eqNear = T.curve.eq.some(e => Math.abs(e.v - T.v) < 1.2); T.v = Math.min(T.Vmax, T.v + (eqNear ? 0.05 : 0.4)); tflask.addDrop([220, 230, 240]); titrDraw(); if (T.v >= T.Vmax) stopAuto(); }, 60); };
  $('#tCurve').onmousemove = ev => { if (!T.curve) return; const cv = $('#tCurve'), r = cv.getBoundingClientRect(); const x = (ev.clientX - r.left) * cv.width / r.width; const L = 52, pw = cv.width - 52 - 14; const v = Math.max(0, Math.min(T.Vmax, (x - L) / pw * T.Vmax)); T.hover = { v, pH: E.titrationPH(T.spec, v) }; titrDraw(); };
  $('#tCurve').onmouseleave = () => { T.hover = null; titrDraw(); };
  $('#tCurve').onclick = () => { if (T.hover) { T.v = T.hover.v; titrDraw(); } };

  // ---------------- 说明 ----------------
  $('#aboutBox').innerHTML = '<h2>关于本模拟器</h2><p>这是一个纯前端、零依赖的“虚拟化学实验室”：选择试剂与用量，设置容器、温度、催化剂等条件，引擎依据<b>热力学与溶液化学数据</b>判断能否反应，并给出结果。所有文件均为本地静态文件，双击 <code>index.html</code> 即可使用。</p>' +
    '<h3>引擎覆盖的反应类型</h3><ul><li>酸碱中和 / 弱酸弱碱 / 缓冲 / 多元酸 — 电荷平衡精确求解 pH（含 Kw、各级 pKa）</li><li>沉淀 — 由 Ksp 与离子积 Q 判断，二分法求平衡沉淀量；含两性氢氧化物溶解</li><li>配位 — 氨/氢氧根配合物（Cu(NH₃)₄²⁺, Ag(NH₃)₂⁺, Zn(OH)₄²⁻ …）</li><li>气体逸出 — 碳酸盐/碳酸氢盐、亚硫酸盐、硫化物与酸；NH₄⁺ + 强碱；溶解度限度</li><li>置换与氧化还原 — 标准电极电势 + Nernst 修正 pH；考虑钝化、冷水惰性等动力学门槛</li><li>有机 — 酯化平衡（K 与进度）、水杨酸酰化制阿司匹林、皂化/酯水解、酚的 FeCl₃ 显色、强氧化剂 + 有机物</li><li>燃烧、热分解（ΔG = ΔH − TΔS 与起始温度）、H₂O₂ 催化分解、浓硫酸脱水、电解（法拉第定律 + 过电势）</li></ul>' +
    '<h3>如何阅读结果</h3><ul><li><b>发生化学反应</b>：给出净离子式、总方程式与判据（E°cell、Ksp、ΔG …）。</li><li><b>预计无反应</b>：说明原因，例如 E°cell &lt; 0，或溶液中离子之间不满足复分解条件。</li><li><b>引擎无数据</b>：规则库没有该组合，引擎不会凭空编造。</li><li><b>不支持</b>：涉及爆炸物、化学战剂、毒品合成等类别的组合一律拒绝。</li></ul>' +
    '<h3>局限</h3><p>温度变化按理想绝热量热 q = mcΔT 估算（水溶液比热 ≈ 4.18 J/g·K）；ΔfH° 来自教材/NIST 常用值，个别有机物与配合物为近似值，缺数据时会明确提示；活度系数取 1，动力学仅用规则门槛近似。结果用于理解理论，<b>不是</b>实验操作指南。</p>';

  // ---------------- 初始化 ----------------
  renderShelf(); renderAdds(); renderNbBadge(); updatePreview(); setThermo(25);
  // URL 参数: #example=N 自动载入第 N 个示例并运行; #view=titr|note|about 切换页面 (便于截图/分享)
  (function () {
    const m = location.hash.match(/example=(\d+)/); const v = location.hash.match(/view=(\w+)/);
    if (m && EXAMPLES[+m[1]] && EXAMPLES[+m[1]][1]) { $('#examples').value = m[1]; loadSetup(EXAMPLES[+m[1]][1]); react(); const r = REAGBY[state.adds[0].rid]; state.sel = r.id; renderShelf(); renderDetail(); if (/save=1/.test(location.hash)) $('#btnSave').click(); }
    const tv = location.hash.match(/tv=([\d.]+)/); if (tv) { T.v = +tv[1]; }
    if (v) { const b = $('#tabs button[data-view="' + v[1] + '"]'); if (b) b.click(); }
  })();
  window.__chemLab = { state, react, loadSetup, EXAMPLES, titrBuild, titrDraw, T };
})();
