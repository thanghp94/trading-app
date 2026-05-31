#!/usr/bin/env python3
"""Emit VN-equity corporate-action calendar (dividends, issues, AGMs, …) as JSON.

Usage: python3 vnstock-corp-actions.py <SYMBOL>

Contract (stdout, single JSON object):
  { "events": [ { "code","category","nameVi","nameEn","titleVi","titleEn",
                  "date","publicDate","recordDate","exrightDate","payoutDate",
                  "valuePerShare","exerciseRatio" }, ... ] }

`date` is the primary sort key — first non-null of exright / record / public /
payout — and the list is sorted descending on it. All dates are normalised to
`YYYY-MM-DD`. Like the sibling scripts, vnstock work runs with stdout redirected;
only the final JSON reaches real stdout; failures exit non-zero with a stderr note.
"""
import sys
import io
import json
import contextlib
import warnings

MAX_EVENTS = 50


def _num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return f


def _date(v):
    """Normalise a date-like cell to 'YYYY-MM-DD', or None."""
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() == "nan" or len(s) < 10:
        return None
    return s[:10]


def _str(v):
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() == "nan":
        return None
    return s


def build(symbol):
    from vnstock import Company

    ev = Company(symbol=symbol, source="VCI").events()

    events = []
    if not ev.empty:
        for _, r in ev.iterrows():

            def cell(key):
                return r[key] if key in r.index else None

            public_date = _date(cell("public_date"))
            record_date = _date(cell("record_date"))
            exright_date = _date(cell("exright_date"))
            payout_date = _date(cell("payout_date"))
            # Primary date for sorting: prefer the ex-right, then record, etc.
            primary = exright_date or record_date or public_date or payout_date

            events.append(
                {
                    "code": _str(cell("event_code")),
                    "category": _str(cell("category")),
                    "nameVi": _str(cell("event_name_vi")),
                    "nameEn": _str(cell("event_name_en")),
                    "titleVi": _str(cell("event_title_vi")),
                    "titleEn": _str(cell("event_title_en")),
                    "date": primary,
                    "publicDate": public_date,
                    "recordDate": record_date,
                    "exrightDate": exright_date,
                    "payoutDate": payout_date,
                    "valuePerShare": _num(cell("value_per_share")),
                    "exerciseRatio": _num(cell("exercise_ratio")),
                }
            )

    # Most-recent-first; rows without any date sort last.
    events.sort(key=lambda e: e["date"] or "", reverse=True)
    return {"events": events[:MAX_EVENTS]}


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print("usage: vnstock-corp-actions.py <SYMBOL>", file=sys.stderr)
        sys.exit(2)
    symbol = sys.argv[1].strip().upper()
    warnings.filterwarnings("ignore")
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            result = build(symbol)
    except Exception as exc:  # noqa: BLE001 - surface any failure to the caller
        print(f"vnstock corp-actions failed for {symbol}: {exc}", file=sys.stderr)
        sys.exit(1)
    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
