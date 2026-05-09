type Listener = (time: number | null) => void;

const listeners = new Set<Listener>();

/**
 * Tiny pub/sub for crosshair-time sync across chart cells.
 *
 * Each Chart subscribes; when its own crosshair moves, it publishes the
 * timestamp; every other Chart receives it and moves its crosshair to the
 * matching bar (lightweight-charts has setCrosshairPosition for this).
 *
 * Pure module-level state. KISS — no React context needed; React doesn't
 * need to re-render to consume crosshair events.
 */
export const crosshairBus = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  publish(time: number | null): void {
    for (const l of listeners) l(time);
  },
};
