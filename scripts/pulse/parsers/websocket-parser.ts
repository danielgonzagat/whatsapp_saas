import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

interface GatewayEvent {
  file: string;
  line: number;
  eventName: string;
}

type WebSocketPredicateKind =
  | 'backend-event-surface'
  | 'frontend-event-surface'
  | 'missing-backend-handler-evidence'
  | 'missing-frontend-consumer-evidence';

interface WebSocketFindingInput {
  readonly predicateKinds: readonly WebSocketPredicateKind[];
  readonly severity: Break['severity'];
  readonly file: string;
  readonly line: number;
  readonly description: string;
  readonly detail: string;
}

function extractQuotedString(s: string): string | null {
  for (const quote of ['"', "'", '`']) {
    const start = s.indexOf(quote);
    if (start === -1) {
      continue;
    }
    const end = s.indexOf(quote, start + 1);
    if (end > start + 1) {
      return s.slice(start + 1, end);
    }
  }
  return null;
}

function isTestLikeSource(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  return (
    normalized.includes('.spec.') || normalized.includes('.test.') || normalized.includes('.d.ts')
  );
}

function webSocketFinding(input: WebSocketFindingInput): Break {
  const predicateId = input.predicateKinds.join('+');
  return {
    type: `diagnostic:websocket-parser:${predicateId}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: `syntax-evidence:websocket-parser;predicates=${predicateId}`,
  };
}

function extractEventNameFromInvocation(
  line: string,
  invocationNames: readonly string[],
): string | null {
  for (const invocationName of invocationNames) {
    let cursor = 0;
    while (cursor < line.length) {
      const index = line.indexOf(invocationName, cursor);
      if (index === -1) {
        break;
      }
      const eventName = extractQuotedString(line.slice(index + invocationName.length));
      if (eventName) {
        return eventName;
      }
      cursor = index + invocationName.length;
    }
  }
  return null;
}

function hasSubscribeMessageDecorator(line: string): boolean {
  return line.includes('@SubscribeMessage') && line.includes('(');
}

function isImportLine(line: string): boolean {
  return line.startsWith('import ');
}

/** Check web sockets. */
export function checkWebSockets(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ---- Collect backend gateway events (@SubscribeMessage) ----
  const backendEvents: GatewayEvent[] = [];

  const gatewayFiles = walkFiles(config.backendDir, ['.ts']).filter((f) => {
    if (!f.endsWith('.gateway.ts')) {
      return false;
    }
    if (isTestLikeSource(f)) {
      return false;
    }
    return true;
  });

  for (const file of gatewayFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!hasSubscribeMessageDecorator(trimmed)) {
        continue;
      }

      const eventName = extractQuotedString(trimmed);
      if (eventName) {
        backendEvents.push({ file, line: i + 1, eventName });
      }
    }
  }

  // ---- Collect frontend socket event names ----
  interface FrontendEvent {
    file: string;
    line: number;
    eventName: string;
    kind: 'emit' | 'on';
  }

  const frontendEvents: FrontendEvent[] = [];

  const frontendFiles = walkFiles(config.frontendDir, ['.ts', '.tsx']).filter((f) => {
    if (isTestLikeSource(f)) {
      return false;
    }
    if (f.includes('node_modules')) {
      return false;
    }
    return true;
  });

  for (const file of frontendFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }
      // Skip imports
      if (isImportLine(trimmed)) {
        continue;
      }

      const emittedEventName = extractEventNameFromInvocation(trimmed, ['.emit(', 'emit(']);
      if (emittedEventName) {
        frontendEvents.push({ file, line: i + 1, eventName: emittedEventName, kind: 'emit' });
        continue;
      }

      const observedEventName = extractEventNameFromInvocation(trimmed, ['.on(', 'on(']);
      if (observedEventName) {
        frontendEvents.push({ file, line: i + 1, eventName: observedEventName, kind: 'on' });
      }
    }
  }

  // ---- Cross-reference ----
  const backendEventNames = new Set(backendEvents.map((e) => e.eventName));
  const frontendEventNames = new Set(frontendEvents.map((e) => e.eventName));

  // Backend events with no frontend consumer
  for (const evt of backendEvents) {
    if (frontendEventNames.has(evt.eventName)) {
      continue;
    }
    const relFile = path.relative(config.rootDir, evt.file);
    breaks.push(
      webSocketFinding({
        predicateKinds: ['backend-event-surface', 'missing-frontend-consumer-evidence'],
        severity: 'medium',
        file: relFile,
        line: evt.line,
        description: `Backend gateway event '${evt.eventName}' has no frontend consumer`,
        detail: `No socket.on('${evt.eventName}') or socket.emit('${evt.eventName}') found in frontend — event may be dead`,
      }),
    );
  }

  // Frontend emits with no backend handler
  for (const evt of frontendEvents) {
    if (evt.kind !== 'emit') {
      continue;
    }
    if (backendEventNames.has(evt.eventName)) {
      continue;
    }
    const relFile = path.relative(config.rootDir, evt.file);
    breaks.push(
      webSocketFinding({
        predicateKinds: ['frontend-event-surface', 'missing-backend-handler-evidence'],
        severity: 'medium',
        file: relFile,
        line: evt.line,
        description: `Frontend emits '${evt.eventName}' but no backend @SubscribeMessage handler found`,
        detail: `socket.emit('${evt.eventName}') in frontend has no matching @SubscribeMessage('${evt.eventName}') in a .gateway.ts`,
      }),
    );
  }

  return breaks;
}
