'use client';
// PULSE:OK — frontend heartbeat is best-effort telemetry only; it does not mutate cached user-facing data or require SWR invalidation.

import { useWorkspace } from '@/hooks/useWorkspaceId';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

const SESSION_STORAGE_KEY = 'kloel_pulse_session_id';
const HEARTBEAT_EVERY_MS = 30_000;
const REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_SAMPLE_RATE = 0.35;
const SAMPLE_ROTATION_WINDOW_MS = 24 * 60 * 60 * 1000;

function getSessionId() {
  if (typeof window === 'undefined') {
    return '';
  }

  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const generated = window.crypto?.randomUUID?.() || `pulse-${Date.now().toString(36)}`;
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, generated);
  return generated;
}

export function PulseFrontendHeartbeat() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, workspaceId } = useWorkspace();
  const inFlightRef = useRef(false);
  const currentRoute = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  useEffect(() => {
    if (!isAuthenticated || !pathname) {
      return;
    }

    const sessionId = getSessionId();
    if (!sessionId) {
      return;
    }

    const sampleRate = resolveSampleRate();
    const sampleSeed = `${workspaceId || 'anonymous'}:${sessionId}:${getSamplingWindow()}`;
    if (!shouldSampleSession(sampleSeed, sampleRate)) {
      return;
    }

    const sendHeartbeat = () => {
      if (inFlightRef.current) {
        return;
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const connection = (navigator as Navigator & { connection?: { effectiveType?: string } })
        .connection;

      inFlightRef.current = true;
      void fetch('/api/pulse/live/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        keepalive: true,
        signal: controller.signal,
        body: JSON.stringify({
          sessionId,
          route: currentRoute,
          visible: document.visibilityState === 'visible',
          online: navigator.onLine,
          connectionType: connection?.effectiveType || '',
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
        }),
      })
        .catch(() => {
          // Best-effort only: runtime pulse must never block product navigation.
        })
        .finally(() => {
          window.clearTimeout(timeoutId);
          inFlightRef.current = false;
        });
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, HEARTBEAT_EVERY_MS);
    const handleVisibilityChange = () => sendHeartbeat();
    const handleOnline = () => sendHeartbeat();
    const handlePageHide = () => sendHeartbeat();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOnline);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOnline);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [currentRoute, isAuthenticated, pathname, workspaceId]);

  return null;
}

function resolveSampleRate() {
  const parsed = Number(process.env.NEXT_PUBLIC_PULSE_FRONTEND_SAMPLE_RATE || '');
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SAMPLE_RATE;
  }
  return Math.min(1, Math.max(0, parsed));
}

function shouldSampleSession(seed: string, sampleRate: number) {
  if (sampleRate >= 1) {
    return true;
  }
  if (sampleRate <= 0) {
    return false;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  const normalized = hash / 0xffffffff;
  return normalized < sampleRate;
}

function getSamplingWindow() {
  return Math.floor(Date.now() / SAMPLE_ROTATION_WINDOW_MS);
}
