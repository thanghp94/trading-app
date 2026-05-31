import { useEffect } from "react";

/**
 * Requests the Screen Wake Lock API so the display stays on while the tab is
 * visible. Automatically re-acquires the lock when the tab becomes visible
 * again (browser releases the lock when the tab is hidden).
 */
export function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;

    let lock: WakeLockSentinel | null = null;

    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        // Permission denied or unsupported — silently ignore.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      lock?.release();
    };
  }, []);
}
