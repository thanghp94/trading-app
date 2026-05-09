import { useEffect, useState } from 'react';

type Session = { name: string; openUtcHour: number; closeUtcHour: number; openMin?: number; closeMin?: number; days?: number[] };

/**
 * Major sessions in UTC. Vietnam (HOSE) trades 02:00–04:30 + 06:00–08:00 UTC
 * (which is 09:00–11:30 + 13:00–15:00 ICT). Days: Mon–Fri.
 *
 * Crypto is not a session — always green badge.
 */
const SESSIONS: Session[] = [
  { name: 'HOSE-AM', openUtcHour: 2, openMin: 15, closeUtcHour: 4, closeMin: 30, days: [1, 2, 3, 4, 5] },
  { name: 'HOSE-PM', openUtcHour: 6, closeUtcHour: 8, days: [1, 2, 3, 4, 5] },
  { name: 'London', openUtcHour: 7, closeUtcHour: 16, days: [1, 2, 3, 4, 5] },
  { name: 'NY', openUtcHour: 13, openMin: 30, closeUtcHour: 20, days: [1, 2, 3, 4, 5] },
  { name: 'Tokyo', openUtcHour: 0, closeUtcHour: 6, days: [1, 2, 3, 4, 5] },
];

function isSessionOpen(s: Session, now: Date): boolean {
  const utcDay = now.getUTCDay();
  if (s.days && !s.days.includes(utcDay)) return false;
  const minutesNow = now.getUTCHours() * 60 + now.getUTCMinutes();
  const open = s.openUtcHour * 60 + (s.openMin ?? 0);
  const close = s.closeUtcHour * 60 + (s.closeMin ?? 0);
  return minutesNow >= open && minutesNow < close;
}

/**
 * Floating market-session badges. Glanceable at-a-glance "what's open right
 * now?" — useful for avoiding dead hours and timing entries to liquid
 * sessions. Refreshes every minute.
 */
export function MarketSessions() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div style={wrapStyle}>
      {SESSIONS.map((s) => {
        const open = isSessionOpen(s, now);
        return (
          <span key={s.name} style={{ ...badgeStyle, ...(open ? activeStyle : {}) }} title={`${s.openUtcHour.toString().padStart(2, '0')}:${(s.openMin ?? 0).toString().padStart(2, '0')}–${s.closeUtcHour.toString().padStart(2, '0')}:${(s.closeMin ?? 0).toString().padStart(2, '0')} UTC`}>
            {open ? '🟢' : '⚪'} {s.name}
          </span>
        );
      })}
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: 'flex', gap: 4, flexWrap: 'wrap',
};
const badgeStyle: React.CSSProperties = {
  fontSize: 11, padding: '3px 8px',
  background: '#161b22', border: '1px solid #30363d', borderRadius: 4,
  color: '#8b949e', whiteSpace: 'nowrap',
};
const activeStyle: React.CSSProperties = { color: '#26a69a', borderColor: '#26a69a' };
