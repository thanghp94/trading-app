#!/usr/bin/env python3
"""Emit VN-equity ownership (structure + shareholders + officers) as JSON on stdout.

Usage: python3 vnstock-ownership.py <SYMBOL>

Contract (stdout, single JSON object):
  { "structure":    { "foreignPct","statePct","freeFloatPct" },
    "shareholders": [ { "name","quantity","pct","asOf" }, ... ],   # top N by %
    "officers":     [ { "name","position","quantity","pct" }, ... ] }

Insider deals are intentionally absent: vnstock 4.0.4 does not provide them on the
free VCI/KBS sources.

Like the fundamentals script, all vnstock work runs with stdout redirected (the
library prints banners to stdout); only the final JSON reaches real stdout. Any
failure prints to stderr and exits non-zero so the caller detects it.
"""
import sys
import io
import json
import contextlib
import warnings

TOP_SHAREHOLDERS = 20


def _num(v):
    """Coerce to float, or None when missing/blank/NaN."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return f


def _str(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _cell(row, key):
    """Read a column from a pandas row Series, tolerating absence."""
    try:
        if key in row.index:
            return row[key]
    except AttributeError:
        pass
    return None


def build(symbol):
    from vnstock import Company

    co = Company(symbol=symbol, source="VCI")
    sh = co.shareholders()
    off = co.officers()
    stats = co.trading_stats()

    stat_row = stats.iloc[0] if not stats.empty else None
    structure = {
        "foreignPct": _num(_cell(stat_row, "foreigner_percentage")) if stat_row is not None else None,
        "statePct": _num(_cell(stat_row, "state_percentage")) if stat_row is not None else None,
        "freeFloatPct": _num(_cell(stat_row, "free_float_percentage")) if stat_row is not None else None,
    }

    shareholders = []
    if not sh.empty:
        ranked = sh.sort_values("share_own_percent", ascending=False).head(
            TOP_SHAREHOLDERS
        )
        for _, r in ranked.iterrows():
            shareholders.append(
                {
                    "name": _str(_cell(r, "share_holder")),
                    "quantity": _num(_cell(r, "quantity")),
                    "pct": _num(_cell(r, "share_own_percent")),
                    "asOf": _str(_cell(r, "update_date")),
                }
            )

    officers = []
    if not off.empty:
        for _, r in off.iterrows():
            officers.append(
                {
                    "name": _str(_cell(r, "officer_name")),
                    "position": _str(_cell(r, "officer_position")),
                    "quantity": _num(_cell(r, "officer_own_quantity")),
                    "pct": _num(_cell(r, "officer_own_percent")),
                }
            )

    return {
        "structure": structure,
        "shareholders": shareholders,
        "officers": officers,
    }


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print("usage: vnstock-ownership.py <SYMBOL>", file=sys.stderr)
        sys.exit(2)
    symbol = sys.argv[1].strip().upper()
    warnings.filterwarnings("ignore")
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            result = build(symbol)
    except Exception as exc:  # noqa: BLE001 - surface any failure to the caller
        print(f"vnstock ownership failed for {symbol}: {exc}", file=sys.stderr)
        sys.exit(1)
    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
