import { useEffect } from 'react';
import type { Timeframe } from '../shared/types.js';

const TF_BY_KEY: Record<string, Timeframe> = {
  '1': '1m',
  '2': '5m',
  '3': '15m',
  '4': '1h',
  '5': '4h',
  '6': '1d',
};

interface ShortcutHandlers {
  /** Cycle to the next chart cell (j / Tab). */
  nextCell: () => void;
  prevCell: () => void;
  /** Apply timeframe to the active cell. */
  setActiveTimeframe: (tf: Timeframe) => void;
  /** Open the symbol-search overlay on the active cell. */
  openSymbolSearch: () => void;
  /** Toggle the help overlay. */
  toggleHelp: () => void;
  /** Apply a saved layout preset by 1-based index (Shift+1..9). */
  applyPresetByIndex: (idx: number) => void;
  /** Toggle replay mode on the active cell. */
  toggleReplay: () => void;
}

/**
 * Global keyboard shortcuts. Bound to document so they fire from anywhere
 * unless an input/textarea has focus.
 *
 * Layout (memorize once, never look up again):
 *   j / k          — next / prev chart cell
 *   1 .. 6         — set active cell timeframe to 1m / 5m / 15m / 1h / 4h / 1d
 *   s              — open symbol search on active cell
 *   r              — toggle replay on active cell
 *   ?              — toggle this help overlay
 *   Shift+1..9     — apply saved layout preset N
 */
export function useShortcuts(h: ShortcutHandlers) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack typing in inputs.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if ((target as HTMLElement | null)?.isContentEditable) return;

      // Shift+digit → preset
      if (e.shiftKey && /^[1-9]$/.test(e.key)) {
        h.applyPresetByIndex(Number(e.key) - 1);
        e.preventDefault();
        return;
      }

      const k = e.key;
      if (k === 'j' || k === 'J') {
        h.nextCell();
        e.preventDefault();
      } else if (k === 'k' || k === 'K') {
        h.prevCell();
        e.preventDefault();
      } else if (TF_BY_KEY[k]) {
        h.setActiveTimeframe(TF_BY_KEY[k]);
        e.preventDefault();
      } else if (k === 's' || k === 'S') {
        h.openSymbolSearch();
        e.preventDefault();
      } else if (k === 'r' || k === 'R') {
        h.toggleReplay();
        e.preventDefault();
      } else if (k === '?') {
        h.toggleHelp();
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [h]);
}
