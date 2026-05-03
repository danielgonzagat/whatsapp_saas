import * as path from 'path';
import { readJsonFile } from './safe-fs';
import type { ReplaySession, ReplaySource } from './types.replay-adapter';

const MIN_ERROR_COUNT_FOR_FAILURE = 1;

function createReplaySessionIdFallback(): string {
  const { randomBytes } = require('crypto');
  return `replay-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

function normalizeSignalSourceToken(raw: string): string {
  const output: string[] = [];
  for (const char of raw.trim().toLowerCase()) {
    const isLetter = char >= 'a' && char <= 'z';
    const isDigit = char >= '0' && char <= '9';
    if (isLetter || isDigit) {
      output.push(char);
      continue;
    }
    if (output.length > 0 && output[output.length - 1] !== '_') {
      output.push('_');
    }
  }
  while (output[0] === '_') {
    output.shift();
  }
  while (output[output.length - 1] === '_') {
    output.pop();
  }
  return output.join('');
}

function mapSignalSource(raw: string): ReplaySource | null {
  const normalized = normalizeSignalSourceToken(raw);
  return normalized.length > 0 ? normalized : null;
}

/**
 * Extract replay sessions from external signal state.
 *
 * Iterates signals from Sentry/Datadog adapters and reconstructs
 * replay session shapes when sufficient detail is available.
 */
export function extractSessionsFromExternalSignals(filePath: string): ReplaySession[] {
  try {
    const raw = readJsonFile<unknown>(filePath);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return [];
    }

    const data = raw as Record<string, unknown>;
    const signals = Array.isArray(data.signals) ? data.signals : [];
    const adapters = Array.isArray(data.adapters) ? data.adapters : [];

    const sessions: ReplaySession[] = [];
    const seen = new Set<string>();

    for (const signal of signals as Array<Record<string, unknown>>) {
      const source = mapSignalSource(String(signal.source || ''));
      if (!source) {
        continue;
      }

      const sessionId = String(signal.id || createReplaySessionIdFallback());
      if (seen.has(sessionId)) {
        continue;
      }
      seen.add(sessionId);

      const hasError = typeof signal.severity === 'number' && signal.severity >= 7;

      sessions.push({
        sessionId,
        source,
        userId: String(signal.userId || signal.rawRef || null) || null,
        startTime: String(signal.observedAt || new Date().toISOString()),
        endTime: String(signal.observedAt || new Date().toISOString()),
        durationMs: 0,
        url: String(signal.routePatterns?.[0] || signal.summary || '/'),
        events: hasError
          ? [
              {
                type: 'error',
                timestamp: String(signal.observedAt || new Date().toISOString()),
                detail: {
                  summary: signal.summary,
                  severity: signal.severity,
                  tags: signal.tags,
                },
              },
            ]
          : [],
        errors: hasError
          ? [
              {
                message: String(signal.summary || 'unknown'),
                timestamp: String(signal.observedAt || ''),
              },
            ]
          : [],
        status: 'captured',
        convertedScenarioId: null,
      });
    }

    for (const adapter of adapters as Array<Record<string, unknown>>) {
      const adapterSignals = Array.isArray(adapter.signals) ? adapter.signals : [];
      for (const signal of adapterSignals as Array<Record<string, unknown>>) {
        const source = mapSignalSource(String(signal.source || adapter.source || ''));
        if (!source) {
          continue;
        }

        const sessionId = String(signal.id || createReplaySessionIdFallback());
        if (seen.has(sessionId)) {
          continue;
        }
        seen.add(sessionId);

        const hasError = typeof signal.severity === 'number' && signal.severity >= 7;

        sessions.push({
          sessionId,
          source,
          userId: String(signal.userId || signal.rawRef || null) || null,
          startTime: String(signal.observedAt || new Date().toISOString()),
          endTime: String(signal.observedAt || new Date().toISOString()),
          durationMs: 0,
          url: String(signal.routePatterns?.[0] || signal.summary || '/'),
          events: hasError
            ? [
                {
                  type: 'error',
                  timestamp: String(signal.observedAt || new Date().toISOString()),
                  detail: { summary: signal.summary, severity: signal.severity },
                },
              ]
            : [],
          errors: hasError
            ? [
                {
                  message: String(signal.summary || 'unknown'),
                  timestamp: String(signal.observedAt || ''),
                },
              ]
            : [],
          status: 'captured',
          convertedScenarioId: null,
        });
      }
    }

    return sessions;
  } catch {
    return [];
  }
}

export function mergeSessions(all: ReplaySession[], incoming: ReplaySession[]): ReplaySession[] {
  const seen = new Set(all.map((s) => s.sessionId));
  const merged = [...all];
  for (const session of incoming) {
    if (!seen.has(session.sessionId)) {
      seen.add(session.sessionId);
      merged.push(session);
    }
  }
  return merged;
}
