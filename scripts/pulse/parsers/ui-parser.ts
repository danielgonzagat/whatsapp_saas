import * as fs from 'fs';
import * as path from 'path';
import type { UIElement, PulseConfig } from '../types';
import type { HookRegistry } from './hook-registry';
import { extractHookDestructures } from './hook-registry';
import { walkFiles } from './utils';

const API_CALL_PATTERNS = [
  /apiFetch\s*\(/,
  /api\.\w+\s*\(/,
  /productApi\.\w+/,
  /crmApi\.\w+/,
  /billingApi\.\w+/,
  /workspaceApi\.\w+/,
  /externalPaymentApi\.\w+/,
  /knowledgeBaseApi\.\w+/,
  /kycApi\.\w+/,
  /segmentationApi\.\w+/,
  /kloelApi\.\w+/,
  /whatsappApi\.\w+/,
  /await\s+fetch\s*\(/,
  /\.mutate\s*\(/,
  /\.trigger\s*\(/,
];

const NAV_PATTERNS = [
  /router\.push\s*\(/,
  /router\.replace\s*\(/,
  /window\.location/,
  /window\.open\s*\(/,
  /navigator\.clipboard/,
];

// Names that indicate a save/submit handler exists in the component
const SAVE_HANDLER_NAMES = [
  'handleSave', 'save', 'handleSubmit', 'onSubmit', 'onSave',
  'handleUpdate', 'handleCreate', 'submitForm', 'doSave',
];

function extractLabel(line: string, lines: string[], idx: number): string {
  // Try to find visible text on same line
  const textMatch = line.match(/>([^<]{1,60})</);
  if (textMatch) return textMatch[1].trim();

  const labelMatch = line.match(/label\s*=\s*["'`]([^"'`]{1,60})["'`]/);
  if (labelMatch) return labelMatch[1];

  const ariaMatch = line.match(/aria-label\s*=\s*["'`]([^"'`]{1,60})["'`]/);
  if (ariaMatch) return ariaMatch[1];

  const titleMatch = line.match(/title\s*=\s*["'`]([^"'`]{1,60})["'`]/);
  if (titleMatch) return titleMatch[1];

  const placeholderMatch = line.match(/placeholder\s*=\s*["'`]([^"'`]{1,60})["'`]/);
  if (placeholderMatch) return placeholderMatch[1];

  // Check next 3 lines for text content
  for (let j = 1; j <= 3 && idx + j < lines.length; j++) {
    const nextLine = lines[idx + j].trim();
    // Skip lines that look like CSS/style properties
    if (/^(?:background|display|width|height|position|border|color|font|padding|margin|flex|align|justify|cursor|opacity|transform|transition|overflow|gap|aspect|grid|z-index|top|left|right|bottom)\s*[:=]/i.test(nextLine)) continue;
    if (/^\.\.\.\w+/.test(nextLine)) continue; // ...cardBtn spread
    // Direct text content (not a tag or expression)
    const nextText = nextLine.match(/^([^<{>\s][^<]{1,60})/);
    if (nextText && !nextText[1].includes('=') && !nextText[1].includes('{') && !nextText[1].startsWith('//')) {
      return nextText[1].trim();
    }
    // Text inside a tag
    const insideTag = nextLine.match(/>([^<]{1,60})</);
    if (insideTag) return insideTag[1].trim();
  }

  return '(sem texto)';
}

function extractComponent(lines: string[], idx: number): string | null {
  for (let i = idx; i >= Math.max(0, idx - 200); i--) {
    const m = lines[i].match(/(?:export\s+)?(?:default\s+)?(?:function|const)\s+(\w+)/);
    if (m && /^[A-Z]/.test(m[1])) return m[1];
  }
  return null;
}

/**
 * Check if the component has a "save" handler that makes an API call.
 * This detects the state-then-save pattern where toggles/inputs update local state
 * and a Save button persists everything via API.
 */
function componentHasSaveHandler(fileContent: string): boolean {
  for (const name of SAVE_HANDLER_NAMES) {
    // Check if a function with this name exists and calls an API
    const funcRe = new RegExp(`(?:const|function|async function)\\s+${name}\\s*(?:=|\\()`, 'g');
    const match = funcRe.exec(fileContent);
    if (match) {
      // Get ~30 lines of function body
      const startIdx = fileContent.substring(0, match.index).split('\n').length - 1;
      const lines = fileContent.split('\n');
      const bodyText = lines.slice(startIdx, Math.min(startIdx + 40, lines.length)).join('\n');

      for (const p of API_CALL_PATTERNS) {
        if (p.test(bodyText)) return true;
      }
    }
  }
  return false;
}

/**
 * Check if a function body calls a function that's known from the hook registry.
 */
function bodyCallsHookFunction(
  bodyText: string,
  hookDestructures: Map<string, { hookName: string; funcName: string }>,
  hookRegistry: HookRegistry,
): boolean {
  for (const [localName, { hookName, funcName }] of hookDestructures) {
    // Check if the function body calls this local name
    const callRe = new RegExp(`\\b${localName}\\s*\\(`, 'g');
    if (callRe.test(bodyText)) {
      // Check if the hook is in the registry
      const hookFuncs = hookRegistry.get(hookName);
      if (hookFuncs) {
        // Check if the original function name has an API call
        if (hookFuncs.has(funcName)) return true;
        // Also check if ANY function from this hook is in the registry
        // (sometimes destructured names differ from the registered ones)
        if (hookFuncs.size > 0) return true;
      }
      // Even if not in registry, if it comes from a use* hook with
      // a mutation-like name, it's likely real
      if (/Mutation|mutation|create|update|delete|remove|add|save|submit/i.test(funcName)) {
        return true;
      }
    }
  }
  return false;
}

function hasApiCall(text: string): boolean {
  return API_CALL_PATTERNS.some(p => p.test(text));
}

/**
 * Extract a JSX handler expression using brace-counting.
 * Given a line like: onClick={handleSave} style={{display: "flex"}}
 * Returns just "handleSave" — stops at the matching closing brace.
 *
 * Handles nested braces: onClick={() => { doSomething() }}
 */
function extractJSXHandler(line: string, eventName: string): string | null {
  const pattern = new RegExp(`${eventName}\\s*=\\s*\\{`);
  const match = pattern.exec(line);
  if (!match) return null;

  const start = match.index + match[0].length;
  let depth = 1;
  let i = start;

  while (i < line.length && depth > 0) {
    const ch = line[i];
    // Skip string literals
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < line.length && line[i] !== quote) {
        if (line[i] === '\\') i++; // skip escaped char
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

/**
 * Extract names imported from @/lib/api (functions that make API calls)
 */
function extractApiImports(fileContent: string): Set<string> {
  const imports = new Set<string>();
  const re = /import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/api(?:\/\w+)?['"]/g;
  let m;
  while ((m = re.exec(fileContent)) !== null) {
    const names = m[1].split(',').map(s => s.trim().split(' as ').pop()!.trim());
    for (const name of names) {
      if (name && !['type', 'interface'].includes(name)) {
        imports.add(name);
      }
    }
  }
  return imports;
}

function resolveHandler(
  handlerExpr: string,
  lines: string[],
  fileContent: string,
  hookDestructures: Map<string, { hookName: string; funcName: string }>,
  hookRegistry: HookRegistry,
  hasSaveHandler: boolean,
  apiImportsInFile: Set<string>,
): { type: UIElement['handlerType']; apiCalls: string[] } {
  const trimmed = handlerExpr.trim();

  // Dead/noop handlers
  if (
    trimmed === '() => {}' ||
    trimmed === '()=>{}' ||
    trimmed === '() => { }' ||
    trimmed === 'noop' ||
    /^\(\)\s*=>\s*console\.\w+/.test(trimmed) ||
    /^\(\)\s*=>\s*null$/.test(trimmed) ||
    /^\(\)\s*=>\s*undefined$/.test(trimmed)
  ) {
    return { type: 'noop', apiCalls: [] };
  }

  // Navigation handler
  for (const p of NAV_PATTERNS) {
    if (p.test(trimmed)) return { type: 'navigation', apiCalls: [] };
  }

  // Inline handler with direct API call
  const apiCalls: string[] = [];
  for (const p of API_CALL_PATTERNS) {
    if (p.test(trimmed)) {
      const callMatch = trimmed.match(/apiFetch\s*(?:<[^>]*>)?\s*\(\s*(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/);
      if (callMatch) apiCalls.push(callMatch[1] || callMatch[2]);
      return { type: 'real', apiCalls };
    }
  }

  // Check if handler directly calls a hook-provided function
  // e.g., onClick={() => deleteProduct(id)} where deleteProduct comes from useProductMutations
  for (const [localName] of hookDestructures) {
    const callRe = new RegExp(`\\b${localName}\\s*\\(`);
    if (callRe.test(trimmed)) {
      return { type: 'real', apiCalls: [] };
    }
  }

  // Check if handler directly calls a function imported from API modules
  // e.g., onClick={handleSignUp} where handleSignUp calls signUp() from @/lib/api
  if (apiImportsInFile.size > 0) {
    for (const importedName of apiImportsInFile) {
      if (trimmed.includes(importedName)) {
        return { type: 'real', apiCalls: [] };
      }
    }
  }

  // Function reference: look for the function definition in file
  const funcNameMatch = trimmed.match(/^(\w+)$/);
  if (funcNameMatch) {
    const funcName = funcNameMatch[1];

    // Check if this is directly a hook-provided function
    if (hookDestructures.has(funcName)) {
      return { type: 'real', apiCalls: [] };
    }

    // Search for function body in same file
    const funcDefRe = new RegExp(`(?:const|let|function|async function)\\s+${funcName}\\s*(?:=|\\()`, 'g');
    const defMatch = funcDefRe.exec(fileContent);
    if (defMatch) {
      const defIdx = fileContent.substring(0, defMatch.index).split('\n').length - 1;

      // Use brace-depth tracking to extract ONLY this function's body
      let depth = 0;
      let bodyEnd = Math.min(defIdx + 40, lines.length);
      let bodyStarted = false;
      for (let j = defIdx; j < Math.min(defIdx + 60, lines.length); j++) {
        for (const ch of lines[j]) {
          if (ch === '{') { depth++; bodyStarted = true; }
          if (ch === '}') depth--;
        }
        if (bodyStarted && depth === 0) {
          bodyEnd = j + 1;
          break;
        }
      }

      const bodyLines = lines.slice(defIdx, bodyEnd);
      const bodyText = bodyLines.join('\n');

      // Check for direct API calls in body
      for (const p of API_CALL_PATTERNS) {
        if (p.test(bodyText)) {
          const callMatch = bodyText.match(/apiFetch\s*(?:<[^>]*>)?\s*\(\s*(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/);
          if (callMatch) apiCalls.push(callMatch[1] || callMatch[2]);
          return { type: 'real', apiCalls };
        }
      }

      // Check if body calls a hook-provided function (cross-file resolution)
      if (bodyCallsHookFunction(bodyText, hookDestructures, hookRegistry)) {
        return { type: 'real', apiCalls: [] };
      }

      // Check if function is wrapped in useCallback (React hook — always a real handler)
      if (/useCallback\s*\(/.test(bodyText)) {
        return { type: 'real', apiCalls: [] }; // useCallback-wrapped handler
      }

      // Check if body calls external lib instance methods (react-flow, fabric.js, etc.)
      // Multi-level chain: editorRef.current.text.addHeading(), reactFlowInstance.fitView()
      if (/\w+Instance(?:\??\.\w+)+\s*\(|\w+Ref\.current(?:\??\.\w+)+\s*\(|canvas\.\w+\s*\(/i.test(bodyText)) {
        return { type: 'real', apiCalls: [] }; // External lib interaction
      }

      // Check if body does file/blob operations (CSV export, download, etc.)
      if (/URL\.createObjectURL|document\.createElement\s*\(\s*['"]a['"]\)|\.download\s*=|Blob\s*\(/i.test(bodyText)) {
        return { type: 'real', apiCalls: [] }; // File/blob handler
      }

      // Check if body calls an imported API function (direct call or method call)
      for (const importedName of apiImportsInFile) {
        const callRe = new RegExp(`\\b${importedName}(?:\\s*\\(|\\.[a-zA-Z])`);
        if (callRe.test(bodyText)) {
          return { type: 'real', apiCalls: [] };
        }
      }

      // Check for navigation
      for (const p of NAV_PATTERNS) {
        if (p.test(bodyText)) return { type: 'navigation', apiCalls: [] };
      }

      // Check if body calls another function defined in the same file that makes API calls
      const localCallRe = /\b([a-z]\w+)\s*\(/gi;
      let lcMatch;
      while ((lcMatch = localCallRe.exec(bodyText)) !== null) {
        const cn = lcMatch[1];
        if (/^(?:if|for|while|return|await|catch|try|console|Math|JSON|Array|Object|String|Number|parseInt|parseFloat|setTimeout|clearTimeout|setInterval|Date|Promise|Error|require)$/.test(cn)) continue;
        if (/^set[A-Z]|^get[A-Z]/.test(cn)) continue;
        const cnDefRe = new RegExp(`(?:const|let|function|async function)\\s+${cn}\\s*(?:=|\\()`, 'g');
        const cnDef = cnDefRe.exec(fileContent);
        if (cnDef) {
          const cnIdx = fileContent.substring(0, cnDef.index).split('\n').length - 1;
          let cd = 0; let cEnd = cnIdx + 20; let cStarted = false;
          for (let cj = cnIdx; cj < Math.min(cnIdx + 40, lines.length); cj++) {
            for (const ch of lines[cj]) { if (ch === '{') { cd++; cStarted = true; } if (ch === '}') cd--; }
            if (cStarted && cd === 0) { cEnd = cj + 1; break; }
          }
          const cnBody = lines.slice(cnIdx, cEnd).join('\n');
          if (hasApiCall(cnBody)) return { type: 'real', apiCalls: [] };
        }
      }

      // Function exists but has no API call
      // Check if it's a field updater in a component with a save handler
      // BUT: if the function itself IS a save handler (name contains save/submit/create/update/delete),
      // it must have its own API call — don't exempt it
      // Only treat as "the save handler itself" if the function name STARTS with handle/on + save/submit/create
      // NOT helpers like handleTagRemove, updateForm, etc.
      const isSaveFunction = /^(?:handle)?(?:save|submit)\b/i.test(funcName) ||
                             /^(?:on)(?:Save|Submit)\b/.test(funcName) ||
                             /^(?:do|confirm)(?:Save|Submit|Create)\b/i.test(funcName);
      if (!isSaveFunction && hasSaveHandler && /set\w+\s*\(/.test(bodyText)) {
        return { type: 'real', apiCalls: [] }; // Field updater in form with save handler
      }

      // Bug 2 fix: Check if body calls a callback prop (on* function not defined locally)
      const callbackCallRe = /\b(on[A-Z]\w*)\s*\(/g;
      let cbMatch;
      while ((cbMatch = callbackCallRe.exec(bodyText)) !== null) {
        const cbName = cbMatch[1];
        // Check if this callback is NOT defined in the file (it's a prop)
        const cbDefRe = new RegExp(`(?:const|let|function|async function)\\s+${cbName}\\s*(?:=|\\()`);
        if (!cbDefRe.test(fileContent)) {
          return { type: 'real', apiCalls: [] }; // Calls parent callback prop
        }
      }

      // Bug 3 fix: Pure UI state handler — only calls setState or form update functions
      const isStateUpdater = /set\w+\s*\(|updateForm\s*\(|dispatch\s*\(|toggle\s*\(/.test(bodyText);
      if (!isSaveFunction && isStateUpdater && !hasApiCall(bodyText)) {
        return { type: 'real', apiCalls: [] }; // Pure UI state management
      }

      return { type: 'dead', apiCalls: [] };
    }
  }

  // Inline arrow function calling a named function: () => handler() or () => handler(arg)
  const inlineCallMatch = trimmed.match(/(?:\([^)]*\))?\s*=>\s*(?:\{?\s*)?(\w+)\s*\(/);
  if (inlineCallMatch) {
    const calledFunc = inlineCallMatch[1];

    // Check if it's a hook-provided function
    if (hookDestructures.has(calledFunc)) {
      return { type: 'real', apiCalls: [] };
    }

    // Recurse to resolve the called function
    const result = resolveHandler(calledFunc, lines, fileContent, hookDestructures, hookRegistry, hasSaveHandler, apiImportsInFile);

    // If recursion says dead but the component has a save handler,
    // check if the called function is a state updater (part of form)
    if (result.type === 'dead' && hasSaveHandler) {
      // Look up the function body for state setting
      const funcDefRe2 = new RegExp(`(?:const|let|function|async function)\\s+${calledFunc}\\s*(?:=|\\()`, 'g');
      const defMatch2 = funcDefRe2.exec(fileContent);
      if (defMatch2) {
        const defIdx2 = fileContent.substring(0, defMatch2.index).split('\n').length - 1;
        const bodyText2 = lines.slice(defIdx2, Math.min(defIdx2 + 20, lines.length)).join('\n');
        if (/set\w+\s*\(/.test(bodyText2)) {
          return { type: 'real', apiCalls: [] }; // State updater in form
        }
      }
    }

    return result;
  }

  // State setter: () => setState(!val) or () => set*(val)
  if (/\(\)\s*=>\s*set\w+\s*\(/.test(trimmed)) {
    // If the component has a save handler with API call, this is part of a form
    if (hasSaveHandler) {
      return { type: 'real', apiCalls: [] };
    }
    // Even without explicit save handler, state setters are legitimate UI
    return { type: 'real', apiCalls: [] };
  }

  // Arrow with args calling setState: (e) => setState(e.target.value)
  if (/\(\w*\)\s*=>\s*set\w+\s*\(/.test(trimmed)) {
    return { type: 'real', apiCalls: [] };
  }

  // Confirm dialog pattern: if (!confirm(...)) return; then action
  if (/confirm\s*\(/.test(trimmed)) {
    return { type: 'real', apiCalls: [] };
  }

  // Default: treat as real (avoid false positives)
  return { type: 'real', apiCalls: [] };
}

export function parseUIElements(config: PulseConfig, hookRegistry?: HookRegistry): UIElement[] {
  const elements: UIElement[] = [];
  const files = walkFiles(config.frontendDir, ['.tsx', '.jsx']);
  const registry = hookRegistry || new Map();

  for (const file of files) {
    if (/\.(test|spec)\./.test(file)) continue;

    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);

      // Build hook destructure map for this file (cross-file resolution)
      const hookDestructures = extractHookDestructures(content);

      // Extract imported API functions
      const apiImportsInFile = extractApiImports(content);

      // Check if component has a save handler with API call
      const hasSaveHandler = componentHasSaveHandler(content);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detect onClick handlers using brace-counting (not regex)
        const onClickHandler = extractJSXHandler(line, 'onClick');
        if (onClickHandler) {
          const handler = onClickHandler.trim();
          const resolved = resolveHandler(handler, lines, content, hookDestructures, registry, hasSaveHandler, apiImportsInFile);
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
            component,
          });
        }

        // Detect onSubmit handlers
        const onSubmitHandler = extractJSXHandler(line, 'onSubmit');
        if (onSubmitHandler) {
          const handler = onSubmitHandler.trim();
          const resolved = resolveHandler(handler, lines, content, hookDestructures, registry, hasSaveHandler, apiImportsInFile);

          elements.push({
            file: relFile,
            line: i + 1,
            type: 'form',
            label: 'form',
            handler,
            handlerType: resolved.type === 'dead' ? 'dead' : resolved.type,
            apiCalls: resolved.apiCalls,
            component: extractComponent(lines, i),
          });
        }

        // Detect Toggle/Switch
        if (/(?:<Toggle|<Switch|<Tg)\b/.test(line) && /onChange|onClick/.test(line)) {
          const handlerExpr = extractJSXHandler(line, 'onChange') || extractJSXHandler(line, 'onClick');
          if (handlerExpr) {
            const handler = handlerExpr.trim();
            const resolved = resolveHandler(handler, lines, content, hookDestructures, registry, hasSaveHandler, apiImportsInFile);

            elements.push({
              file: relFile,
              line: i + 1,
              type: 'toggle',
              label: extractLabel(line, lines, i),
              handler,
              handlerType: resolved.type,
              apiCalls: resolved.apiCalls,
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
