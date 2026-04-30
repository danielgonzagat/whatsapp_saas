import * as path from 'path';
import type { UIElement, PulseConfig } from '../types';
import type { HookRegistry } from './hook-registry';
import { buildApiModuleMap } from './api-parser';
import { extractSaveHandlerApiCalls } from '../ui-api-calls';
import { componentHasSaveHandler, resolveHandler } from './ui-handler-resolver';
import { extractHookDestructures } from './hook-registry';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';
import { getFrontendSourceDirs } from '../frontend-roots';

function extractLabel(line: string, lines: string[], idx: number): string {
  // Try to find visible text on same line
  const textMatch = line.match(/>([^<]{1,60})</);
  if (textMatch) {
    return textMatch[1].trim();
  }

  const labelMatch = line.match(/label\s*=\s*["'`]([^"'`]{1,60})["'`]/);
  if (labelMatch) {
    return labelMatch[1];
  }

  const ariaMatch = line.match(/aria-label\s*=\s*["'`]([^"'`]{1,60})["'`]/);
  if (ariaMatch) {
    return ariaMatch[1];
  }

  const titleMatch = line.match(/title\s*=\s*["'`]([^"'`]{1,60})["'`]/);
  if (titleMatch) {
    return titleMatch[1];
  }

  const placeholderMatch = line.match(/placeholder\s*=\s*["'`]([^"'`]{1,60})["'`]/);
  if (placeholderMatch) {
    return placeholderMatch[1];
  }

  // Check next 3 lines for text content
  for (let j = 1; j <= 3 && idx + j < lines.length; j++) {
    const nextLine = lines[idx + j].trim();
    // Skip lines that look like CSS/style properties
    if (
      /^(?:background|display|width|height|position|border|color|font|padding|margin|flex|align|justify|cursor|opacity|transform|transition|overflow|gap|aspect|grid|z-index|top|left|right|bottom)\s*[:=]/i.test(
        nextLine,
      )
    ) {
      continue;
    }
    if (/^\.\.\.\w+/.test(nextLine)) {
      continue;
    } // ...cardBtn spread
    // Direct text content (not a tag or expression)
    const nextText = nextLine.match(/^([^<{>\s][^<]{1,60})/);
    if (
      nextText &&
      !nextText[1].includes('=') &&
      !nextText[1].includes('{') &&
      !nextText[1].startsWith('//')
    ) {
      return nextText[1].trim();
    }
    // Text inside a tag
    const insideTag = nextLine.match(/>([^<]{1,60})</);
    if (insideTag) {
      return insideTag[1].trim();
    }
  }

  return '(sem texto)';
}

function extractComponent(lines: string[], idx: number): string | null {
  for (let i = idx; i >= Math.max(0, idx - 200); i--) {
    const m = lines[i].match(/(?:export\s+)?(?:default\s+)?(?:function|const)\s+(\w+)/);
    if (m && /^[A-Z]/.test(m[1])) {
      return m[1];
    }
  }
  return null;
}

function buildHandlerEvidence(
  handler: string | null,
  resolved: { type: UIElement['handlerType']; apiCalls: string[] },
): Pick<UIElement, 'handlerEvidence' | 'handlerPredicates'> {
  const evidence = new Set<string>();
  const predicates = new Set<string>();
  if (!handler || handler.trim().length === 0) {
    predicates.add('handler:missing');
  } else {
    predicates.add('handler:present');
  }
  predicates.add(`handler:${resolved.type}`);
  if (resolved.apiCalls.length > 0) {
    predicates.add('api_call:observed');
    for (const apiCall of resolved.apiCalls) {
      evidence.add(`api_call:${apiCall}`);
    }
  }
  if (handler?.includes('=>')) {
    predicates.add('handler:inline');
  }
  return {
    handlerEvidence: [...evidence],
    handlerPredicates: [...predicates],
  };
}

/**
 * Extract a JSX handler expression using brace-counting.
 * Given a line like: onClick={handleSave} style={{display: "flex"}}
 * Returns just "handleSave" — stops at the matching closing brace.
 *
 * Handles nested braces: onClick={() => { doSomething() }}
 */
function findJSXHandlerStart(line: string, eventName: string): number {
  let searchFrom = 0;
  while (searchFrom < line.length) {
    const eventIndex = line.indexOf(eventName, searchFrom);
    if (eventIndex < 0) {
      return -1;
    }

    let cursor = eventIndex + eventName.length;
    while (line[cursor] === ' ' || line[cursor] === '\t') {
      cursor++;
    }
    if (line[cursor] !== '=') {
      searchFrom = cursor;
      continue;
    }

    cursor++;
    while (line[cursor] === ' ' || line[cursor] === '\t') {
      cursor++;
    }
    if (line[cursor] === '{') {
      return cursor + 1;
    }
    searchFrom = cursor;
  }
  return -1;
}

function extractJSXHandler(line: string, eventName: string): string | null {
  const start = findJSXHandlerStart(line, eventName);
  if (start < 0) {
    return null;
  }

  let depth = 1;
  let i = start;

  while (i < line.length && depth > 0) {
    const ch = line[i];
    // Skip string literals
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < line.length && line[i] !== quote) {
        if (line[i] === '\\') {
          i++;
        } // skip escaped char
        i++;
      }
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return line.substring(start, i).trim();
      }
    }
    i++;
  }

  // If we didn't find closing brace on this line, return what we have
  if (depth > 0 && start < line.length) {
    // Likely a multi-line handler — return what's on this line
    return line.substring(start).trim();
  }

  return null;
}

function expandInlineHandler(handler: string, lines: string[], idx: number): string {
  if (/=>\s*$/.test(handler)) {
    const expanded = [handler];
    for (let j = idx + 1; j < Math.min(idx + 20, lines.length); j++) {
      expanded.push(lines[j]);
      if (/^\s*\}\s*$/.test(lines[j]) || /^\s*\}\s*[),]/.test(lines[j])) {
        break;
      }
    }
    return expanded.join('\n');
  }

  if (!handler.includes('=>') || !handler.includes('{') || handler.includes('}')) {
    return handler;
  }

  let depth = 0;
  for (const ch of handler) {
    if (ch === '{') {
      depth++;
    }
    if (ch === '}') {
      depth--;
    }
  }

  if (depth <= 0) {
    return handler;
  }

  const expanded = [handler];
  for (let j = idx + 1; j < Math.min(idx + 30, lines.length); j++) {
    expanded.push(lines[j]);
    for (const ch of lines[j]) {
      if (ch === '{') {
        depth++;
      }
      if (ch === '}') {
        depth--;
      }
    }
    if (depth <= 0) {
      break;
    }
  }

  return expanded.join('\n');
}

const DOM_HANDLER_PROPS = new Set([
  'onBlur',
  'onChange',
  'onClick',
  'onFocus',
  'onInput',
  'onKeyDown',
  'onKeyUp',
  'onMouseDown',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseUp',
  'onPointerDown',
  'onPointerEnter',
  'onPointerLeave',
  'onPointerUp',
  'onSubmit',
]);

/**
 * Extract names imported from @/lib/api (functions that make API calls)
 */
function extractApiImports(fileContent: string): Set<string> {
  const imports = new Set<string>();
  const re =
    /import\s*\{([^}]+)\}\s*from\s*['"](?:@\/lib\/api(?:\/[-\w]+)?|[^'"]*lib\/api(?:\/[-\w]+)?)['"]/g;
  let m;
  while ((m = re.exec(fileContent)) !== null) {
    const names = m[1].split(',').map((s) => s.trim().split(' as ').pop()!.trim());
    for (const name of names) {
      if (name && !['type', 'interface'].includes(name)) {
        imports.add(name);
      }
    }
  }
  return imports;
}

/** Parse ui elements. */
export function parseUIElements(config: PulseConfig, hookRegistry?: HookRegistry): UIElement[] {
  const elements: UIElement[] = [];
  const files = getFrontendSourceDirs(config).flatMap((frontendDir) =>
    walkFiles(frontendDir, ['.tsx', '.jsx']),
  );
  const registry = hookRegistry || new Map();
  const apiModuleMap = buildApiModuleMap(config);

  for (const file of files) {
    if (/\.(test|spec)\./.test(file)) {
      continue;
    }

    try {
      const content = readTextFile(file, 'utf8');
      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);

      // Build hook destructure map for this file (cross-file resolution)
      const hookDestructures = extractHookDestructures(content);

      // Extract imported API functions
      const apiImportsInFile = extractApiImports(content);
      // Check if component has a save handler with API call
      const saveHandlerApiCalls = extractSaveHandlerApiCalls(
        content,
        apiModuleMap,
        apiImportsInFile,
      );
      const hasSaveHandler = saveHandlerApiCalls.length > 0 || componentHasSaveHandler(content);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detect onClick handlers using brace-counting (not regex)
        const onClickHandler = extractJSXHandler(line, 'onClick');
        if (onClickHandler) {
          const handler = expandInlineHandler(onClickHandler.trim(), lines, i);
          const resolved = resolveHandler({
            handlerExpr: handler,
            lines,
            fileContent: content,
            hookDestructures,
            hookRegistry: registry,
            hasSaveHandler,
            apiImportsInFile,
            apiModuleMap,
          });
          const label = extractLabel(line, lines, i);
          const component = extractComponent(lines, i);

          elements.push({
            file: relFile,
            line: i + 1,
            type: /<(?:button|Button|Bt)\b/i.test(line) ? 'button' : 'clickable',
            label,
            handler,
            handlerType: resolved.type,
            apiCalls: resolved.apiCalls,
            ...buildHandlerEvidence(handler, resolved),
            component,
          });
        }

        // Detect onSubmit handlers
        const onSubmitHandler = extractJSXHandler(line, 'onSubmit');
        if (onSubmitHandler) {
          const handler = expandInlineHandler(onSubmitHandler.trim(), lines, i);
          const resolved = resolveHandler({
            handlerExpr: handler,
            lines,
            fileContent: content,
            hookDestructures,
            hookRegistry: registry,
            hasSaveHandler,
            apiImportsInFile,
            apiModuleMap,
          });

          elements.push({
            file: relFile,
            line: i + 1,
            type: 'form',
            label: 'form',
            handler,
            handlerType: resolved.type === 'dead' ? 'dead' : resolved.type,
            apiCalls: resolved.apiCalls,
            ...buildHandlerEvidence(handler, resolved),
            component: extractComponent(lines, i),
          });
        }

        const actionPropMatches = [...line.matchAll(/\b(on[A-Z]\w*)\s*=\s*\{/g)];
        for (const actionPropMatch of actionPropMatches) {
          const propName = actionPropMatch[1];
          if (DOM_HANDLER_PROPS.has(propName)) {
            continue;
          }

          const actionHandler = extractJSXHandler(line, propName);
          if (!actionHandler) {
            continue;
          }

          const handler = expandInlineHandler(actionHandler.trim(), lines, i);
          const resolved = resolveHandler({
            handlerExpr: handler,
            lines,
            fileContent: content,
            hookDestructures,
            hookRegistry: registry,
            hasSaveHandler,
            apiImportsInFile,
            apiModuleMap,
          });

          elements.push({
            file: relFile,
            line: i + 1,
            type: 'clickable',
            label: propName,
            handler,
            handlerType: resolved.type,
            apiCalls: resolved.apiCalls,
            ...buildHandlerEvidence(handler, resolved),
            component: extractComponent(lines, i),
          });
        }

        // Detect Toggle/Switch
        if (/(?:<Toggle|<Switch|<Tg)\b/.test(line) && /onChange|onClick/.test(line)) {
          const handlerExpr =
            extractJSXHandler(line, 'onChange') || extractJSXHandler(line, 'onClick');
          if (handlerExpr) {
            const handler = expandInlineHandler(handlerExpr.trim(), lines, i);
            const resolved = resolveHandler({
              handlerExpr: handler,
              lines,
              fileContent: content,
              hookDestructures,
              hookRegistry: registry,
              hasSaveHandler,
              apiImportsInFile,
              apiModuleMap,
            });

            elements.push({
              file: relFile,
              line: i + 1,
              type: 'toggle',
              label: extractLabel(line, lines, i),
              handler,
              handlerType: resolved.type,
              apiCalls: resolved.apiCalls,
              ...buildHandlerEvidence(handler, resolved),
              component: extractComponent(lines, i),
            });
          }
        }
      }
    } catch (e) {
      process.stderr.write(`  [warn] Could not parse UI in ${file}: ${(e as Error).message}\n`);
    }
  }

  return elements;
}
