/** Ownership domain types — structure + major shareholders + officers. */

export interface OwnershipStructure {
  foreignPct: number | null;
  statePct: number | null;
  freeFloatPct: number | null;
}

export interface Shareholder {
  name: string | null;
  quantity: number | null;
  pct: number | null;
  asOf: string | null;
}

export interface Officer {
  name: string | null;
  position: string | null;
  quantity: number | null;
  pct: number | null;
}

export interface Ownership {
  symbol: string;
  structure: OwnershipStructure;
  shareholders: Shareholder[];
  officers: Officer[];
  asOf: number; // epoch ms when fetched
}

/** Raw JSON shape emitted by scripts/vnstock-ownership.py (no symbol/asOf). */
export interface RawOwnership {
  structure: OwnershipStructure;
  shareholders: Shareholder[];
  officers: Officer[];
}
