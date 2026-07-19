'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../assets/data.js');
const damodaran = require('../scripts/damodaran-annual.json');

const approx = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('defaultId points at a real dataset', () => {
  assert.ok(D.datasets.some((d) => d.id === D.defaultId), `defaultId ${D.defaultId} not in datasets`);
});

test('every dataset has equal-length, ≥20yr aligned arrays', () => {
  for (const d of D.datasets) {
    assert.strictEqual(d.years.length, d.stockReal.length, `${d.id} years/stockReal length`);
    assert.strictEqual(d.years.length, d.bondReal.length, `${d.id} years/bondReal length`);
    assert.ok(d.years.length >= 20, `${d.id} has only ${d.years.length} years`);
  }
});

test('all real-return values are in a sane range', () => {
  for (const d of D.datasets) {
    for (const v of [...d.stockReal, ...d.bondReal]) {
      assert.ok(v > -0.7 && v < 0.8, `${d.id}: value ${v} out of range`);
    }
  }
});

test('us1928 covers 1928-2025 with no gaps', () => {
  const d = D.datasets.find((x) => x.id === 'us1928');
  assert.ok(d, 'us1928 dataset missing');
  assert.strictEqual(d.from, 1928);
  assert.strictEqual(d.to, 2025);
  assert.strictEqual(d.years[0], 1928);
  assert.strictEqual(d.years[d.years.length - 1], 2025);
  for (let i = 1; i < d.years.length; i++) assert.strictEqual(d.years[i], d.years[i - 1] + 1);
});

test('us1928 anchor years: nominal values match the task brief', () => {
  const idx = (y) => damodaran.years.indexOf(y);
  approx(damodaran.sp500Nominal[idx(1928)], 0.4381);
  approx(damodaran.sp500Nominal[idx(1974)], -0.2590);
  approx(damodaran.tbond10Nominal[idx(1974)], 0.0199);
  approx(damodaran.inflation[idx(1974)], 0.1234);
  approx(damodaran.sp500Nominal[idx(2008)], -0.3655);
  approx(damodaran.tbond10Nominal[idx(2008)], 0.2010);
  approx(damodaran.inflation[idx(2008)], 0.0009);
});

test('us1928 anchor years: bundled real returns equal (1+nominal)/(1+inflation)-1', () => {
  const d = D.datasets.find((x) => x.id === 'us1928');
  const dIdx = (y) => d.years.indexOf(y);
  const jIdx = (y) => damodaran.years.indexOf(y);
  const real = (nom, inf) => (1 + nom) / (1 + inf) - 1;

  for (const y of [1928, 1974, 2008]) {
    const j = jIdx(y), i = dIdx(y);
    approx(d.stockReal[i], real(damodaran.sp500Nominal[j], damodaran.inflation[j]));
    approx(d.bondReal[i], real(damodaran.tbond10Nominal[j], damodaran.inflation[j]));
  }
});
