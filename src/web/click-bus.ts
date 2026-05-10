type Listener = (time: number, symbol: string) => void;

const listeners = new Set<Listener>();

/**
 * Click-to-jump synchronization across cells.
 *
 * When the user clicks a bar on any chart, that chart publishes the bar
 * time + the cell's symbol. Every other Chart subscribes; if the published
 * symbol matches the subscriber's own symbol, the subscriber scrolls its
 * visible range to center on that timestamp.
 *
 * The symbol filter is what makes the H1 → 15m → 5m triplet click flow:
 * all three cells share the same symbol, so a click on any of them scrolls
 * the other two to the same area. Cells with different symbols ignore.
 */
export const clickBus = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  publish(time: number, symbol: string): void {
    for (const l of listeners) l(time, symbol);
  },
};
