'use client';

import { useEffect, useRef, useState } from 'react';

/* ─── Types ────────────────────────────────────────────────────────────────── */

type TimerType = 'COUNTDOWN' | 'EXPIRATION';
type TimerPosition = 'top' | 'above_button' | 'below_header';

interface CountdownTimerProps {
  enabled: boolean;
  type?: TimerType;
  minutes?: number;
  message?: string;
  expiredMessage?: string;
  position?: TimerPosition;
  accentColor?: string;
  textColor?: string;
}

const STORAGE_KEY = 'ck_countdown_end';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) {
    return '00:00';
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function CountdownTimer({
  enabled,
  type = 'COUNTDOWN',
  minutes = 15,
  message = 'Oferta expira em:',
  expiredMessage = 'Oferta expirada',
  position = 'top',
  accentColor = '#D4AF37',
  textColor = '#E8E6E1',
}: CountdownTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let endTime: number;

    if (type === 'COUNTDOWN') {
      // Persist end time in sessionStorage so refreshes don't restart timer
      try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          endTime = Number.parseInt(stored, 10);
        } else {
          endTime = Date.now() + minutes * 60 * 1000;
          sessionStorage.setItem(STORAGE_KEY, String(endTime));
        }
      } catch {
        endTime = Date.now() + minutes * 60 * 1000;
      }
    } else {
      // EXPIRATION — always use the configured minutes from now
      endTime = Date.now() + minutes * 60 * 1000;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, type, minutes]);

  if (!enabled || secondsLeft === null) {
    return null;
  }

  const expired = secondsLeft <= 0;

  const positionStyles: React.CSSProperties =
    position === 'top'
      ? { marginBottom: '16px' }
      : position === 'above_button'
        ? { marginTop: '12px', marginBottom: '4px' }
        : { marginTop: '8px', marginBottom: '16px' };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '10px 16px',
        borderRadius: '10px',
        background: expired ? '#441111' : `${accentColor}12`,
        border: `1px solid ${expired ? '#662222' : `${accentColor}30`}`,
        ...positionStyles,
      }}
    >
      {!expired ? (
        <>
          {/* Clock icon */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke={accentColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span style={{ fontSize: '13px', color: textColor, fontWeight: 500 }}>{message}</span>
          <span
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: accentColor,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatTime(secondsLeft)}
          </span>
        </>
      ) : (
        <span style={{ fontSize: '13px', color: '#ff6b6b', fontWeight: 600 }}>
          {expiredMessage}
        </span>
      )}
    </div>
  );
}
