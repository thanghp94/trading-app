import { useEffect, useRef } from 'react';
import type { Alert } from '../shared/types.js';

const STORAGE_KEY = 'trading-app:notify-prefs-v1';

interface NotifyPrefs {
  sound: boolean;
  titleBadge: boolean;
  voice: boolean;
}

function loadPrefs(): NotifyPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { sound: true, titleBadge: true, voice: false, ...(JSON.parse(raw) as Partial<NotifyPrefs>) };
  } catch {
    /* ignore */
  }
  return { sound: true, titleBadge: true, voice: false };
}

export function savePrefs(prefs: NotifyPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* quota — ignore */
  }
}

export function useNotifyPrefs(): [NotifyPrefs, (next: NotifyPrefs) => void] {
  const ref = useRef(loadPrefs());
  // We don't useState here because the hook is read once per render; the
  // mutator is for the settings UI to flip flags.
  const set = (next: NotifyPrefs) => {
    ref.current = next;
    savePrefs(next);
  };
  return [ref.current, set];
}

/**
 * Beeps with Web Audio API + flips the document title with an unread
 * count when alerts arrive while the tab is unfocused. Resets when the
 * tab regains focus.
 *
 * Watches the `alerts` prop and fires on each new alert ID it hasn't seen.
 */
export function useAlertNotifications(alerts: Alert[]) {
  const seenIdsRef = useRef<Set<string>>(new Set());
  const unreadRef = useRef(0);
  const baseTitleRef = useRef(document.title);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Reset unread badge when tab regains focus.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) {
        unreadRef.current = 0;
        document.title = baseTitleRef.current;
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  useEffect(() => {
    const prefs = loadPrefs();
    let firedAny = false;
    for (const a of alerts) {
      if (seenIdsRef.current.has(a.id)) continue;
      seenIdsRef.current.add(a.id);
      // Skip beep on the initial backfill — only fire on alerts that arrive
      // after the page has loaded for at least 2 seconds.
      if (Date.now() - pageLoadedAt < 2000) continue;
      firedAny = true;
      if (prefs.sound) playBeep(audioCtxRef);
      if (prefs.titleBadge && document.hidden) {
        unreadRef.current += 1;
        document.title = `(${unreadRef.current}) ${baseTitleRef.current}`;
      }
      if (prefs.voice) speakAlert(a);
    }
    void firedAny;
  }, [alerts]);
}

function speakAlert(a: { headline: string }) {
  try {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(a.headline);
    u.rate = 1.05;
    u.volume = 0.8;
    window.speechSynthesis.speak(u);
  } catch {
    /* speech unavailable */
  }
}

const pageLoadedAt = Date.now();

function playBeep(audioCtxRef: React.MutableRefObject<AudioContext | null>) {
  try {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
  } catch {
    /* AudioContext unavailable (autoplay policy) — silent failure is fine */
  }
}
