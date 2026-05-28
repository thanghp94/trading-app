import { useEffect, useState } from "react";

export interface ChatContext {
  symbol?: string;
  timeframe?: string;
  journalStats?: { totalTrades: number; winRate: number; avgRR: number };
  activePanel?: string;
}

interface JournalStatsResponse {
  total: number;
  wins: number;
  losses: number;
  avgR: number;
}

/** Assembles a context snapshot to send with each chat message. */
export function useChatContext(
  symbol?: string,
  timeframe?: string,
  activePanel?: string,
): ChatContext {
  const [journalStats, setJournalStats] =
    useState<ChatContext["journalStats"]>();

  useEffect(() => {
    fetch("/api/journal/stats")
      .then((r) => r.json() as Promise<JournalStatsResponse>)
      .then((s) =>
        setJournalStats({
          totalTrades: s.total,
          winRate: s.total > 0 ? (s.wins / s.total) * 100 : 0,
          avgRR: s.avgR,
        }),
      )
      .catch(() => {}); // non-critical — chat still works without stats
  }, []);

  return { symbol, timeframe, journalStats, activePanel };
}
