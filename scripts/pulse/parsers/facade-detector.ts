import * as path from 'path';
import * as ts from 'typescript';
import type { FacadeEntry, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';
import { buildParserDiagnosticBreak } from './diagnostic-break';
import { deriveUnitValue, deriveZeroValue, deriveHttpStatusFromObservedCatalog } from '../dynamic-reality-kernel';

interface FunctionRange {
  startLine: number;
  endLine: number;
  body: string;
  node: ts.Node;
}

interface FacadeDiagnosticInput {
  detector: string;
  kind: FacadeEntry['type'];
  severity: FacadeEntry['severity'];
  file: string;
  line: number;
  summary: string;
  detail: string;
  evidence: string;
  surface: string;
  runtimeImpact?: number;
}

function compactCode(value: string): string {
  return [...value].filter((char) => char.trim().length > deriveZeroValue()).join('');
}

function lower(value: string): string {
  return value.toLowerCase();
}

function includesAny(value: string, tokens: readonly string[]): boolean {
  let normalized = lower(value);
  return tokens.some((token) => normalized.includes(lower(token)));
}

function startsWithAny(value: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function hasCommentMarker(line: string): boolean {
  let trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function isSkippedSourcePath(file: string): boolean {
  let normalized = file.replaceAll('\\', '/').toLowerCase();
  let base = path.basename(normalized);
  return (
    base.endsWith('.test.ts') ||
    base.endsWith('.test.tsx') ||
    base.endsWith('.spec.ts') ||
    base.endsWith('.spec.tsx') ||
    base.endsWith('.d.ts') ||
    normalized.includes('seed') ||
    normalized.includes('migration') ||
    normalized.includes('fixture') ||
    normalized.includes('mock.')
  );
}

// Context-aware discrimination: checks SURROUNDING lines, not just the file
function isAnimationContext(lines: string[], idx: number): boolean {
  // Check wide context (50 lines) for animation indicators
  let start = Math.max(deriveZeroValue(), idx - 50);
  let end = Math.min(lines.length, idx + 20);
  let context = lines.slice(start, end).join('\n');

  // Also check if the FILE itself is an animation/visual component
  let fullFile = lines.join('\n');
  let contextLower = context.toLowerCase();
  let fullFileLower = fullFile.toLowerCase();
  let isAnimationFile =
    fullFile.includes(".getContext('2d')") ||
    fullFile.includes('.getContext("2d")') ||
    fullFile.includes('.getContext(`2d`)') ||
    fullFile.includes('requestAnimationFrame') ||
    fullFile.includes('<canvas') ||
    ['waveform', 'heartbeat', 'loading-screen', 'scramble', 'glitch', 'particle', 'animation'].some(
      (token) => fullFileLower.includes(token),
    );

  if (isAnimationFile) {
    return true;
  }

  return (
    [
      'useeffect',
      'requestanimationframe',
      'canvas',
      'ctx.',
      '.getcontext',
      'animation',
      'animate',
      'transition',
      'keyframe',
      'svg',
      'path d=',
      'viewbox',
      'stroke',
      'fill',
      'opacity',
      'transform',
      'waveform',
      'heartbeat',
      'pulse',
      'scramble',
      'glitch',
      'particle',
      'makebeat',
      'drawframe',
      'renderloop',
      'animationloop',
    ].some((token) => contextLower.includes(token)) ||
    (contextLower.includes('setinterval') &&
      ['animation', 'visual', 'render', 'draw', 'frame'].some((token) =>
        contextLower.includes(token),
      ))
  );
}

function isIdContext(lines: string[], idx: number): boolean {
  let line = lines[idx];
  let lower = line.toLowerCase();
  return (
    line.includes('.toString(36)') ||
    ['crypto', 'uuid', 'nanoid', 'key=', 'key:'].some((token) => lower.includes(token))
  );
}

function isGuardedEmptyReturnContext(context: string): boolean {
  let compact = compactCode(context);
  let lowerContext = lower(context);
  let lastIfIndex = compact.lastIndexOf('if(');
  return (
    lastIfIndex !== deriveZeroValue() - deriveUnitValue() &&
    includesAny(lowerContext, [
      'length===0',
      '<=0',
      'null',
      'undefined',
      'array.isarray',
      'object.keys',
      'empty',
      'invalid',
      'missing',
    ])
  );
}

function appendFacade(facades: FacadeEntry[], input: FacadeDiagnosticInput): void {
  let diagnostic = buildParserDiagnosticBreak({
    detector: input.detector,
    source: `facade-evidence:${input.detector}`,
    truthMode: 'confirmed_static',
    severity: input.severity,
    file: input.file,
    line: input.line,
    summary: input.summary,
    detail: `${input.detail} Evidence: ${input.evidence}`,
    surface: input.surface,
    runtimeImpact: input.runtimeImpact,
  });
  let facadeType = input.kind;
  facades.push({
    file: diagnostic.file,
    line: diagnostic.line,
    type: facadeType,
    severity: diagnostic.severity,
    description: diagnostic.description,
    evidence: diagnostic.detail ?? input.evidence,
  });
}

function collectFunctionRanges(sourceFile: ts.SourceFile, content: string): FunctionRange[] {
  let ranges: FunctionRange[] = [];
  let visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) {
      let start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
      let end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
      ranges.push({
        startLine: start,
        endLine: end,
        body: content.slice(node.getStart(sourceFile), node.getEnd()),
        node,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return ranges;
}

function findFunctionRange(
  ranges: readonly FunctionRange[],
  lineIndex: number,
): FunctionRange | null {
  return (
    ranges
      .filter((range) => range.startLine <= lineIndex && range.endLine >= lineIndex)
      .sort(
        (left, right) => left.endLine - left.startLine - (right.endLine - right.startLine),
      )[deriveZeroValue()] ?? null
  );
}

function hasMutationCallEvidence(range: FunctionRange | null): boolean {
  if (!range) {
    return false;
  }
  let found = false;
  let visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isCallExpression(node)) {
      let expression = node.expression;
      if (ts.isIdentifier(expression) && isMutationOrFetchName(expression.text)) {
        found = true;
        return;
      }
      if (ts.isPropertyAccessExpression(expression)) {
        let owner = expression.expression.getText();
        let member = expression.name.text;
        if (
          member === 'mutate' ||
          member === 'fetch' ||
          lower(owner).endsWith('api') ||
          lower(member).endsWith('api')
        ) {
          found = true;
          return;
        }
      }
    }
    if (ts.isAwaitExpression(node) && node.expression.getText().includes('fetch(')) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(range.node, visit);
  return found;
}

function isMutationOrFetchName(name: string): boolean {
  let normalized = lower(name);
  return (
    normalized === 'apifetch' ||
    normalized === 'fetch' ||
    startsWithAny(normalized, [
      'create',
      'update',
      'delete',
      'reset',
      'upsert',
      'add',
      'remove',
      'move',
      'change',
      'upload',
      'invite',
      'approve',
      'revoke',
    ])
  );
}

function isSetTimeoutStateReset(line: string): boolean {
  let compact = compactCode(line);
  return compact.includes('setTimeout(()=>set') || compact.includes('setTimeout(function(){set');
}

function isClipboardFeedback(context: string): boolean {
  return includesAny(context, ['clipboard', 'navigator.clipboard', 'copytoclipboard', 'setcopied']);
}

function isUiStatusTimer(line: string): boolean {
  return includesAny(line, [
    'setisthinking',
    'setisloading',
    'setisprocessing',
    'setshowtoast',
    'setnotification',
    'setshowcouponmodal',
    'setvisible',
    'setshow(',
    'setshowcheck',
    'setmt(',
  ]);
}

function resetsVisualFlag(line: string): boolean {
  let compact = lower(compactCode(line));
  return (
    compact.includes('(false)') &&
    compact.includes('setis') &&
    !includesAny(compact, ['setsaved', 'setsaving', 'setsuccess'])
  );
}

function clearsStatusMessage(line: string): boolean {
  let compact = lower(compactCode(line));
  let clearsValue =
    compact.includes('(null)') || compact.includes("('')") || compact.includes('("")');
  return (
    clearsValue &&
    compact.startsWith('set') &&
    includesAny(compact, ['msg', 'message', 'status', 'action', 'error', 'info', 'feedback'])
  );
}

function togglesVisibility(line: string): boolean {
  let compact = lower(compactCode(line));
  let togglesBoolean = compact.includes('(true)') || compact.includes('(false)');
  return (
    togglesBoolean &&
    startsWithAny(compact, [
      'setvisible',
      'setshow',
      'setmt',
      'setopen',
      'setexpanded',
      'setactive',
    ])
  );
}

function usesMathRandom(line: string): boolean {
  return compactCode(line).includes('Math.random()');
}

function isRandomIdGeneration(line: string): boolean {
  let compact = lower(compactCode(line));
  return (
    compact.includes('*1e') || compact.includes('*1000000') || compact.includes('.tostring(36)')
  );
}

function isRetryJitter(line: string): boolean {
  let compact = lower(compactCode(line));
  return (
    compact.includes('*basedelay') ||
    compact.includes('*delay') ||
    compact.includes('*timeout') ||
    compact.includes('*interval') ||
    compact.includes('*retrydelay') ||
    compact.includes('*backoff')
  );
}

function isDisplayedRandomDataContext(line: string): boolean {
  let compact = compactCode(line);
  return (
    (compact.includes('set') && compact.includes('(')) ||
    (compact.startsWith('let') && compact.includes('=')) ||
    compact.includes('toFixed') ||
    compact.includes('toLocaleString') ||
    compact.includes('++') ||
    compact.includes('--') ||
    compact.includes('+=') ||
    compact.includes('-=')
  );
}

function initializesUseStateArray(line: string): boolean {
  return compactCode(line).includes('useState([');
}

function blockLooksLikeHardcodedObjectData(block: string): boolean {
  let compact = compactCode(block);
  let objectSegments = compact.split('{');
  let repeatedObjectThreshold = Number(Boolean(compact)) + Number(Boolean(block));
  return (
    objectSegments.length > repeatedObjectThreshold &&
    ['q', 'label', 'name', 'title', 'text'].some((key) =>
      [`{${key}:'`, `{${key}:"`, `{${key}:\``].some((needle) => compact.includes(needle)),
    )
  );
}

function commentReferencesIntegrationGap(line: string): boolean {
  let normalized = lower(line);
  return (
    ['todo', 'fixme', 'hack', 'stub'].some((token) => normalized.includes(token)) &&
    ['api', 'connect', 'implement', 'integrat', 'backend', 'endpoint', 'fetch', 'prisma'].some(
      (token) => normalized.includes(token),
    )
  );
}

function hasEmptyInlineHandler(line: string): boolean {
  let compact = compactCode(line);
  return compact.includes('onClick={()=>{}}') || compact.includes('onSubmit={()=>{}}');
}

function hasConsoleOnlyInlineHandler(line: string): boolean {
  let compact = compactCode(line);
  return compact.includes('onClick={()=>console.') || compact.includes('onSubmit={()=>console.');
}

function isSilentCatch(line: string): boolean {
  let compact = compactCode(line);
  return compact.startsWith('catch(') && compact.endsWith('{}');
}

function referencesFallbackResponses(line: string): boolean {
  return includesAny(line, ['FALLBACK_RESPONSES', 'fallbackResponses', 'FALLBACK_MESSAGES']);
}

function startsInterval(line: string): boolean {
  return compactCode(line).includes('setInterval(');
}

function intervalBlockChangesDisplayedValue(block: string): boolean {
  let compact = compactCode(block);
  return (
    ['=>prev+', '=>prev-', '=>p+', '=>p-', '=>v+', '=>v-'].some((token) =>
      compact.includes(token),
    ) || compact.includes('Math.random')
  );
}

function isServiceEmptyReturn(line: string): boolean {
  let compact = compactCode(line);
  return (
    compact === 'return[];' ||
    compact === 'return{};' ||
    compact === 'return[]' ||
    compact === 'return{}'
  );
}

function contextAllowsEmptyReturn(context: string): boolean {
  return includesAny(context, [
    'catch',
    'default',
    'fallback',
    'if(!',
    'normalize',
    'sanitize',
    'safeparse',
    'json.parse',
  ]);
}

/** Detect facades. */
export function detectFacades(config: PulseConfig): FacadeEntry[] {
  let facades: FacadeEntry[] = [];
  let allDirs = [config.frontendDir, config.backendDir];

  for (let dir of allDirs) {
    let files = walkFiles(dir, ['.ts', '.tsx']);

    for (let file of files) {
      // Skip test/spec/seed/migration files
      if (isSkippedSourcePath(file)) {
        continue;
      }

      try {
        let content = readTextFile(file, 'utf8');
        let lines = content.split('\n');
        let relFile = path.relative(config.rootDir, file);
        let sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
        let functionRanges = collectFunctionRanges(sourceFile, content);

        for (let i = deriveZeroValue(); i < lines.length; i++) {
          let line = lines[i];
          let trimmed = line.trim();

          // Skip comments
          if (hasCommentMarker(trimmed)) {
            continue;
          }

          // === CRITICAL: Fake Save ===
          // Detect functions with setTimeout + setState but NO API call
          if (isSetTimeoutStateReset(trimmed)) {
            // Check if this is legitimate UI feedback (not fake save)
            let context5 = lines.slice(Math.max(deriveZeroValue(), i - (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue())), i + deriveUnitValue()).join('\n');
            // Clipboard feedback
            if (isClipboardFeedback(context5)) {
              continue;
            }
            // UI state timers (thinking, loading indicators, toast auto-dismiss, animation triggers)
            if (isUiStatusTimer(trimmed)) {
              continue;
            }
            // UI visibility/animation timers (coupon modals, toasts, fade-in, mount)
            if (isUiStatusTimer(trimmed)) {
              continue;
            }
            // Timer that resets a visual indicator (not persistence)
            if (resetsVisualFlag(trimmed)) {
              continue;
            }
            // Timer that clears a status/message indicator: setTimeout(() => setMsg(null), delay)
            if (clearsStatusMessage(trimmed)) {
              continue;
            }
            // Visibility toggle: setTimeout(() => setVisible(true/false), delay) — animation
            if (togglesVisibility(trimmed)) {
              continue;
            }

            let functionRange = findFunctionRange(functionRanges, i);
            let hasApiCall = hasMutationCallEvidence(functionRange);

            if (!hasApiCall) {
              appendFacade(facades, {
                detector: 'fake-save-static-predicate',
                kind: 'fake_save',
                file: relFile,
                line: i + deriveUnitValue(),
                severity: 'high',
                summary: 'setTimeout resets state without API or mutation evidence',
                detail:
                  'A state reset timer was observed in the enclosing function without fetch, API, or mutation call evidence.',
                evidence: trimmed.slice(deriveZeroValue(), (deriveHttpStatusFromObservedCatalog('OK') / (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue())) * (deriveUnitValue() + deriveUnitValue() + deriveUnitValue())),
                surface: 'facade-fake-save',
              });
            }
          }

          // === CRITICAL: Math.random() as data ===
          if (usesMathRandom(trimmed)) {
            // Per-CONTEXT discrimination (not per-file)
            if (isAnimationContext(lines, i)) {
              continue;
            }
            if (isIdContext(lines, i)) {
              continue;
            }
            // ID generation: Math.round(Math.random() * 1e9), Math.random().toString(36)
            if (isRandomIdGeneration(trimmed)) {
              continue;
            }
            // Retry jitter: Math.random() * delay or Math.random() * baseDelay
            if (isRetryJitter(trimmed)) {
              continue;
            }

            // Check if result is displayed to user (assigned to state/variable that renders)
            let isDataContext = isDisplayedRandomDataContext(trimmed);

            if (isDataContext) {
              appendFacade(facades, {
                detector: 'random-data-static-predicate',
                kind: 'random_data',
                file: relFile,
                line: i + deriveUnitValue(),
                severity: 'high',
                summary: 'Math.random() feeds displayed or stored data outside animation context',
                detail:
                  'The line uses Math.random() in a data-shaped context and nearby evidence does not indicate animation, ID, or retry jitter use.',
                evidence: trimmed.slice(deriveZeroValue(), (deriveHttpStatusFromObservedCatalog('OK') / (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue())) * (deriveUnitValue() + deriveUnitValue() + deriveUnitValue())),
                surface: 'facade-random-data',
              });
            }
          }

          // === CRITICAL: Hardcoded data arrays in useState ===
          if (initializesUseStateArray(trimmed)) {
            // Check if it's a hardcoded array of objects with string values (looks like real data)
            let block = lines.slice(i, Math.min(i + (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue()), lines.length)).join('\n');
            if (blockLooksLikeHardcodedObjectData(block)) {
              appendFacade(facades, {
                detector: 'use-state-data-static-predicate',
                kind: 'hardcoded_data',
                file: relFile,
                line: i + deriveUnitValue(),
                severity: 'high',
                summary: 'useState initializes object-array data without backend evidence',
                detail:
                  'A useState initializer contains repeated object literals with display-shaped fields.',
                evidence: trimmed.slice(deriveZeroValue(), (deriveHttpStatusFromObservedCatalog('OK') / (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue())) * (deriveUnitValue() + deriveUnitValue() + deriveUnitValue())),
                surface: 'facade-hardcoded-data',
              });
            }
          }

          // === WARNING: TODO/FIXME stubs referencing API/backend ===
          if (trimmed.startsWith('//')) {
            if (commentReferencesIntegrationGap(trimmed)) {
              appendFacade(facades, {
                detector: 'integration-comment-static-predicate',
                kind: 'todo_stub',
                file: relFile,
                line: i + deriveUnitValue(),
                severity: 'medium',
                summary: 'Comment marks missing API or backend integration',
                detail:
                  'A source comment uses TODO/FIXME/HACK/STUB language with integration terms.',
                evidence: trimmed.slice(deriveZeroValue(), (deriveHttpStatusFromObservedCatalog('OK') / (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue())) * (deriveUnitValue() + deriveUnitValue() + deriveUnitValue())),
                surface: 'facade-integration-gap',
              });
            }
          }

          // === WARNING: Noop onClick/onSubmit handlers ===
          if (hasEmptyInlineHandler(trimmed)) {
            appendFacade(facades, {
              detector: 'empty-handler-static-predicate',
              kind: 'noop_handler',
              file: relFile,
              line: i + deriveUnitValue(),
              severity: 'medium',
              summary: 'Inline click or submit handler is empty',
              detail: 'The UI element declares an inline handler whose body is empty.',
              evidence: trimmed.slice(deriveZeroValue(), (deriveHttpStatusFromObservedCatalog('OK') / (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue())) * (deriveUnitValue() + deriveUnitValue() + deriveUnitValue())),
              surface: 'facade-noop-handler',
            });
          }

          // === WARNING: console.log as only handler body ===
          if (hasConsoleOnlyInlineHandler(trimmed)) {
            appendFacade(facades, {
              detector: 'console-handler-static-predicate',
              kind: 'noop_handler',
              file: relFile,
              line: i + deriveUnitValue(),
              severity: 'medium',
              summary: 'Inline click or submit handler only writes to console',
              detail:
                'The UI element declares an inline handler whose observed effect is console output only.',
              evidence: trimmed.slice(deriveZeroValue(), (deriveHttpStatusFromObservedCatalog('OK') / (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue())) * (deriveUnitValue() + deriveUnitValue() + deriveUnitValue())),
              surface: 'facade-noop-handler',
            });
          }

          // === LOW: Silent catch blocks ===
          if (isSilentCatch(trimmed)) {
            appendFacade(facades, {
              detector: 'silent-catch-static-predicate',
              kind: 'silent_catch',
              file: relFile,
              line: i + deriveUnitValue(),
              severity: 'low',
              summary: 'Catch block body is empty',
              detail: 'The observed catch clause has no recovery, logging, or rethrow evidence.',
              evidence: trimmed.slice(deriveZeroValue(), (deriveHttpStatusFromObservedCatalog('OK') / (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue())) * (deriveUnitValue() + deriveUnitValue() + deriveUnitValue())),
              surface: 'facade-error-silencing',
            });
          }

          // === CRITICAL: FALLBACK_RESPONSES pattern (hardcoded chat responses) ===
          if (referencesFallbackResponses(trimmed)) {
            if (!isAnimationContext(lines, i)) {
              appendFacade(facades, {
                detector: 'fallback-response-static-predicate',
                kind: 'hardcoded_data',
                file: relFile,
                line: i + deriveUnitValue(),
                severity: 'high',
                summary: 'Fallback response collection used outside animation context',
                detail:
                  'The source references fallback response identifiers that can impersonate AI or backend output.',
                evidence: trimmed.slice(deriveZeroValue(), (deriveHttpStatusFromObservedCatalog('OK') / (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue())) * (deriveUnitValue() + deriveUnitValue() + deriveUnitValue())),
                surface: 'facade-hardcoded-response',
              });
            }
          }

          // === CRITICAL: setInterval incrementing displayed values ===
          if (startsInterval(trimmed)) {
            if (isAnimationContext(lines, i)) {
              continue;
            }
            let block = lines.slice(i, Math.min(i + (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue()), lines.length)).join('\n');
            if (intervalBlockChangesDisplayedValue(block)) {
              appendFacade(facades, {
                detector: 'interval-data-static-predicate',
                kind: 'random_data',
                file: relFile,
                line: i + deriveUnitValue(),
                severity: 'high',
                summary: 'setInterval mutates displayed values outside animation context',
                detail:
                  'The interval block increments state or uses Math.random() with no nearby animation evidence.',
                evidence: trimmed.slice(deriveZeroValue(), (deriveHttpStatusFromObservedCatalog('OK') / (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue())) * (deriveUnitValue() + deriveUnitValue() + deriveUnitValue())),
                surface: 'facade-random-data',
              });
            }
          }

          // === WARNING: return [] or return {} in service methods ===
          if (relFile.includes('backend') && file.endsWith('.service.ts')) {
            if (isServiceEmptyReturn(trimmed)) {
              // Check if this is inside a catch block, fallback, or utility function
              let context10 = lines.slice(Math.max(deriveZeroValue(), i - (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue())), i).join('\n');
              // Skip: catch blocks, fallback patterns, utility normalizers, default returns
              if (!contextAllowsEmptyReturn(context10) && !isGuardedEmptyReturnContext(context10)) {
                appendFacade(facades, {
                  detector: 'service-empty-return-static-predicate',
                  kind: 'hardcoded_data',
                  file: relFile,
                  line: i + deriveUnitValue(),
                  severity: 'medium',
                  summary: 'Service method returns empty collection/object without guard evidence',
                  detail:
                    'A backend service return statement emits [] or {} outside catch, fallback, normalizer, or guarded-empty context.',
                  evidence: trimmed.slice(deriveZeroValue(), (deriveHttpStatusFromObservedCatalog('OK') / (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue())) * (deriveUnitValue() + deriveUnitValue() + deriveUnitValue())),
                  surface: 'facade-hardcoded-data',
                });
              }
            }
          }
        }
      } catch (e) {
        process.stderr.write(
          `  [warn] Could not scan facades in ${file}: ${(e as Error).message}\n`,
        );
      }
    }
  }

  return facades;
}
