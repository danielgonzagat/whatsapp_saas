import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

interface GatewayEvent {
  file: string;
  line: number;
  eventName: string;
}

function extractQuotedString(s: string): string | null {
  const m = s.match(/['"`]([^'"`]+)['"`]/);
  return m ? m[1] : null;
}

export function checkWebSockets(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ---- Collect backend gateway events (@SubscribeMessage) ----
  const backendEvents: GatewayEvent[] = [];

  const gatewayFiles = walkFiles(config.backendDir, ['.ts']).filter(f => {
    if (!f.endsWith('.gateway.ts')) return false;
    if (/\.(spec|test)\.ts$/.test(f)) return false;
    return true;
  });

  for (const file of gatewayFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!/@SubscribeMessage\s*\(/.test(trimmed)) continue;

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

  const frontendFiles = walkFiles(config.frontendDir, ['.ts', '.tsx']).filter(f => {
    if (/\.(spec|test|d)\.ts$/.test(f)) return false;
    if (/node_modules/.test(f)) return false;
    return true;
  });

  // Patterns to detect socket events in frontend:
  // socket.emit('eventName', ...) | socket.on('eventName', ...) | emit('eventName', ...) | .on('eventName', ...)
  const emitPattern = /(?:socket|io|ws|client)\s*\.\s*emit\s*\(\s*['"`]([^'"`]+)['"`]/;
  const onPattern = /(?:socket|io|ws|client)\s*\.\s*on\s*\(\s*['"`]([^'"`]+)['"`]/;
  // Also catch bare emit() / .on() from hook destructuring
  const bareEmitPattern = /\bemit\s*\(\s*['"`]([^'"`]+)['"`]/;
  const bareOnPattern = /\.on\s*\(\s*['"`]([^'"`]+)['"`]/;

  for (const file of frontendFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      // Skip imports
      if (/^import\s/.test(trimmed)) continue;

      let m: RegExpMatchArray | null;

      m = trimmed.match(emitPattern);
      if (m) { frontendEvents.push({ file, line: i + 1, eventName: m[1], kind: 'emit' }); continue; }

      m = trimmed.match(onPattern);
      if (m) { frontendEvents.push({ file, line: i + 1, eventName: m[1], kind: 'on' }); continue; }

      m = trimmed.match(bareEmitPattern);
      if (m) { frontendEvents.push({ file, line: i + 1, eventName: m[1], kind: 'emit' }); continue; }

      m = trimmed.match(bareOnPattern);
      if (m) {
        // Exclude common non-socket .on() patterns: EventEmitter in node, DOM events
        const eventName = m[1];
        if (/^(?:click|change|input|submit|focus|blur|keydown|keyup|keypress|resize|scroll|load|error|message|open|close|connect|disconnect)$/.test(eventName)) {
          // These are likely DOM or socket lifecycle events — still record disconnect/connect/error
          if (/^(?:connect|disconnect|error|reconnect)$/.test(eventName)) {
            frontendEvents.push({ file, line: i + 1, eventName, kind: 'on' });
          }
          continue;
        }
        frontendEvents.push({ file, line: i + 1, eventName: m[1], kind: 'on' });
      }
    }
  }

  // ---- Cross-reference ----
  const backendEventNames = new Set(backendEvents.map(e => e.eventName));
  const frontendEventNames = new Set(frontendEvents.map(e => e.eventName));

  // Lifecycle events that don't need @SubscribeMessage on backend
  const lifecycleEvents = new Set(['connect', 'disconnect', 'error', 'reconnect', 'reconnect_error', 'reconnect_attempt']);

  // Backend events with no frontend consumer
  for (const evt of backendEvents) {
    if (frontendEventNames.has(evt.eventName)) continue;
    const relFile = path.relative(config.rootDir, evt.file);
    breaks.push({
      type: 'GATEWAY_NO_CONSUMER',
      severity: 'medium',
      file: relFile,
      line: evt.line,
      description: `Backend gateway event '${evt.eventName}' has no frontend consumer`,
      detail: `No socket.on('${evt.eventName}') or socket.emit('${evt.eventName}') found in frontend — event may be dead`,
    });
  }

  // Frontend emits with no backend handler
  for (const evt of frontendEvents) {
    if (evt.kind !== 'emit') continue;
    if (lifecycleEvents.has(evt.eventName)) continue;
    if (backendEventNames.has(evt.eventName)) continue;
    const relFile = path.relative(config.rootDir, evt.file);
    breaks.push({
      type: 'EMIT_NO_HANDLER',
      severity: 'medium',
      file: relFile,
      line: evt.line,
      description: `Frontend emits '${evt.eventName}' but no backend @SubscribeMessage handler found`,
      detail: `socket.emit('${evt.eventName}') in frontend has no matching @SubscribeMessage('${evt.eventName}') in any .gateway.ts`,
    });
  }

  return breaks;
}
