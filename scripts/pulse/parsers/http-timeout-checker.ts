import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

// Wrappers that handle timeouts internally — skip these
const INTERNAL_FETCH_WRAPPERS = /swrFetcher|apiFetch|this\.httpService|this\.http\./;

// How many lines forward to scan for timeout signals after a fetch() call
const FETCH_WINDOW_LINES = 35;

function isFetchWrapperDefinition(lines: string[], lineIdx: number): boolean {
  // Check if we're inside the definition of a known wrapper function
  const context = lines.slice(Math.max(0, lineIdx - 5), lineIdx + 1).join('\n');
  return /(?:export\s+(?:async\s+)?function|const)\s+(?:swrFetcher|apiFetch)\b/.test(context);
}

/** Check http timeouts. */
export function checkHttpTimeouts(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // Only scan backend and worker — frontend fetch goes to own backend
  const dirs = [config.backendDir, config.workerDir].filter(Boolean);

  for (const dir of dirs) {
    const files = walkFiles(dir, ['.ts']).filter((f) => {
      if (/\.(spec|test|d)\.ts$/.test(f)) {
        return false;
      }
      if (/node_modules/.test(f)) {
        return false;
      }
      return true;
    });

    for (const file of files) {
      let content: string;
      try {
        content = readTextFile(file, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue;
        }

        // ---- Check bare fetch() calls ----
        // Match both fetch() and globalThis.fetch() / (global as any).fetch()
        if (/(?:^|[^a-zA-Z0-9_$])fetch\s*\(/.test(trimmed)) {
          // Skip internal wrapper definitions (apiFetch, swrFetcher)
          if (isFetchWrapperDefinition(lines, i)) {
            continue;
          }
          // Skip if line uses internal wrappers
          if (INTERNAL_FETCH_WRAPPERS.test(trimmed)) {
            continue;
          }
          // Skip string occurrences and imports
          if (/from\s+['"`]|import\s+/.test(trimmed)) {
            continue;
          }
          // Skip mock/test fetch references
          if (/jest\.fn|mock|stub/i.test(trimmed)) {
            continue;
          }

          // Scan the next FETCH_WINDOW_LINES lines for timeout signals.
          // Also look back up to 10 lines for an AbortController that may be passed as a pre-built options variable.
          const windowEnd = Math.min(i + 1 + FETCH_WINDOW_LINES, lines.length);
          const forwardWindow = lines.slice(i, windowEnd).join('\n');
          const lookbackStart = Math.max(0, i - 10);
          const backwardWindow = lines.slice(lookbackStart, i).join('\n');
          const hasTimeout =
            /signal\s*:|AbortController|AbortSignal|timeout\s*:/i.test(forwardWindow) ||
            /AbortController|AbortSignal|signal\s*:/.test(backwardWindow);

          if (!hasTimeout) {
            breaks.push({
              type: 'FETCH_NO_TIMEOUT',
              severity: 'high',
              file: relFile,
              line: i + 1,
              description: 'fetch() call without AbortController/signal timeout',
              detail: `${trimmed.slice(0, 120)} — wrap with AbortController and setTimeout to avoid hanging requests`,
            });
          }
        }

        // ---- Check axios calls ----
        // Match axios.get/post/put/patch/delete/request/create
        if (/\baxios\s*\./.test(trimmed)) {
          // Skip imports and type references
          if (/import\s+|from\s+['"`]/.test(trimmed)) {
            continue;
          }
          // Skip axios.create() that sets a default timeout in the options
          // (those are fine if they set timeout there)

          // Scan the next 15 lines for timeout config (3rd arg objects may span many lines)
          const windowEnd = Math.min(i + 16, lines.length);
          const window = lines.slice(i, windowEnd).join('\n');
          const hasTimeout = /\btimeout\s*:/.test(window);

          if (!hasTimeout) {
            // Check if this is an axios instance (created with timeout already set)
            // by looking for `this.axiosInstance` or a named variable that was created with .create()
            const lineText = lines[i];
            if (/this\.\w*[Aa]xios\w*\.|this\.httpClient\.|this\.client\./.test(lineText)) {
              // Instance — likely configured with timeout at creation
              continue;
            }

            breaks.push({
              type: 'AXIOS_NO_TIMEOUT',
              severity: 'medium',
              file: relFile,
              line: i + 1,
              description: 'axios call without explicit timeout option',
              detail: `${trimmed.slice(0, 120)} — add { timeout: 10000 } to prevent hanging requests`,
            });
          }
        }
      }
    }
  }

  return breaks;
}
