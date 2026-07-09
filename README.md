# Longevity Compass · 养老罗盘 ✦

![longevity-compass — retirement money-survival simulator](docs/hero.svg)

A **retirement money-survival simulator**. Given a nest egg, a spending plan, and an asset mix, it runs a **Monte Carlo** over **real historical returns** and answers the only question that matters in retirement: **will your money outlast you?** It runs entirely in your browser — your numbers never leave your device.

> 一个**退休"钱够不够"模拟器**。给定养老资产、支出计划与股债搭配,用**真实历史收益**做上千次**蒙特卡洛**重演,回答退休阶段最要命的问题:**钱会不会比人先走?** 纯前端运行,数据不出本地。

![no dependencies](https://img.shields.io/badge/dependencies-0-2f7d4f) ![method](https://img.shields.io/badge/method-monte%20carlo-1f6f63) ![tests](https://img.shields.io/badge/tests-node%3Atest-9a7b1f) ![bilingual](https://img.shields.io/badge/UI-中文%20%2F%20EN-b4541f) ![license](https://img.shields.io/badge/license-MIT-b4541f)

## Why it's different

Most retirement calculators quietly lie to you by using a single average return. This one takes seriously the two risks that actually sink retirements:

- **Sequence-of-returns risk.** At the *same* average return, a bear market in the **first few years** — while you're withdrawing — can permanently sink a portfolio. Your luck at the **start** of retirement matters more than the long-run average. The fan chart makes this visible: a wide band means timing dominates.
- **Longevity risk.** "Plan to life expectancy" is a coin flip — by definition, **half of people live longer**. By default the tool randomizes lifespan with a Gompertz mortality curve, so "success" means your money lasts as long as *you* actually do, not just to the average.

## Features

- 🎲 **Monte Carlo** over real historical returns (block bootstrap preserves sequence realism)
- 📈 **Fan chart** of possible balances by age — the spread *is* the sequence risk
- 📉 **Withdrawal-rate → success curve**, so you can see the cliff before you walk off it
- 🎚️ Three withdrawal strategies: fixed-real, **guardrails** (Guyton–Klinger-style), percent-of-portfolio
- ⚰️ **Longevity modeled** (Gompertz) or plan-to-a-fixed-age
- 🌏 Bilingual (中文 / English), everything in today's money, 100% client-side, zero dependencies

## Try it

- **Hosted:** <https://dengyufan0.github.io/longevity-compass/>
- **Locally:** open `index.html` in a browser. No build, no server.

## How it works

Year by year in retirement: you withdraw at the **start** of the year per your strategy, then the remainder earns **that year's real return** (sampled from history). Repeat over the modeled lifespan; repeat the whole life a thousand+ times. **Success rate** = the share of lives in which you never ran out of money while alive.

- **Real terms.** Returns are inflation-adjusted and spending is constant-real, so every number is today's purchasing power.
- **Strategies.** *Fixed* = constant purchasing power (classic 4%-rule shape, most fragile). *Guardrails* = trim spending when the withdrawal rate drifts high, raise it when low. *Percent* = never hits zero, but income swings with markets.
- **Longevity.** A Gompertz curve (death hazard rises exponentially with age) calibrated to a chosen life expectancy. Real period life tables (SSA / WHO / China) are a documented upgrade.

Background: Bengen (1994) and the *Trinity study* on safe withdrawal rates; Guyton & Klinger (2006) on decision-rule "guardrails"; the sequence-of-returns literature; Gompertz (1825) on the law of mortality.

## Trust the math

The engine (`assets/longevity.js`) is pure, framework-free, and unit-tested — the withdrawal state machine, sequence-risk ordering, the bootstrap, the Gompertz calibration, and Monte Carlo reproducibility are all checked against hand-computed cases.

```bash
node --test          # test/longevity.test.js — no dependencies (Node 18+)
npm run fetch-data   # refresh the bundled real-return history
```

## Data & honest limits

Bundled **annual real total returns**: S&P 500 (total return) and US total-bond, deflated by CPI — via Yahoo Finance and FRED. **This is a favorable, ~1989-onward US window.** It does **not** include worse earlier sequences (e.g. 1970s stagflation, the Great Depression), so **real-world risk is likely higher than shown** — longer history (1928+) and China/Korea series are the top data upgrades. The model also ignores taxes, fees beyond your input, long-term-care shocks, pensions/social security, and single-country risk.

**It is a planning compass, not an actuary — and not investment or financial advice.**

## Project structure

```
longevity-compass/
├── index.html
├── assets/
│   ├── longevity.js        # pure Monte Carlo engine (browser + Node, UMD)
│   ├── data.js             # bundled real-return history (auto-generated)
│   ├── app.js              # UI, i18n, SVG fan chart + curve, localStorage
│   └── style.css
├── scripts/fetch-data.mjs  # refresh the history from Yahoo Finance + FRED
├── test/longevity.test.js  # node:test unit tests
└── .github/workflows/      # CI (tests) + auto-deploy to GitHub Pages
```

## Deploy on GitHub Pages

The workflow runs the tests and publishes on every push to `main`. Turn it on once: **Settings → Pages → Source: GitHub Actions**. Live at `https://<you>.github.io/longevity-compass/`.

## License

[MIT](LICENSE) — do anything, no warranty. Not financial advice.
