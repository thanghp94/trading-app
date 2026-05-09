import { useCallback, useEffect, useState } from 'react';

export type TradeOutcome = 'open' | 'win' | 'loss' | 'breakeven' | 'cancelled';

export interface TradeRow {
  id: string;
  alert_id: string | null;
  symbol: string;
  timeframe: string;
  direction: 'bull' | 'bear';
  rule: string | null;
  entry_price: number;
  sl: number | null;
  tp: number | null;
  exit_price: number | null;
  outcome: TradeOutcome;
  r_multiple: number | null;
  notes: string | null;
  opened_at: number;
  closed_at: number | null;
}

export interface JournalStats {
  total: number;
  wins: number;
  losses: number;
  breakeven: number;
  open: number;
  avgR: number;
}

/** Hook around the journal REST endpoints. Polls every 15s for new trades. */
export function useJournal() {
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [stats, setStats] = useState<JournalStats>({ total: 0, wins: 0, losses: 0, breakeven: 0, open: 0, avgR: 0 });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/journal');
      const json = (await res.json()) as { trades: TradeRow[]; stats: JournalStats };
      setTrades(json.trades);
      setStats(json.stats);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(
    async (id: string, patch: Partial<Pick<TradeRow, 'sl' | 'tp' | 'exit_price' | 'outcome' | 'notes'>>) => {
      const res = await fetch(`/api/journal/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
    const id = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { trades, stats, loading, refresh, update };
}
