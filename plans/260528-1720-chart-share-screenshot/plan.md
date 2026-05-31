# Chart Share / Screenshot — v1

GoCharting-style "Share" button: capture visible chart grid → composite PNG with
branding header → Download or Copy Image. Single + multi-column (2/3) layouts.

## Scope (v1)

IN:
- One 📷 Share button in header toolbar → dropdown (Download PNG / Copy Image)
- Capture all grid cells in `layout.cells` order, arranged to match `layout.cols`
- Branding header bar (app name · symbols · UTC timestamp)
- RSI sub-chart stacked under its cell when enabled

OUT (later):
- Social share buttons (FB/Twitter/Telegram) — needs image hosting
- Copy Link / shareable URL state
- Triplet mode (TripletView) capture — standard grid only in v1

## Approach

`lightweight-charts` v5 `IChartApi.takeScreenshot()` → `HTMLCanvasElement`.
Each cell registers its chart API in a module-level registry (same pattern as
`crosshair-bus.ts`). Share handler reads `layout.cells` + `cols`, pulls each
handle from registry, composites onto a master canvas with a header, exports.

## Phases

| # | File | Status |
|---|------|--------|
| 1 | [phase-01-chart-registry.md](phase-01-chart-registry.md) — expose chart API via registry | DONE |
| 2 | [phase-02-compose-screenshot.md](phase-02-compose-screenshot.md) — capture + composite util | DONE |
| 3 | [phase-03-share-button-ui.md](phase-03-share-button-ui.md) — header button + dropdown + export | DONE |
| 4 | [phase-04-manual-test.md](phase-04-manual-test.md) — browser verification | pending (user runs server) |

## Implementation deviations
- Registry handle dropped `symbol`/`timeframe` (compose reads `CellConfig.symbol`) — avoids stale-closure bug.
- Header: app-name only (no user-name source in codebase). GoCharting-style "Created by {name}" deferred.

## Review fixes applied (code-reviewer)
- Deferred `URL.revokeObjectURL` 1s — sync revoke can cancel download.
- try/catch + dropdown-close in both share handlers.
- Outside-click / Escape dismissal on dropdown.

## Known gaps (documented, not v1)
- No oversize-canvas downscale guard (>16384px) — fine for 1–3 col personal use.
- Header symbol list / TZ-vs-filename: cosmetic, unhandled.
- No automated tests: canvas `takeScreenshot`/`toBlob` + clipboard not available in jsdom → verified via phase-04 manual browser test instead.

## Key files

- NEW `src/web/chart-registry.ts`
- NEW `src/web/chart-screenshot.ts`
- NEW `src/web/components/ShareButton.tsx`
- EDIT `src/web/components/Chart.tsx` (register/unregister, add `id`+`timeframe` props)
- EDIT `src/web/components/ChartCell.tsx` (pass `cell.id`, `cell.timeframe`)
- EDIT `src/web/App.tsx` (mount ShareButton in header, pass cells+cols)

## Risks

- Copy Image needs secure context (localhost OK) + clipboard perms → fallback to download
- `takeScreenshot()` returns canvas at devicePixelRatio → scale header font by ratio
- RSI separate instance → extra capture; off by default so low-risk
