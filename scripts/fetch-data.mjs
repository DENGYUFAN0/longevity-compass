/**
 * scripts/fetch-data.mjs — refresh the bundled historical real-return datasets.
 *
 * Builds assets/data.js, which bundles TWO datasets the Monte Carlo bootstraps from
 * (see assets/longevity.js — it only ever consumes cfg.stockReal / cfg.bondReal
 * arrays, so it is dataset-agnostic):
 *
 *   us1928 : S&P 500 (incl. dividends) vs US 10-year T.Bond, 1928–2025, annual.
 *            Source: Aswath Damodaran (NYU Stern) — scripts/damodaran-annual.json,
 *            produced by `python scripts/extract_damodaran.py` (run that first; it
 *            downloads https://pages.stern.nyu.edu/~adamodar/pc/datasets/histretSP.xls).
 *            realReturn = (1 + nominal) / (1 + inflation) − 1, from that file's own
 *            nominal + CPI-inflation columns.
 *   us1989 : ^SP500TR (S&P 500 Total Return) vs VBMFX (Vanguard Total Bond Market),
 *            1989–2025, deflated by FRED CPIAUCSL. Same logic as before this upgrade.
 *            FRED is only reachable from non-mainland-China networks — if it fails,
 *            this dataset is left unchanged (see "partial refresh" below).
 *
 * Partial refresh: each dataset is built independently. If one source fails (e.g. no
 * FRED access), that dataset's *existing* entry in assets/data.js is kept as-is rather
 * than aborting the whole file. DEV/BUILD ONLY — the app never touches the network at
 * runtime. Run:  node scripts/fetch-data.mjs   (Node 18+).
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'assets', 'data.js');
const DAMODARAN_JSON = join(HERE, 'damodaran-annual.json');
const UA = { 'User-Agent': 'Mozilla/5.0 (longevity-compass data refresh)' };
const round4 = (x) => Math.round(x * 1e4) / 1e4;

function loadExisting() {
  try {
    if (!existsSync(OUT)) return null;
    const mod = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function('module', 'self', readFileSync(OUT, 'utf8'))(mod, {});
    const D = mod.exports;
    if (!D) return null;
    if (D.datasets) return D; // already v2
    if (D.years && D.stockReal) {
      // pre-upgrade single-dataset schema (was always the Yahoo+FRED us1989 window).
      return {
        datasets: [{
          id: 'us1989',
          label: { en: 'US 1989–2025 · annual (Yahoo Finance + FRED)', zh: '美国 1989–2025 · 年度(Yahoo Finance + FRED)' },
          source: D.source,
          bondDesc: { en: 'Vanguard Total Bond Market (VBMFX), annual total return', zh: '先锋美国全债市基金(VBMFX),年度总回报' },
          from: D.from, to: D.to, years: D.years, stockReal: D.stockReal, bondReal: D.bondReal,
          note: { en: D.note, zh: D.note }
        }]
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

function findExisting(existing, id) {
  return existing && existing.datasets && existing.datasets.find((d) => d.id === id);
}

// ---- us1928 (Damodaran, offline JSON built by extract_damodaran.py) ----
function buildUs1928(existing) {
  if (!existsSync(DAMODARAN_JSON)) {
    console.warn('  us1928: scripts/damodaran-annual.json missing — run `python scripts/extract_damodaran.py` first. Keeping existing.');
    return findExisting(existing, 'us1928') || null;
  }
  const src = JSON.parse(readFileSync(DAMODARAN_JSON, 'utf8'));
  const years = [], stockReal = [], bondReal = [];
  for (let i = 0; i < src.years.length; i++) {
    const inf = src.inflation[i];
    years.push(src.years[i]);
    stockReal.push(round4((1 + src.sp500Nominal[i]) / (1 + inf) - 1));
    bondReal.push(round4((1 + src.tbond10Nominal[i]) / (1 + inf) - 1));
  }
  return {
    id: 'us1928',
    label: { en: 'US 1928–2025 · annual (Damodaran, NYU Stern)', zh: '美国 1928–2025 · 年度(Damodaran)' },
    source: 'Aswath Damodaran, NYU Stern (histretSP.xls)',
    bondDesc: { en: 'US 10-year Treasury bond, annual total return', zh: '美国10年期国债,年度总回报' },
    from: years[0], to: years[years.length - 1],
    years, stockReal, bondReal,
    note: {
      en: 'Annual REAL total returns (inflation-adjusted). S&P 500 (incl. dividends) vs US 10-year T.Bond.',
      zh: '年度实际总回报(已扣通胀)。标普500(含股息) vs 美国10年期国债。'
    }
  };
}

// ---- us1989 (Yahoo Finance + FRED, online) ----
async function yahooYearEnd(sym) {
  const now = Math.floor(Date.now() / 1000);
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=0&period2=${now}&interval=1mo`;
  const r = await fetch(u, { headers: UA });
  if (!r.ok) throw new Error(`${sym} HTTP ${r.status}`);
  const j = await r.json();
  const res = j.chart && j.chart.result && j.chart.result[0];
  if (!res || !res.timestamp) throw new Error(`${sym}: no data`);
  const adj = (res.indicators.adjclose && res.indicators.adjclose[0].adjclose) || res.indicators.quote[0].close;
  const gmt = (res.meta && res.meta.gmtoffset) || 0;
  const yearEnd = {};
  for (let i = 0; i < res.timestamp.length; i++) {
    const c = adj[i];
    if (c == null || !isFinite(c)) continue;
    const y = new Date((res.timestamp[i] + gmt) * 1000).getUTCFullYear();
    yearEnd[y] = c; // chronological → ends as the last available month of year y
  }
  return yearEnd;
}

// Year-end CPI index per year from FRED CSV. Note: FRED is generally unreachable from
// mainland-China networks (TLS reset) — run this step from elsewhere, or accept that
// us1989 stays at its last-fetched values (see partial-refresh note above).
async function fredYearEnd(series) {
  const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series}`, { headers: UA });
  if (!r.ok) throw new Error(`FRED ${series} HTTP ${r.status}`);
  const txt = await r.text();
  const yearEnd = {};
  for (const line of txt.trim().split('\n').slice(1)) {
    const [date, val] = line.split(',');
    if (!date || val == null || val === '.' || val === '') continue;
    const v = parseFloat(val);
    if (!isFinite(v)) continue;
    yearEnd[+date.slice(0, 4)] = v;
  }
  return yearEnd;
}

async function buildUs1989(existing) {
  try {
    console.log('  us1989: fetching ^SP500TR, VBMFX, CPIAUCSL ...');
    const [spx, bnd, cpi] = await Promise.all([yahooYearEnd('^SP500TR'), yahooYearEnd('VBMFX'), fredYearEnd('CPIAUCSL')]);

    const nowY = new Date().getUTCFullYear();
    const years = [], stockReal = [], bondReal = [];
    const candidate = Object.keys(spx).map(Number).sort((a, b) => a - b);
    for (const y of candidate) {
      if (y >= nowY) continue; // skip the incomplete current year
      if (spx[y - 1] == null || bnd[y] == null || bnd[y - 1] == null || cpi[y] == null || cpi[y - 1] == null) continue;
      const sN = spx[y] / spx[y - 1] - 1;
      const bN = bnd[y] / bnd[y - 1] - 1;
      const inf = cpi[y] / cpi[y - 1] - 1;
      years.push(y);
      stockReal.push(round4((1 + sN) / (1 + inf) - 1));
      bondReal.push(round4((1 + bN) / (1 + inf) - 1));
    }
    if (years.length < 20) throw new Error(`only ${years.length} aligned years`);

    return {
      id: 'us1989',
      label: { en: 'US 1989–2025 · annual (Yahoo Finance + FRED)', zh: '美国 1989–2025 · 年度(Yahoo Finance + FRED)' },
      source: 'Yahoo Finance (^SP500TR, VBMFX) + FRED (CPIAUCSL)',
      bondDesc: { en: 'Vanguard Total Bond Market (VBMFX), annual total return', zh: '先锋美国全债市基金(VBMFX),年度总回报' },
      from: years[0], to: years[years.length - 1],
      years, stockReal, bondReal,
      note: {
        en: 'Annual REAL total returns (inflation-adjusted, dividends reinvested).',
        zh: '年度实际总回报(已扣通胀,股息再投资)。'
      }
    };
  } catch (e) {
    console.warn(`  us1989: fetch failed (${e.message}) — keeping existing dataset unchanged.`);
    return findExisting(existing, 'us1989') || null;
  }
}

const existing = loadExisting();
const us1928 = buildUs1928(existing);
const us1989 = await buildUs1989(existing);

const datasets = [us1928, us1989].filter(Boolean);
if (datasets.length === 0) { console.error('\nNo datasets available (fresh and no existing data.js) — aborting.'); process.exit(1); }

const gm = (a) => Math.pow(a.reduce((p, r) => p * (1 + r), 1), 1 / a.length) - 1;
const out = {
  generated: new Date().toISOString().slice(0, 10),
  defaultId: datasets.some((d) => d.id === 'us1928') ? 'us1928' : datasets[0].id,
  datasets
};

const banner = `/* AUTO-GENERATED by scripts/fetch-data.mjs — do not edit by hand.\n`
  + ` * Two historical real-return datasets for the Monte Carlo engine:\n`
  + ` *  us1928 — S&P 500 vs US 10yr T.Bond, 1928-2025, via Aswath Damodaran (NYU Stern).\n`
  + ` *  us1989 — ^SP500TR vs VBMFX, 1989-2025, via Yahoo Finance + FRED (CPIAUCSL).\n`
  + ` * Refresh: run \`python scripts/extract_damodaran.py\` then \`npm run fetch-data\`. */\n`;
writeFileSync(OUT, banner
  + `(function(root){var D=${JSON.stringify(out)};`
  + `if(typeof module==='object'&&module.exports)module.exports=D;else root.LC_DATA=D;`
  + `})(typeof self!=='undefined'?self:this);\n`);

for (const d of datasets) {
  console.log(`  ${d.id}: wrote ${d.years.length} yrs (${d.from}–${d.to})  |  real CAGR: stock ${(gm(d.stockReal) * 100).toFixed(1)}%, bond ${(gm(d.bondReal) * 100).toFixed(1)}%`);
}
