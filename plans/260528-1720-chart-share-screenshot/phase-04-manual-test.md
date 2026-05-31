# Phase 04 — Manual Test

## Overview
Priority: P1. Status: pending. Depends on phase 03.
Browser verification — user runs dev server (never auto-run per project rules).

## Checklist
- [ ] tsc / build clean (`pnpm build` or typecheck script)
- [ ] 1-column: 📷 → Download → PNG has header band + single chart, legend + axes intact
- [ ] 2-column: tiles side by side, order matches on-screen left→right
- [ ] 3-column: same, no overlap/clipping
- [ ] Multi-row (e.g. 4 cells / 2 cols): rows stack correctly
- [ ] RSI enabled on a cell: RSI strip appears under that cell's main chart
- [ ] Copy Image: paste into chat/editor works; on perm failure falls back to download
- [ ] Header text: app name · symbols · UTC timestamp readable, not cut off
- [ ] Retina (dpr 2): image sharp, spacing correct
- [ ] Empty grid: shows "No charts to capture", no crash

## Known gaps (document, not fix in v1)
- Triplet mode (TripletView) not captured
- No social share / Copy Link
- Header style fixed dark (no light-theme variant)

## Success
All checklist rows pass in Chrome. Report any fails → fix → re-run.
