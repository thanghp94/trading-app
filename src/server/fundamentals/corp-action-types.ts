/** Corporate-action calendar types — dividends, issues, AGMs, director deals, … */

export interface CorpEvent {
  code: string | null; // DIV, ISS, AGME, AIS, DDIND, …
  category: string | null; // e.g. DIVIDEND
  nameVi: string | null;
  nameEn: string | null;
  titleVi: string | null;
  titleEn: string | null;
  date: string | null; // primary sort date, YYYY-MM-DD
  publicDate: string | null;
  recordDate: string | null;
  exrightDate: string | null;
  payoutDate: string | null;
  valuePerShare: number | null; // VND per share (dividends)
  exerciseRatio: number | null;
}

export interface CorpActionCalendar {
  symbol: string;
  events: CorpEvent[];
  asOf: number; // epoch ms when fetched
}

/** Raw JSON shape emitted by scripts/vnstock-corp-actions.py (no symbol/asOf). */
export interface RawCorpActions {
  events: CorpEvent[];
}
