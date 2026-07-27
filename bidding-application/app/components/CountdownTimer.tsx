'use client';

import React, { useState, useEffect } from 'react';

interface CountdownTimerProps {
  endTime: string;
  antiSnipingWindowSeconds?: number;
  className?: string;
}

export default function CountdownTimer({ endTime, antiSnipingWindowSeconds = 30, className = '' }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 });

  useEffect(() => {
    function calc() {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
      return {
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
        total: diff,
      };
    }

    setRemaining(calc());
    const interval = setInterval(() => setRemaining(calc()), 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  const isUrgent = remaining.total > 0 && remaining.total <= antiSnipingWindowSeconds * 1000;
  const isEnded = remaining.total <= 0;

  if (isEnded) {
    return <span className={`badge badge-closed ${className}`}>Ended</span>;
  }

  const segments = [];
  if (remaining.days > 0) segments.push(`${remaining.days}d`);
  if (remaining.hours > 0 || remaining.days > 0) segments.push(`${remaining.hours}h`);
  segments.push(`${remaining.minutes}m`);
  segments.push(`${remaining.seconds}s`);

  return (
    <span className={`font-mono font-semibold text-sm ${isUrgent ? 'countdown-urgent' : 'text-[var(--accent-emerald)]'} ${className}`}>
      {isUrgent && '⚡ '}
      {segments.join(' ')}
      {isUrgent && ' (Anti-snipe)'}
    </span>
  );
}
