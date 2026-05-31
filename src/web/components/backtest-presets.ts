/**
 * One-click strategy recipes. Each preset is a complete config that the user
 * can tweak after applying. Designed for novices to skip the 15-toggle
 * configuration paralysis.
 *
 * The `apply` callback gets the setters in the same order the panel declares
 * them — keep that contract stable when editing.
 */
export interface PresetConfig {
  slMode: 'pct' | 'trigger-wick';
  tpMode: 'rr' | 'next-resistance';
  slPct: string;
  rrTarget: string;
  maxBars: string;
  riskPct: string;
  preferredOnly: boolean;
  mtfTrendAlign: boolean;
  mtfZoneConfluence: boolean;
  vnSessionFilter: boolean;
  breakevenAtR: string;
  partialAtR: string;
  partialPct: string;
  trailAtrMult: string;
}

export interface Preset {
  id: string;
  label: string;
  badge: string;
  description: string;
  config: PresetConfig;
}

export const BACKTEST_PRESETS: Preset[] = [
  {
    id: 'conservative',
    label: 'Conservative starter',
    badge: '🛡️',
    description: 'Best place to start. Only ★ wave-5 entries, MTF gates ON, breakeven move at +1R. Low risk per trade.',
    config: {
      slMode: 'trigger-wick',
      tpMode: 'next-resistance',
      slPct: '0.5',
      rrTarget: '2',
      maxBars: '30',
      riskPct: '0.5',
      preferredOnly: true,
      mtfTrendAlign: true,
      mtfZoneConfluence: true,
      vnSessionFilter: true,
      breakevenAtR: '1',
      partialAtR: '0',
      partialPct: '0.5',
      trailAtrMult: '0',
    },
  },
  {
    id: 'teacher-classic',
    label: "Teacher's classic",
    badge: '🎓',
    description: 'Matches the documented technique exactly: trigger-wick SL, next-resistance TP, MTF trend filter, all rules fire.',
    config: {
      slMode: 'trigger-wick',
      tpMode: 'next-resistance',
      slPct: '0.5',
      rrTarget: '2',
      maxBars: '30',
      riskPct: '1',
      preferredOnly: false,
      mtfTrendAlign: true,
      mtfZoneConfluence: false,
      vnSessionFilter: true,
      breakevenAtR: '0',
      partialAtR: '0',
      partialPct: '0.5',
      trailAtrMult: '0',
    },
  },
  {
    id: 'scale-out',
    label: 'Scale-out runner',
    badge: '🪜',
    description: 'Take half profit at +1.5R, let runner trail by 2× ATR. Smooths equity curve but caps moonshots.',
    config: {
      slMode: 'trigger-wick',
      tpMode: 'next-resistance',
      slPct: '0.5',
      rrTarget: '3',
      maxBars: '60',
      riskPct: '1',
      preferredOnly: true,
      mtfTrendAlign: true,
      mtfZoneConfluence: false,
      vnSessionFilter: true,
      breakevenAtR: '1',
      partialAtR: '1.5',
      partialPct: '0.5',
      trailAtrMult: '2',
    },
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    badge: '🔥',
    description: 'All rules fire, no MTF gates, 2% risk. Larger sample size but expect bigger drawdowns. Test only.',
    config: {
      slMode: 'trigger-wick',
      tpMode: 'next-resistance',
      slPct: '0.5',
      rrTarget: '2',
      maxBars: '30',
      riskPct: '2',
      preferredOnly: false,
      mtfTrendAlign: false,
      mtfZoneConfluence: false,
      vnSessionFilter: true,
      breakevenAtR: '0',
      partialAtR: '0',
      partialPct: '0.5',
      trailAtrMult: '0',
    },
  },
];
