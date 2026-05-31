import { SymbolJsonCache } from "./symbol-json-cache.js";
import type { CorpActionCalendar } from "./corp-action-types.js";

/** SQLite cache for the corporate-action calendar, table `corp_events`. */
export class CorpActionStore extends SymbolJsonCache<CorpActionCalendar> {
  constructor() {
    super("corp_events");
  }
}
