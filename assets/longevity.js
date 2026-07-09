/*!
 * longevity-compass — retirement decumulation Monte Carlo engine.
 * Dependency-free, UMD (browser window.LC + Node require). Everything is in REAL
 * (inflation-adjusted) terms, so returns are real and spending is constant-real.
 *
 * The question it answers: given a nest egg, a spending plan, an asset mix, and an
 * uncertain lifespan, what is the probability your money lasts as long as you do?
 * It surfaces the two risks naive calculators ignore:
 *   - sequence-of-returns risk (a bad first decade can ruin you even at a fine average)
 *   - longevity risk (you might live much longer than "life expectancy")
 *
 * MIT License.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- reproducible PRNG (mulberry32) ---------- */
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- percentile of a numeric array ---------- */
  function pct(arr, p) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (x, y) { return x - y; });
    var i = Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1) + 0.5)));
    return s[i];
  }

  /* ---------- withdrawal strategies (real terms) ----------
   * fixed      : constant real spend (the classic "4% rule" shape)
   * percent    : spend pctRate × current balance (never fully depletes, but income swings)
   * guardrails : Guyton–Klinger-style — cut/raise spending when the withdrawal rate
   *              drifts outside a band around the initial rate. */
  function computeWithdrawal(cfg, bal, prevSpend, initWR) {
    var s = cfg.strategy || 'fixed';
    if (s === 'percent') return (cfg.pctRate != null ? cfg.pctRate : 0.04) * bal;
    if (s === 'guardrails') {
      var spend = prevSpend;
      if (bal > 0) {
        var wr = prevSpend / bal;
        var up = (cfg.upper != null ? cfg.upper : 1.2) * initWR;
        var lo = (cfg.lower != null ? cfg.lower : 0.8) * initWR;
        if (wr > up) spend = prevSpend * (1 - (cfg.cut != null ? cfg.cut : 0.10));
        else if (wr < lo) spend = prevSpend * (1 + (cfg.raise != null ? cfg.raise : 0.10));
      }
      return spend;
    }
    return cfg.initialSpend; // fixed real
  }

  /* ---------- one deterministic path over an explicit real-return sequence ----------
   * Withdrawal happens at the START of each year (conservative — makes sequence risk
   * bite), then the remainder earns that year's real return.
   * depletionAge = first age at which the full real spend can no longer be funded. */
  function simulatePath(cfg, returns) {
    var bal = cfg.startBalance, prevSpend = cfg.initialSpend;
    var initWR = cfg.initialSpend / cfg.startBalance;
    var path = [bal], depletionAge = null;
    for (var y = 0; y < returns.length; y++) {
      var desired = computeWithdrawal(cfg, bal, prevSpend, initWR);
      if (desired < 0) desired = 0;
      var w;
      if (bal < desired) { if (depletionAge == null) depletionAge = cfg.startAge + y; w = bal; }
      else w = desired;
      prevSpend = desired;
      bal -= w;
      bal = bal * (1 + returns[y]) * (1 - (cfg.fee || 0));
      if (bal < 0) bal = 0;
      path.push(bal);
    }
    return { path: path, depletionAge: depletionAge, endBalance: bal };
  }

  /* ---------- bootstrap sampler over historical real returns ----------
   * Block bootstrap (block=1 → IID) preserves some autocorrelation, keeping the
   * sequence-risk realism the whole tool is about. Portfolio = wStock·stock + (1-wStock)·bond. */
  function makeSampler(cfg, rand) {
    var stock = cfg.stockReal, bond = cfg.bondReal, n = stock.length;
    var w = cfg.wStock != null ? cfg.wStock : 0.6, block = cfg.block || 1;
    var cursor = 0, left = 0;
    return function () {
      if (left <= 0) { cursor = Math.floor(rand() * n); left = block; }
      var i = cursor % n; cursor++; left--;
      return w * stock[i] + (1 - w) * bond[i];
    };
  }
  function sampleReturns(cfg, rand, years) {
    var s = makeSampler(cfg, rand), a = [];
    for (var y = 0; y < years; y++) a.push(s());
    return a;
  }

  /* ---------- mortality: sample age at death from a period life table ----------
   * qx[age] = probability of dying within the year at that age. */
  function sampleDeathAge(rand, qx, startAge, maxAge) {
    for (var age = startAge; age < maxAge; age++) {
      var q = qx && qx[age] != null ? qx[age] : (age >= maxAge - 1 ? 1 : 0.02);
      if (rand() < q) return age;
    }
    return maxAge;
  }

  /* ---------- Monte Carlo ----------
   * success = you did NOT run out of money while still alive. */
  function run(cfg, opts) {
    opts = opts || {};
    var N = opts.trials || 1000, rand = rng(opts.seed || 12345);
    var maxAge = cfg.maxAge || 100, years = maxAge - cfg.startAge;
    var successes = 0, endBalances = [], depletions = [];
    var byYear = []; for (var y = 0; y <= years; y++) byYear.push([]);

    for (var t = 0; t < N; t++) {
      var rets = sampleReturns(cfg, rand, years);
      var sim = simulatePath(cfg, rets);
      var death = cfg.mortality === 'table'
        ? sampleDeathAge(rand, cfg.qx, cfg.startAge, maxAge)
        : (cfg.planToAge || maxAge);
      var ranOutAlive = sim.depletionAge != null && sim.depletionAge <= death;
      if (!ranOutAlive) successes++;
      endBalances.push(sim.endBalance);
      if (ranOutAlive) depletions.push(sim.depletionAge); // ruin age among failures only
      for (var k = 0; k < sim.path.length; k++) byYear[k].push(sim.path[k]);
    }

    var fan = byYear.map(function (vals, k) {
      return {
        age: cfg.startAge + k,
        p10: pct(vals, 0.10), p25: pct(vals, 0.25), p50: pct(vals, 0.50),
        p75: pct(vals, 0.75), p90: pct(vals, 0.90)
      };
    });

    return {
      trials: N,
      successRate: successes / N,
      ruinRate: 1 - successes / N,
      fan: fan,
      endBalance: { p10: pct(endBalances, 0.10), p50: pct(endBalances, 0.50), p90: pct(endBalances, 0.90) },
      depletionAgeMedian: depletions.length ? pct(depletions, 0.50) : null
    };
  }

  /* ---------- real returns from a nominal series + inflation ----------
   * realReturn = (1 + nominal) / (1 + inflation) − 1, element-wise. */
  function toReal(nominal, inflation) {
    return nominal.map(function (r, i) { return (1 + r) / (1 + (inflation[i] || 0)) - 1; });
  }

  /* ---------- longevity model (Gompertz mortality) ----------
   * A transparent actuarial curve: the yearly death hazard rises exponentially with age,
   * calibrated so that life expectancy at `startAge` matches `targetLE`. This is why a
   * plan that "lasts to life expectancy" is a coin flip — half of people live longer.
   * (Real period life tables, SSA/WHO/China, are a documented data upgrade.) */
  function survivalLE(qx, startAge, maxAge) {
    var alive = 1, years = 0;
    for (var a = startAge; a < maxAge; a++) { var q = qx[a] != null ? qx[a] : 1; alive *= (1 - q); years += alive; }
    return years;
  }
  function buildGompertzQx(startAge, targetLE, maxAge, g) {
    g = g || 0.085; maxAge = maxAge || 110;
    function qxFor(B) {
      var qx = {};
      for (var a = 0; a <= maxAge; a++) { qx[a] = 1 - Math.exp(-(B * Math.exp(g * a))); }
      qx[maxAge] = 1;
      return qx;
    }
    var lo = 1e-8, hi = 1e-1; // solve B by bisection; LE decreases as B rises
    for (var it = 0; it < 80; it++) {
      var mid = Math.sqrt(lo * hi);
      if (survivalLE(qxFor(mid), startAge, maxAge) > targetLE) lo = mid; else hi = mid;
    }
    return qxFor(Math.sqrt(lo * hi));
  }

  return {
    rng: rng, pct: pct,
    computeWithdrawal: computeWithdrawal,
    simulatePath: simulatePath,
    makeSampler: makeSampler, sampleReturns: sampleReturns,
    sampleDeathAge: sampleDeathAge, survivalLE: survivalLE, buildGompertzQx: buildGompertzQx,
    run: run, toReal: toReal
  };
});
