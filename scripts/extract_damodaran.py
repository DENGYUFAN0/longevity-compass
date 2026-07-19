"""scripts/extract_damodaran.py — extract the Damodaran (NYU Stern) annual returns
history into scripts/damodaran-annual.json. DEV/BUILD ONLY, not run by the app.

Source: "Returns by year" sheet of
  https://pages.stern.nyu.edu/~adamodar/pc/datasets/histretSP.xls
Columns used (0-indexed, header row is row 19 of the sheet):
  0  Year
  1  S&P 500 (includes dividends)   — nominal
  4  US T. Bond (10-year)           — nominal
  20 Inflation Rate

Usage:
  python scripts/extract_damodaran.py                  # downloads the .xls
  python scripts/extract_damodaran.py path\to\file.xls  # uses a local copy

Requires: pandas, xlrd (both already present in this machine's conda base).
Idempotent: re-running always re-derives the same JSON from the same source data,
and the three anchor-year assertions below must hold or the script aborts without
writing anything.
"""
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

import pandas as pd

URL = "https://pages.stern.nyu.edu/~adamodar/pc/datasets/histretSP.xls"
OUT = Path(__file__).resolve().parent / "damodaran-annual.json"

# (year, S&P 500 nominal, T.Bond 10yr nominal, inflation) — from the task brief.
ANCHORS = {
    1928: (0.4381, None, None),
    1974: (-0.2590, 0.0199, 0.1234),
    2008: (-0.3655, 0.2010, 0.0009),
}


def load_bytes(path_or_none):
    if path_or_none:
        return Path(path_or_none).read_bytes()
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main():
    local_path = sys.argv[1] if len(sys.argv) > 1 else None
    raw = load_bytes(local_path)
    tmp = OUT.parent / "_histretSP.xls"
    tmp.write_bytes(raw)
    try:
        df = pd.read_excel(tmp, sheet_name="Returns by year", header=None)
    finally:
        tmp.unlink(missing_ok=True)

    years, sp500, tbond, infl = [], [], [], []
    for i in range(20, df.shape[0]):
        y = df.iloc[i, 0]
        if not isinstance(y, (int, float)) or pd.isna(y):
            continue
        y = int(y)
        s, b, f = df.iloc[i, 1], df.iloc[i, 4], df.iloc[i, 20]
        if pd.isna(s) or pd.isna(b) or pd.isna(f):
            continue
        years.append(y)
        sp500.append(round(float(s), 6))
        tbond.append(round(float(b), 6))
        infl.append(round(float(f), 6))

    if years[0] != 1928 or years[-1] < 2024 or len(years) < 90:
        raise SystemExit(f"Unexpected year range: {years[0]}-{years[-1]} ({len(years)} rows)")

    idx = {y: i for i, y in enumerate(years)}
    for y, (exp_s, exp_b, exp_f) in ANCHORS.items():
        if y not in idx:
            raise SystemExit(f"Anchor year {y} missing from extracted data")
        i = idx[y]
        if abs(sp500[i] - exp_s) > 1e-3:
            raise SystemExit(f"Anchor {y} S&P mismatch: got {sp500[i]}, expected {exp_s}")
        if exp_b is not None and abs(tbond[i] - exp_b) > 1e-3:
            raise SystemExit(f"Anchor {y} T.Bond mismatch: got {tbond[i]}, expected {exp_b}")
        if exp_f is not None and abs(infl[i] - exp_f) > 1e-3:
            raise SystemExit(f"Anchor {y} inflation mismatch: got {infl[i]}, expected {exp_f}")

    out = {
        "source": "Aswath Damodaran, NYU Stern — Annual Returns on Stock, T.Bonds and T.Bills",
        "url": URL,
        "retrieved": date.today().isoformat(),
        "years": years,
        "sp500Nominal": sp500,
        "tbond10Nominal": tbond,
        "inflation": infl,
    }
    OUT.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"wrote {OUT} — {len(years)} years ({years[0]}-{years[-1]}), anchors OK")


if __name__ == "__main__":
    main()
