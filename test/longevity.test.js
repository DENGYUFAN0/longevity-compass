'use strict';
const test = require('node:test');
const assert = require('node:assert');
const LC = require('../assets/longevity.js');

const approx = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const fill = (n, v) => Array.from({ length: n }, () => v);

test('PRNG is reproducible and in [0,1)', () => {
  const a = LC.rng(42), b = LC.rng(42);
  for (let i = 0; i < 5; i++) { const x = a(); assert.strictEqual(x, b()); assert.ok(x >= 0 && x < 1); }
});

test('zero returns + fixed spend depletes on schedule', () => {
  const cfg = { startAge: 65, maxAge: 100, startBalance: 1e6, initialSpend: 1e5, strategy: 'fixed' };
  const sim = LC.simulatePath(cfg, fill(35, 0)); // ¥1M / ¥100k = 10 years of spend
  assert.strictEqual(sim.depletionAge, 75); // can't fund the 11th year (age 65+10)
  approx(sim.endBalance, 0);
});

test('healthy return + modest spend never depletes and grows', () => {
  const cfg = { startAge: 65, maxAge: 100, startBalance: 1e6, initialSpend: 3e4, strategy: 'fixed' };
  const sim = LC.simulatePath(cfg, fill(35, 0.05));
  assert.strictEqual(sim.depletionAge, null);
  assert.ok(sim.endBalance > 1e6, `end ${sim.endBalance}`);
});

test('percent-of-portfolio strategy never fully depletes', () => {
  const cfg = { startAge: 65, maxAge: 100, startBalance: 1e6, initialSpend: 4e4, strategy: 'percent', pctRate: 0.04 };
  const sim = LC.simulatePath(cfg, fill(35, -0.10)); // brutal, sustained losses
  assert.strictEqual(sim.depletionAge, null);
  assert.ok(sim.endBalance > 0);
});

test('sequence-of-returns risk: same returns, bad-early order ends poorer', () => {
  const cfg = { startAge: 65, maxAge: 75, startBalance: 1e6, initialSpend: 5e4, strategy: 'fixed' };
  const goodEarly = [...fill(5, 0.20), ...fill(5, -0.20)];
  const badEarly = [...fill(5, -0.20), ...fill(5, 0.20)]; // identical multiset, reversed
  const A = LC.simulatePath(cfg, goodEarly);
  const B = LC.simulatePath(cfg, badEarly);
  assert.ok(B.endBalance < A.endBalance, `badEarly ${B.endBalance} < goodEarly ${A.endBalance}`);
});

test('guardrails cut spending when the withdrawal rate spikes', () => {
  const cfg = { startAge: 65, startBalance: 1e6, initialSpend: 5e4, strategy: 'guardrails', upper: 1.2, lower: 0.8, cut: 0.1, raise: 0.1 };
  // balance dropped to 500k → WR = 50k/500k = 10% vs initial 5%; 10% > 1.2×5% → cut 10%
  const w = LC.computeWithdrawal(cfg, 5e5, 5e4, 0.05);
  approx(w, 4.5e4);
});

test('toReal applies the Fisher relation element-wise', () => {
  const real = LC.toReal([0.10, 0.00], [0.03, 0.03]);
  approx(real[0], (1.10 / 1.03) - 1, 1e-9);
  approx(real[1], (1.00 / 1.03) - 1, 1e-9);
});

test('sampleDeathAge stays within [startAge, maxAge] and qx=1 forces death', () => {
  const qxDieNow = {}; qxDieNow[65] = 1;
  assert.strictEqual(LC.sampleDeathAge(LC.rng(1), qxDieNow, 65, 100), 65);
  const qxImmortal = {}; for (let a = 65; a < 100; a++) qxImmortal[a] = 0;
  assert.strictEqual(LC.sampleDeathAge(LC.rng(1), qxImmortal, 65, 100), 100);
});

test('Gompertz life table hits its target life expectancy and rises with age', () => {
  const qx = LC.buildGompertzQx(65, 20, 110);
  approx(LC.survivalLE(qx, 65, 110), 20, 0.3);
  assert.ok(qx[90] > qx[65] && qx[65] > 0); // hazard increases with age
});

test('Monte Carlo: reproducible, and higher spend lowers success', () => {
  const base = {
    startAge: 65, maxAge: 100, startBalance: 1e6,
    stockReal: [0.08, -0.10, 0.15, -0.05, 0.12, 0.20, -0.20, 0.06, 0.10, -0.02],
    bondReal: [0.02, 0.03, -0.01, 0.04, 0.01, 0.02, 0.05, 0.00, 0.03, 0.02],
    wStock: 0.6, block: 3, mortality: 'fixed', planToAge: 95
  };
  const lo = LC.run({ ...base, initialSpend: 3e4, strategy: 'fixed' }, { trials: 800, seed: 7 });
  const hi = LC.run({ ...base, initialSpend: 7e4, strategy: 'fixed' }, { trials: 800, seed: 7 });
  const lo2 = LC.run({ ...base, initialSpend: 3e4, strategy: 'fixed' }, { trials: 800, seed: 7 });
  assert.strictEqual(lo.successRate, lo2.successRate);           // reproducible
  assert.ok(lo.successRate > hi.successRate, `${lo.successRate} > ${hi.successRate}`); // more spend, more ruin
  assert.ok(lo.successRate >= 0 && lo.successRate <= 1);
  assert.strictEqual(lo.fan.length, 36); // ages 65..100 inclusive
  assert.strictEqual(lo.fan[0].p50, 1e6); // year 0 balance is the starting balance
});
