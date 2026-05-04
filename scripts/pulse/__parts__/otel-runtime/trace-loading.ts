import type { OtelSpan, OtelTrace } from '../../types.otel-runtime';
import { readJsonFile } from '../../safe-fs';
import { nowIso, randomHex } from './helpers';

function parseSpan(raw: Record<string, unknown>): OtelSpan {
  const startTime = (raw.startTimeUnixNano as string)
    ? new Date(Number(BigInt(raw.startTimeUnixNano as string) / 1_000_000n)).toISOString()
    : (raw.startTime as string) || nowIso();
  const endTime = (raw.endTimeUnixNano as string)
    ? new Date(Number(BigInt(raw.endTimeUnixNano as string) / 1_000_000n)).toISOString()
    : (raw.endTime as string) || nowIso();

  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();

  const attributes: Record<string, string | number | boolean> = {};
  const rawAttrs = raw.attributes as
    | Array<{
        key: string;
        value: { stringValue?: string; intValue?: number; boolValue?: boolean };
      }>
    | undefined;
  if (Array.isArray(rawAttrs)) {
    for (const attr of rawAttrs) {
      const val = attr.value.stringValue ?? attr.value.intValue ?? attr.value.boolValue;
      if (val !== undefined && val !== null) attributes[attr.key] = val;
    }
  } else if (raw.attributes && typeof raw.attributes === 'object') {
    Object.assign(attributes, raw.attributes as Record<string, unknown>);
  }

  const events: OtelSpan['events'] = [];
  const rawEvents = raw.events as
    | Array<{
        name: string;
        timeUnixNano?: string;
        time?: string;
        attributes?: Array<{ key: string; value: { stringValue?: string } }>;
      }>
    | undefined;
  if (Array.isArray(rawEvents)) {
    for (const evt of rawEvents) {
      const evtAttrs: Record<string, string> = {};
      if (Array.isArray(evt.attributes)) {
        for (const a of evt.attributes) {
          evtAttrs[a.key] = a.value?.stringValue ?? '';
        }
      }
      events.push({
        name: evt.name,
        timestamp: (evt.timeUnixNano as string)
          ? new Date(Number(BigInt(evt.timeUnixNano as string) / 1_000_000n)).toISOString()
          : (evt.time as string) || nowIso(),
        attributes: evtAttrs,
      });
    }
  }

  return {
    spanId: (raw.spanId as string) || randomHex(16),
    parentSpanId: (raw.parentSpanId as string) || null,
    traceId: (raw.traceId as string) || randomHex(32),
    name: (raw.name as string) || 'unknown',
    kind: (raw.kind as OtelSpan['kind']) || 'internal',
    serviceName:
      ((raw as Record<string, unknown>).serviceName as string) ||
      (attributes['service.name'] as string) ||
      'unknown',
    attributes,
    startTime,
    endTime,
    durationMs: endMs - startMs,
    status: (raw.status as OtelSpan['status']) || 'unset',
    statusMessage: (raw.statusMessage as string) || null,
    events,
  };
}

function unwrapSpans(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) {
    const first = data[0] as Record<string, unknown> | undefined;
    if (first && Array.isArray(first.spans)) {
      const allSpans: Array<Record<string, unknown>> = [];
      for (const traceObj of data) {
        const t = traceObj as Record<string, unknown>;
        if (Array.isArray(t.spans)) {
          for (const span of t.spans) {
            (span as Record<string, unknown>).traceId = t.traceId;
            allSpans.push(span as Record<string, unknown>);
          }
        }
      }
      return allSpans;
    }
    return data as Array<Record<string, unknown>>;
  }

  const obj = data as Record<string, unknown>;
  const resourceSpans = obj.resourceSpans as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(resourceSpans)) {
    const allSpans: Array<Record<string, unknown>> = [];
    for (const rs of resourceSpans) {
      const scopeSpans = rs.scopeSpans as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(scopeSpans)) {
        for (const ss of scopeSpans) {
          const ssSpans = ss.spans as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(ssSpans)) allSpans.push(...ssSpans);
        }
      }
    }
    return allSpans;
  }

  return [];
}

export function loadTracesFromFile(filePath: string): OtelTrace[] {
  const raw = readJsonFile<unknown>(filePath);
  const traces: OtelTrace[] = [];

  const rawSpans = unwrapSpans(raw);
  const parsedSpans = rawSpans.map(parseSpan);

  const traceMap = new Map<string, OtelSpan[]>();
  for (const span of parsedSpans) {
    const existing = traceMap.get(span.traceId) || [];
    existing.push(span);
    traceMap.set(span.traceId, existing);
  }

  for (const [traceId, spans] of traceMap) {
    const rootSpan = spans.find((s) => s.parentSpanId === null) || spans[0];
    const errorSpans = spans.filter((s) => s.status === 'error').length;
    const serviceBoundaries = new Set(spans.map((s) => s.serviceName)).size - 1;

    traces.push({
      traceId,
      rootSpan,
      spans,
      totalDurationMs: spans.reduce((max, s) => Math.max(max, s.durationMs), 0),
      errorSpans,
      serviceBoundaries: Math.max(0, serviceBoundaries),
    });
  }

  return traces;
}
