#!/usr/bin/env python3
"""Emit VN-equity fundamentals (valuation + quarterly statements) as JSON on stdout.

Usage: python3 vnstock-fundamentals.py <SYMBOL>

Contract (stdout, single JSON object):
  { "valuation": { "pe","pb","roe","eps","marketCap","dividendYield" },
    "statements": [ { "period","revenue","grossProfit","netProfit",
                      "totalAssets","totalEquity","operatingCashflow" }, ... ] }

vnstock 4.0.4 prints deprecation/ad banners to stdout on data calls, so all
library work runs with stdout redirected; only the final JSON reaches the real
stdout. Any failure prints to stderr and exits non-zero so the caller detects it.
"""
import sys
import io
import json
import contextlib
import warnings

QUARTERS = 8  # last N quarters, most-recent-first

# vnstock item_id keys -> our statement fields
INCOME_KEYS = {
    "revenue": "net_sales",
    "grossProfit": "gross_profit",
    "netProfit": "net_profit_loss_after_tax",
}
EPS_KEY = "eps_basic_vnd"
BALANCE_KEYS = {
    "totalAssets": "total_assets",
    "totalEquity": "owners_equity",
}
CASHFLOW_KEYS = {
    "operatingCashflow": "net_cash_inflows_outflows_from_operating_activities",
}


def _num(v):
    """Coerce a cell to float, or None when missing/blank/NaN."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return f


def _period_columns(df):
    """Statement period columns look like '2026-Q1'; meta cols don't.

    Sorted most-recent-first so the caller's statements[0] is always the latest,
    even if the upstream source changes its column order. 'YYYY-QN' labels sort
    correctly under reverse lexical order.
    """
    cols = [c for c in df.columns if isinstance(c, str) and "-Q" in c]
    return sorted(cols, reverse=True)


def _row_by_item_id(df, item_id):
    """Return the single statement row (Series) whose item_id matches, or None."""
    hit = df[df["item_id"] == item_id]
    if hit.empty:
        return None
    return hit.iloc[0]


def build(symbol):
    from vnstock import Finance, Company

    fin = Finance(symbol=symbol, source="VCI", period="quarter")
    inc = fin.income_statement(period="quarter", lang="en")
    bal = fin.balance_sheet(period="quarter", lang="en")
    cf = fin.cash_flow(period="quarter", lang="en")
    summary = Company(symbol=symbol, source="VCI").ratio_summary()

    # Periods come most-recent-first from VCI; keep the income statement's order
    # as the canonical period axis and take the latest QUARTERS.
    periods = _period_columns(inc)[:QUARTERS]

    rows = {
        **{f: _row_by_item_id(inc, k) for f, k in INCOME_KEYS.items()},
        "eps": _row_by_item_id(inc, EPS_KEY),
        **{f: _row_by_item_id(bal, k) for f, k in BALANCE_KEYS.items()},
        **{f: _row_by_item_id(cf, k) for f, k in CASHFLOW_KEYS.items()},
    }

    def cell(field, period):
        r = rows.get(field)
        if r is None or period not in r.index:
            return None
        return _num(r[period])

    statements = [
        {
            "period": p,
            "revenue": cell("revenue", p),
            "grossProfit": cell("grossProfit", p),
            "netProfit": cell("netProfit", p),
            "totalAssets": cell("totalAssets", p),
            "totalEquity": cell("totalEquity", p),
            "operatingCashflow": cell("operatingCashflow", p),
        }
        for p in periods
    ]

    # Valuation snapshot: ratio_summary is ascending, so the last row is latest.
    latest = summary.iloc[-1] if not summary.empty else None

    def sval(key):
        if latest is None or key not in latest.index:
            return None
        return _num(latest[key])

    # EPS snapshot = most-recent statement period.
    eps = cell("eps", periods[0]) if periods else None

    valuation = {
        "pe": sval("pe"),
        "pb": sval("pb"),
        "roe": sval("roe"),
        "eps": eps,
        "marketCap": sval("market_cap"),
        "dividendYield": sval("dividend_yield"),
    }

    return {"valuation": valuation, "statements": statements}


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print("usage: vnstock-fundamentals.py <SYMBOL>", file=sys.stderr)
        sys.exit(2)
    symbol = sys.argv[1].strip().upper()
    warnings.filterwarnings("ignore")
    try:
        # Silence vnstock's stdout banners; capture only our JSON.
        with contextlib.redirect_stdout(io.StringIO()):
            result = build(symbol)
    except Exception as exc:  # noqa: BLE001 - surface any failure to the caller
        print(f"vnstock fundamentals failed for {symbol}: {exc}", file=sys.stderr)
        sys.exit(1)
    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
