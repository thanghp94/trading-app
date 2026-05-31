import { SymbolJsonCache } from "./symbol-json-cache.js";
import type { Ownership } from "./ownership-types.js";

/** SQLite cache for ownership data, table `ownership`. */
export class OwnershipStore extends SymbolJsonCache<Ownership> {
  constructor() {
    super("ownership");
  }
}
