import { wave3EntryRule, wave5EntryRule } from './wave-entry.js';
import { zoneTouchRule } from './zone-touch.js';
import type { AlertRule } from '../rule-types.js';

export const ALL_RULES: AlertRule[] = [wave3EntryRule, wave5EntryRule, zoneTouchRule];
