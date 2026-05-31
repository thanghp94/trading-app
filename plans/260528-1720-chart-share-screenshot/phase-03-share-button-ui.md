# Phase 03 — Share Button UI

## Overview
Priority: P0. Status: pending. Depends on phase 02.
One 📷 button in the header → dropdown (Download PNG / Copy Image). Progressive
disclosure: collapsed by default, actions hidden until clicked.

## Files
- CREATE `src/web/components/ShareButton.tsx`
- EDIT `src/web/App.tsx`

## ShareButton.tsx
Props:
```ts
interface ShareButtonProps {
  cells: CellConfig[];
  cols: number;
}
```
- Local `open` state; button toggles a small absolute dropdown (2 items).
- Style to match existing header buttons (reuse the look of `themeBtnStyle` /
  `helpBtnStyle` in App.tsx — `#21262d` bg, `#30363d` border, `#8b949e` text).
- Actions call `composeShareImage({ cells, cols })`:
  - **Download PNG**: `canvas.toBlob(blob => { a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(...) }, "image/png")`.
    filename = `trading-app-${symbols}-${yyyymmdd-hhmm}.png` (sanitize symbols).
  - **Copy Image**: `canvas.toBlob` → `navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])`.
    - Wrap in try/catch; on failure (perm / insecure ctx) fall back to download + brief inline note.
- If `composeShareImage` returns null → show "No charts to capture".
- Close dropdown after an action.

## App.tsx
Mount in `<header>` near LayoutControls:
```tsx
<ShareButton cells={layout.cells} cols={layout.cols} />
```

## Notes
- Clipboard image write needs secure context — localhost qualifies in dev.
- Keep component < 120 lines; extract export helpers into chart-screenshot.ts if
  it grows (`downloadCanvas`, `copyCanvas`).

## Todo
- [ ] Build ShareButton with dropdown + 2 actions + null/error handling
- [ ] Copy Image fallback → download on failure
- [ ] Mount in App header
- [ ] tsc compiles clean

## Success
Clicking 📷 shows menu; Download saves a PNG; Copy Image puts PNG on clipboard
(or falls back). Menu collapses after use; header stays uncluttered.
