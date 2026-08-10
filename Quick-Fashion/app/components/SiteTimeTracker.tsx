'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/app/contexts/AuthContext';
import { getToken } from '@/lib/api';

const FLUSH_INTERVAL_MS = 60_000;
const MAX_EVENT_MS = 5 * 60_000;

export default function SiteTimeTracker() {
  const { user } = useAuth();
  const activeSince = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;
    activeSince.current = document.visibilityState === 'visible' ? Date.now() : null;

    const flush = () => {
      if (!activeSince.current) return;
      const durationMs = Math.min(Date.now() - activeSince.current, MAX_EVENT_MS);
      activeSince.current = document.visibilityState === 'visible' ? Date.now() : null;
      if (durationMs < 1000) return;
      const token = getToken();
      fetch('/api/interactions', {
        method: 'POST', keepalive: true,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ type: 'SITE_DWELL', durationMs: Math.round(durationMs) }),
      }).catch(() => undefined);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
      else activeSince.current = Date.now();
    };
    const timer = window.setInterval(flush, FLUSH_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flush);
    return () => { flush(); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibilityChange); window.removeEventListener('pagehide', flush); };
  }, [user]);

  return null;
}
