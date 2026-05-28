import { ALL_TRACKED_SYMBOLS, VN30_SYMBOLS } from "../market/sector-map.js";

/** Named symbol universes to scan. VN100 list is a known gap — see plan open questions. */
export type UniverseName = "vn30" | "tracked";

/**
 * Resolve a universe name to its symbol list. "tracked" = the ~90 sector-mapped
 * symbols (proxy for VN100 until a real VN100 list is sourced).
 */
export function getUniverse(name: UniverseName = "vn30"): string[] {
  switch (name) {
    case "vn30":
      return [...VN30_SYMBOLS];
    case "tracked":
      return [...ALL_TRACKED_SYMBOLS];
  }
}
