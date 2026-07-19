/* longevity-compass — UI layer. Reads inputs, runs the Monte Carlo engine, renders the
 * success rate, a balance fan chart, and a spend→success curve. Hand-drawn SVG, no
 * frameworks, state in localStorage. Everything is in REAL (today's) money. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var forEach = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };
  var LS = 'longevity_compass_v1';
  var LC_RAW = (typeof LC_DATA !== 'undefined') ? LC_DATA : (window.LC_DATA || {});
  var DATASETS = LC_RAW.datasets || [];
  var DEFAULT_DATASET_ID = LC_RAW.defaultId || (DATASETS[0] && DATASETS[0].id) || '';
  function findDataset(id) {
    var d = null;
    for (var i = 0; i < DATASETS.length; i++) { if (DATASETS[i].id === id) { d = DATASETS[i]; break; } }
    return d || DATASETS[0] || { years: [], stockReal: [], bondReal: [], from: '', to: '', label: {}, source: '' };
  }
  var DATA; // set once state.dataset is known, see below

  /* ---------------- i18n ---------------- */
  var STR = {
    zh: {
      tagline: '你的养老钱,能撑到你走的那天吗?把序列风险和长寿风险一起算。',
      privacy: '🔒 全部模拟在你的浏览器里完成,数据只存本机,不上传任何服务器。',
      yourPlan: '你的方案', startAge: '退休/起始年龄', balance: '养老资产(今天的钱)', wrate: '首年提取率',
      wStock: '股票占比', wStockHint: '其余为债券', strategy: '提取策略',
      stratFixed: '定额(按实际购买力)', stratGuard: '护栏(市场差就少花)', stratPercent: '按当前资产比例',
      longMode: '寿命假设', longModel: '把长寿风险建模', longPlan: '规划到固定年龄',
      remLE: '起始年龄时的预期余寿', yrsUnit: '年', remLEHint: '中位;半数人活得更久', planTo: '规划到', ageUnit: '岁',
      successKick: '钱撑到你走的概率', spendLbl: '首年支出', spendFoot: '今天的购买力 / 年',
      medEndLbl: '中位数遗产', medEndFoot: '离世时剩余(中位)', ruinLbl: '若耗尽,中位年龄', ruinFoot: '失败情形里钱花光的年龄',
      fanTitle: '资产轨迹的可能范围(今天的钱)',
      fanNote: '1000+ 次随机历史重演。深带 = 中间 50%,浅带 = 10–90 分位。带越宽,说明"入场时机/序列风险"影响越大。',
      curveTitle: '提取率 → 成功率', curveNote: '同一套资产与寿命假设下,多花一点,成功率掉多快。曲线常常有"悬崖"。',
      howTitle: '方法、假设与局限(点开)',
      leg1090: '10–90 分位', leg2575: '中间 50%', legMed: '中位轨迹',
      expDeath: '预期离世', planAge: '规划到', ageAxis: '年龄', wrateAxis: '提取率', you: '你', never: '—',
      verdictHigh: '很稳:钱大概率陪你到最后,还留有余地。',
      verdictMid: '大概率够,但要盯着——市场差的年份考虑少花点。',
      verdictLow: '偏紧:有相当概率提前花光。考虑降低支出、调整股债搭配,或延后退休。',
      verdictBad: '耗尽风险高:当前花法很可能撑不到你走那天。',
      footMade: '开源 · MIT 许可 · 数据不出本地',
      dataNote: '历史数据:标普500(含股息) + {bond},已扣通胀 · {from}–{to} · 来源 {source}',
      dataSel: '数据集',
      disclaimer: '仅为教育与规划用途,不构成投资或理财建议。过往收益不代表未来,模拟结果不是承诺。',
      howBody: '<h4>它在算什么</h4>退休后逐年:年初按你的策略取钱,余下的资产随「那一年」的真实收益涨跌。把这套过程用<b>历史真实收益</b>随机重演上千次,统计你在离世前<b>没有把钱花光</b>的比例 = 成功率。<h4>两个被普通计算器忽略的风险</h4><b>序列收益风险</b>:同样的平均收益,如果<b>头几年</b>就熊市,边取钱边亏,组合可能再也回不来——所以退休<b>开局</b>的运气,比长期平均更致命。<b>长寿风险</b>:「规划到预期寿命」其实是抛硬币——按定义有一半人活得更久。默认用 Gompertz 死亡率曲线把寿命的不确定性也随机化。<h4>都用「今天的钱」</h4>收益为<b>实际收益</b>(已扣通胀),支出为恒定实际购买力,所以每个数字都是今天的购买力。<h4>提取策略</h4>定额=购买力恒定(最经典也最脆);护栏=市场差的年份自动少花(Guyton-Klinger 简化);按比例=永不清零但收入起伏大。<h4>数据与局限</h4>用一段真实历史做自助重采样(见页脚年份),它<b>没</b>覆盖更早的 1970 年代滞胀等更糟序列——真实风险可能更高。未计:税、超出输入的费用、单一国别/长期护理冲击、养老金/社保。这是规划罗盘,不是精算,更不是投资建议。'
    },
    en: {
      tagline: 'Will your nest egg outlast you? A simulator that puts sequence risk and longevity risk together.',
      privacy: '🔒 Every simulation runs in your browser. Your numbers never leave this device.',
      yourPlan: 'Your plan', startAge: 'Retirement / start age', balance: 'Nest egg (today\'s money)', wrate: 'First-year withdrawal',
      wStock: 'Stock allocation', wStockHint: 'rest is bonds', strategy: 'Withdrawal strategy',
      stratFixed: 'Fixed real spending', stratGuard: 'Guardrails (spend less in bad years)', stratPercent: 'Percent of portfolio',
      longMode: 'Lifespan', longModel: 'Model longevity risk', longPlan: 'Plan to a fixed age',
      remLE: 'Life expectancy at start age', yrsUnit: 'yrs', remLEHint: 'median — half live longer', planTo: 'Plan to age', ageUnit: '',
      successKick: 'Chance your money outlasts you', spendLbl: 'First-year spending', spendFoot: 'today\'s money / year',
      medEndLbl: 'Median legacy', medEndFoot: 'left at death (median)', ruinLbl: 'If depleted, median age', ruinFoot: 'age money runs out, in failures',
      fanTitle: 'Range of possible balances (today\'s money)',
      fanNote: '1000+ random replays of history. Dark band = middle 50%, light band = 10th–90th pct. A wider band means timing / sequence risk matters more.',
      curveTitle: 'Withdrawal rate → success', curveNote: 'For the same assets and lifespan, how fast success drops as you spend more. The curve often has a cliff.',
      howTitle: 'Method, assumptions & limits (open)',
      leg1090: '10th–90th pct', leg2575: 'middle 50%', legMed: 'median path',
      expDeath: 'expected death', planAge: 'plan to', ageAxis: 'age', wrateAxis: 'withdrawal rate', you: 'you', never: '—',
      verdictHigh: 'Comfortable: your money very likely lasts, with room to spare.',
      verdictMid: 'Likely enough — but watch it; consider spending less in bad years.',
      verdictLow: 'Tight: a real chance of running out early. Consider spending less, adjusting the mix, or retiring later.',
      verdictBad: 'High risk of running out: this spending likely won\'t last as long as you do.',
      footMade: 'Open source · MIT · data stays local',
      dataNote: 'History: S&P 500 (incl. dividends) + {bond}, inflation-adjusted · {from}–{to} · via {source}',
      dataSel: 'Dataset',
      disclaimer: 'For education and planning only — not investment or financial advice. Past returns aren\'t future; a simulation is not a promise.',
      howBody: '<h4>What it computes</h4>Year by year in retirement: withdraw at the start of the year per your strategy, then the rest earns THAT year\'s real return. Replaying this over <b>real historical returns</b> a thousand+ times, the success rate is the share of runs where you <b>don\'t run out of money before you die</b>.<h4>Two risks naive calculators skip</h4><b>Sequence-of-returns risk</b>: at the same average return, a bear market in the <b>first few years</b> — while you\'re withdrawing — can sink a portfolio for good. Your luck at the <b>start</b> matters more than the long-run average. <b>Longevity risk</b>: "plan to life expectancy" is a coin flip — by definition half live longer. By default a Gompertz mortality curve randomizes lifespan too.<h4>Everything in today\'s money</h4>Returns are <b>real</b> (inflation removed) and spending is constant real, so every figure is today\'s purchasing power.<h4>Strategies</h4>Fixed = constant purchasing power (classic, most fragile); Guardrails = auto-trim spending in bad years (simplified Guyton–Klinger); Percent = never hits zero but income swings.<h4>Data & limits</h4>Bootstrapped from one real history window (see footer). It does <b>not</b> include worse earlier sequences like 1970s stagflation — real risk may be higher. It ignores taxes, fees beyond your input, single-country / long-term-care shocks, and pensions. A planning compass, not an actuary — and not advice.'
    }
  };

  /* ---------------- state ---------------- */
  var DEFAULTS = { startAge: 65, balance: 2000000, wrate: 4, wStock: 60, strategy: 'fixed', longMode: 'model', remLE: 20, planTo: 95, cur: '¥', lang: 'zh', dataset: DEFAULT_DATASET_ID };
  var state = Object.assign({}, DEFAULTS, load());
  function load() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } }
  function persist() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) {} }
  if (DATASETS.every(function (d) { return d.id !== state.dataset; })) state.dataset = DEFAULT_DATASET_ID;
  DATA = findDataset(state.dataset);

  var FIELDS = ['startAge', 'balance', 'wrate', 'wStock', 'strategy', 'longMode', 'remLE', 'planTo'];
  FIELDS.forEach(function (f) {
    var el = $(f); el.value = state[f];
    var ev = (el.tagName === 'SELECT') ? 'change' : 'input';
    el.addEventListener(ev, function () { state[f] = this.value; persist(); modeVis(); render(); });
  });
  $('curSel').value = state.cur;
  $('curSel').addEventListener('change', function () { state.cur = this.value; persist(); render(); });
  var $dataSel = $('dataSel');
  if ($dataSel) {
    $dataSel.innerHTML = DATASETS.map(function (d) {
      return '<option value="' + d.id + '">' + (d.label && d.label[state.lang] || d.id) + '</option>';
    }).join('');
    $dataSel.value = state.dataset;
    $dataSel.addEventListener('change', function () {
      state.dataset = this.value; persist(); DATA = findDataset(state.dataset);
      updateDataNote(); render();
    });
  }
  forEach('#langSeg button', function (b) { b.addEventListener('click', function () { setLang(this.dataset.lang); }); });

  /* ---------------- helpers ---------------- */
  function t(k) { return (STR[state.lang] && STR[state.lang][k]) || k; }
  function fill(tpl, m) { return String(tpl).replace(/\{(\w+)\}/g, function (_, k) { return m[k]; }); }
  function money(v) {
    if (!isFinite(v)) return '–';
    var s = state.cur, n = Math.round(v), neg = n < 0 ? '-' : ''; n = Math.abs(n);
    if (state.lang === 'zh') {
      if (n >= 1e8) return neg + s + (n / 1e8).toFixed(2) + '亿';
      if (n >= 1e4) return neg + s + (n / 1e4).toFixed(1) + '万';
      return neg + s + n.toLocaleString('en-US');
    }
    if (n >= 1e6) return neg + s + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return neg + s + n.toLocaleString('en-US');
    return neg + s + n;
  }
  function modeVis() {
    $('remLEFld').style.display = state.longMode === 'model' ? '' : 'none';
    $('planToFld').style.display = state.longMode === 'planTo' ? '' : 'none';
  }
  function updateDataNote() {
    $('dataNote').textContent = fill(t('dataNote'), {
      from: DATA.from, to: DATA.to,
      source: DATA.source || '',
      bond: (DATA.bondDesc && DATA.bondDesc[state.lang]) || ''
    });
  }

  /* ---------------- build engine config ---------------- */
  function cfg(over) {
    var bal = +state.balance || 0, age = +state.startAge || 65;
    var c = {
      startAge: age, startBalance: bal,
      initialSpend: (+state.wrate / 100) * bal,
      stockReal: DATA.stockReal, bondReal: DATA.bondReal, wStock: (+state.wStock) / 100,
      block: 5, strategy: state.strategy, pctRate: (+state.wrate / 100), fee: 0, maxAge: 105
    };
    if (state.longMode === 'planTo') { c.mortality = 'fixed'; c.planToAge = +state.planTo; }
    else { c.mortality = 'table'; c.qx = LC.buildGompertzQx(age, +state.remLE || 20, 110); c.planToAge = 110; }
    return Object.assign(c, over || {});
  }

  /* ---------------- render ---------------- */
  function render() {
    var c = cfg();
    var res = LC.run(c, { trials: 1000, seed: 20260610 });
    var sr = res.successRate;

    $('r-success').textContent = sr >= 1 ? 100 : Math.min(99, Math.round(sr * 100));
    var vk, cls;
    if (sr >= 0.9) { vk = 'verdictHigh'; cls = ''; }
    else if (sr >= 0.75) { vk = 'verdictMid'; cls = 'mid'; }
    else if (sr >= 0.5) { vk = 'verdictLow'; cls = 'risk'; }
    else { vk = 'verdictBad'; cls = 'risk'; }
    $('hero').className = 'card hero' + (cls ? ' ' + cls : '');
    $('r-verdict').textContent = t(vk);

    $('r-spend').textContent = money(c.initialSpend);
    $('spendHint').textContent = '≈ ' + money(c.initialSpend);
    $('r-endmed').textContent = money(res.endBalance.p50);
    $('r-ruinage').textContent = res.depletionAgeMedian ? (res.depletionAgeMedian + (state.lang === 'zh' ? ' 岁' : '')) : t('never');

    drawFan(res, c);
    drawCurve();
  }

  /* ---------------- SVG helpers ---------------- */
  var W = 860, H = 320, PAD = { l: 66, r: 20, t: 16, b: 34 };
  function svgEl(c) { return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img">' + c + '</svg>'; }
  function sx(fr) { return PAD.l + fr * (W - PAD.l - PAD.r); }
  function sy(fr) { return H - PAD.b - fr * (H - PAD.t - PAD.b); }
  function ticks(max, n) { var a = [], st = max / n; for (var k = 0; k <= n; k++) a.push({ v: st * k, fr: k / n }); return a; }

  function drawFan(res, c) {
    var fan = res.fan, thresh = 0.01 * c.startBalance, li = 0, yMaxV = 0;
    for (var i = 0; i < fan.length; i++) { if (fan[i].p90 > yMaxV) yMaxV = fan[i].p90; if (fan[i].p90 > thresh) li = i; }
    var deathAge = c.mortality === 'table' ? c.startAge + (+state.remLE || 20) : c.planToAge;
    var ageMin = c.startAge;
    var ageMax = Math.min(fan[fan.length - 1].age, Math.max(fan[Math.min(li + 3, fan.length - 1)].age, deathAge + 2, 92));
    var pts = fan.filter(function (p) { return p.age <= ageMax; });
    var yMax = (yMaxV * 1.06) || 1;
    function X(age) { return sx((age - ageMin) / Math.max(1, ageMax - ageMin)); }
    function Y(v) { return sy(v / yMax); }
    function band(lo, hi) {
      var d = '', j;
      for (j = 0; j < pts.length; j++) d += (j ? 'L' : 'M') + X(pts[j].age).toFixed(1) + ' ' + Y(pts[j][hi]).toFixed(1) + ' ';
      for (j = pts.length - 1; j >= 0; j--) d += 'L' + X(pts[j].age).toFixed(1) + ' ' + Y(pts[j][lo]).toFixed(1) + ' ';
      return d + 'Z';
    }
    var s = '';
    ticks(yMax, 4).forEach(function (yt, k) {
      var pY = sy(yt.fr);
      if (k > 0) s += '<line class="grid" x1="' + PAD.l + '" y1="' + pY + '" x2="' + (W - PAD.r) + '" y2="' + pY + '"/>';
      s += '<text class="axlbl" x="' + (PAD.l - 8) + '" y="' + (pY + 4) + '" text-anchor="end">' + money(yt.v) + '</text>';
    });
    var xtn = 6;
    for (var xi = 0; xi <= xtn; xi++) { var age = Math.round(ageMin + (ageMax - ageMin) * xi / xtn); s += '<text class="axlbl" x="' + X(age) + '" y="' + (H - PAD.b + 18) + '" text-anchor="middle">' + age + '</text>'; }
    s += '<line class="ax" x1="' + PAD.l + '" y1="' + sy(0) + '" x2="' + (W - PAD.r) + '" y2="' + sy(0) + '"/>';
    s += '<path class="band" d="' + band('p10', 'p90') + '"/><path class="band2" d="' + band('p25', 'p75') + '"/>';
    var md = ''; for (var m = 0; m < pts.length; m++) md += (m ? 'L' : 'M') + X(pts[m].age).toFixed(1) + ' ' + Y(pts[m].p50).toFixed(1) + ' ';
    s += '<path class="median" d="' + md + '"/>';
    if (deathAge >= ageMin && deathAge <= ageMax) {
      var dx = X(deathAge);
      s += '<line class="agemark" x1="' + dx + '" y1="' + sy(0) + '" x2="' + dx + '" y2="' + PAD.t + '"/>';
      s += '<text class="agelbl" x="' + (dx + 4) + '" y="' + (PAD.t + 11) + '">' + t(c.mortality === 'table' ? 'expDeath' : 'planAge') + ' ' + deathAge + '</text>';
    }
    s += '<text class="axlbl" x="' + sx(1) + '" y="' + (H - 4) + '" text-anchor="end">' + t('ageAxis') + ' →</text>';
    $('chart-fan').innerHTML = svgEl(s);
  }

  function drawCurve() {
    var rmin = 2, rmax = 8, cur = +state.wrate, bal = +state.balance || 0;
    var data = [];
    for (var r = rmin; r <= rmax + 1e-6; r += 0.5) {
      var c = cfg({ initialSpend: (r / 100) * bal, pctRate: r / 100 });
      data.push({ r: Math.round(r * 10) / 10, s: LC.run(c, { trials: 350, seed: 99 }).successRate });
    }
    function X(rr) { return sx((rr - rmin) / (rmax - rmin)); }
    function Y(v) { return sy(v); }
    var s = '';
    ticks(1, 4).forEach(function (yt, k) {
      var pY = sy(yt.fr);
      if (k > 0) s += '<line class="grid" x1="' + PAD.l + '" y1="' + pY + '" x2="' + (W - PAD.r) + '" y2="' + pY + '"/>';
      s += '<text class="axlbl" x="' + (PAD.l - 8) + '" y="' + (pY + 4) + '" text-anchor="end">' + Math.round(yt.v * 100) + '%</text>';
    });
    [2, 3, 4, 5, 6, 7, 8].forEach(function (rr) { s += '<text class="axlbl" x="' + X(rr) + '" y="' + (H - PAD.b + 18) + '" text-anchor="middle">' + rr + '%</text>'; });
    s += '<line class="ax" x1="' + PAD.l + '" y1="' + sy(0) + '" x2="' + (W - PAD.r) + '" y2="' + sy(0) + '"/>';
    s += '<line class="refline" x1="' + PAD.l + '" y1="' + Y(0.9) + '" x2="' + (W - PAD.r) + '" y2="' + Y(0.9) + '"/>';
    s += '<text class="agelbl" x="' + (W - PAD.r) + '" y="' + (Y(0.9) - 5) + '" text-anchor="end">90%</text>';
    var d = ''; data.forEach(function (p, i) { d += (i ? 'L' : 'M') + X(p.r).toFixed(1) + ' ' + Y(p.s).toFixed(1) + ' '; });
    s += '<path class="curve" d="' + d + '"/>';
    if (cur >= rmin && cur <= rmax) {
      var cl = data.reduce(function (a, b) { return Math.abs(b.r - cur) < Math.abs(a.r - cur) ? b : a; });
      var mx = X(cur), my = Y(cl.s);
      s += '<line class="agemark" x1="' + mx + '" y1="' + sy(0) + '" x2="' + mx + '" y2="' + my + '"/>';
      s += '<circle class="mark" cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="5"/>';
      var end = cur > 6;
      s += '<text class="marklbl" x="' + (mx + (end ? -8 : 8)) + '" y="' + (my - 8) + '" text-anchor="' + (end ? 'end' : 'start') + '">' + t('you') + ' ' + Math.round(cl.s * 100) + '%</text>';
    }
    s += '<text class="axlbl" x="' + sx(1) + '" y="' + (H - 4) + '" text-anchor="end">' + t('wrateAxis') + ' →</text>';
    $('chart-curve').innerHTML = svgEl(s);
  }

  /* ---------------- language ---------------- */
  function setLang(lang) {
    state.lang = lang; persist();
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    forEach('#langSeg button', function (b) { b.classList.toggle('on', b.dataset.lang === lang); });
    document.querySelectorAll('[data-i18n]').forEach(function (el) { var v = t(el.dataset.i18n); if (v != null) el.textContent = v; });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) { var v = STR[lang][el.dataset.i18nHtml]; if (v != null) el.innerHTML = v; });
    $('fanLegend').innerHTML =
      '<span class="lg"><i class="sw b1"></i>' + t('leg1090') + '</span>' +
      '<span class="lg"><i class="sw b2"></i>' + t('leg2575') + '</span>' +
      '<span class="lg"><i class="sw md"></i>' + t('legMed') + '</span>';
    if ($dataSel) {
      forEach('#dataSel option', function (o) {
        var d = findDataset(o.value);
        o.textContent = (d.label && d.label[lang]) || d.id;
      });
    }
    updateDataNote();
    render();
  }

  /* ---------------- init ---------------- */
  modeVis();
  setLang(state.lang);
})();
