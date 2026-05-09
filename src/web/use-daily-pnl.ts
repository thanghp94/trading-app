import { useEffect, useState } from 'react';

interface DailyPnl {
  closedToday: number;
  rToday: number;
  pnlAbs: number;
  wins: number;
  losses: number;
}

const STORAGE_KEY = 'trading-app:daily-pnl-v1';

interface TradeRow {
  outcome: string;
  r_multiple: number | null;
  closed_at: number | null;
}

/**
 * Pulls journal trades and aggregates today's (UTC) closed trades:
 * count, R-sum, hypothetical P&L (R × default-risk-per-trade), win/loss counts.
 *
 * "Today" is calendar UTC day. Use as a header readout — at-a-glance answer
 * to "how am I doing today?".
 */
export function useDailyPnl(riskPerTradeUsd = 100): DailyPnl {
  const [stats, setStats] = useState<DailyPnl>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as DailyPnl;
    } catch {
      /* ignore */
    }
    return { closedToday: 0, rToday: 0, pnlAbs: 0, wins: 0, losses: 0 };
  });

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch('/api/journal');
        const json = (await res.json()) as { trades: TradeRow[] };
        if (cancelled) return;
        const todayUtc = new Date().toISOString().slice(0, 10);
        const todays = json.trades.filter((t) => {
          if (!t.closed_at) return false;
          return new Date(t.closed_at * 1000).toISOString().slice(0, 10) === todayUtc;
        });
        let r = 0;
        let wins = 0;
        let losses = 0;
        for (const t of todays) {
          if (t.r_multiple != null) r += t.r_multiple;
          if (t.outcome === 'win') wins += 1;
          else if (t.outcome === 'loss') losses += 1;
        }
        const next: DailyPnl = { closedToday: todays.length, rToday: r, pnlAbs: r * riskPerTradeUsd, wins, losses };
        setStats(next);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* quota */ }
      } catch {
        /* ignore network blips */
      }
    };
    void refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [riskPerTradeUsd]);

  return stats;
}
