import { SymbolJsonCache } from "./symbol-json-cache.js";
import type { Fundamentals } from "./types.js";

/** SQLite cache for fundamentals (valuation + statements), table `fundamentals`. */
export class FundamentalsStore extends SymbolJsonCache<Fundamentals> {
  constructor() {
    super("fundamentals");
  }
}
