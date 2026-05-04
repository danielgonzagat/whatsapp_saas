import * as path from 'path';
import * as ts from 'typescript';
import type { FacadeEntry, PulseConfig } from '../../../types';
import { walkFiles } from '../../utils';
import { readTextFile } from '../../../safe-fs';
import { isSkippedSourcePath, hasCommentMarker } from './utils';
import {
  isAnimationContext,
  isIdContext,
  isGuardedEmptyReturnContext,
} from './context-discrimination';
import { appendFacade } from './facade-builder';
import {
  collectFunctionRanges,
  findFunctionRange,
  hasMutationCallEvidence,
} from './function-ranges';
import {
  isSetTimeoutStateReset,
  isClipboardFeedback,
  isUiStatusTimer,
  resetsVisualFlag,
  clearsStatusMessage,
  togglesVisibility,
  usesMathRandom,
  isRandomIdGeneration,
  isRetryJitter,
  isDisplayedRandomDataContext,
  initializesUseStateArray,
  blockLooksLikeHardcodedObjectData,
  commentReferencesIntegrationGap,
  hasEmptyInlineHandler,
  hasConsoleOnlyInlineHandler,
  isSilentCatch,
  referencesFallbackResponses,
  startsInterval,
  intervalBlockChangesDisplayedValue,
  isServiceEmptyReturn,
  contextAllowsEmptyReturn,
} from './predicates';

/** Detect facades. */
export function detectFacades(config: PulseConfig): FacadeEntry[] {
  const facades: FacadeEntry[] = [];
  const allDirs = [config.frontendDir, config.backendDir];

  for (const dir of allDirs) {
    const files = walkFiles(dir, ['.ts', '.tsx']);

    for (const file of files) {
      if (isSkippedSourcePath(file)) {
        continue;
      }

      try {
        const content = readTextFile(file, 'utf8');
        const lines = content.split('\n');
        const relFile = path.relative(config.rootDir, file);
        const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
        const functionRanges = collectFunctionRanges(sourceFile, content);

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();

          if (hasCommentMarker(trimmed)) {
            continue;
          }

          // === CRITICAL: Fake Save ===
          if (isSetTimeoutStateReset(trimmed)) {
            const context5 = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
            if (isClipboardFeedback(context5)) {
              continue;
            }
            if (isUiStatusTimer(trimmed)) {
              continue;
            }
            if (resetsVisualFlag(trimmed)) {
              continue;
            }
            if (clearsStatusMessage(trimmed)) {
              continue;
            }
            if (togglesVisibility(trimmed)) {
              continue;
            }

            const functionRange = findFunctionRange(functionRanges, i);
            const hasApiCall = hasMutationCallEvidence(functionRange);

            if (!hasApiCall) {
              appendFacade(facades, {
                detector: 'fake-save-static-predicate',
                kind: 'fake_save',
                file: relFile,
                line: i + 1,
                severity: 'high',
                summary: 'setTimeout resets state without API or mutation evidence',
                detail:
                  'A state reset timer was observed in the enclosing function without fetch, API, or mutation call evidence.',
                evidence: trimmed.slice(0, 120),
                surface: 'facade-fake-save',
              });
            }
          }

          // === CRITICAL: Math.random() as data ===
          if (usesMathRandom(trimmed)) {
            if (isAnimationContext(lines, i)) {
              continue;
            }
            if (isIdContext(lines, i)) {
              continue;
            }
            if (isRandomIdGeneration(trimmed)) {
              continue;
            }
            if (isRetryJitter(trimmed)) {
              continue;
            }

            const isDataContext = isDisplayedRandomDataContext(trimmed);

            if (isDataContext) {
              appendFacade(facades, {
                detector: 'random-data-static-predicate',
                kind: 'random_data',
                file: relFile,
                line: i + 1,
                severity: 'high',
                summary: 'Math.random() feeds displayed or stored data outside animation context',
                detail:
                  'The line uses Math.random() in a data-shaped context and nearby evidence does not indicate animation, ID, or retry jitter use.',
                evidence: trimmed.slice(0, 120),
                surface: 'facade-random-data',
              });
            }
          }

          // === CRITICAL: Hardcoded data arrays in useState ===
          if (initializesUseStateArray(trimmed)) {
            const block = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
            if (blockLooksLikeHardcodedObjectData(block)) {
              appendFacade(facades, {
                detector: 'use-state-data-static-predicate',
                kind: 'hardcoded_data',
                file: relFile,
                line: i + 1,
                severity: 'high',
                summary: 'useState initializes object-array data without backend evidence',
                detail:
                  'A useState initializer contains repeated object literals with display-shaped fields.',
                evidence: trimmed.slice(0, 120),
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
                line: i + 1,
                severity: 'medium',
                summary: 'Comment marks missing API or backend integration',
                detail:
                  'A source comment uses TODO/FIXME/HACK/STUB language with integration terms.',
                evidence: trimmed.slice(0, 120),
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
              line: i + 1,
              severity: 'medium',
              summary: 'Inline click or submit handler is empty',
              detail: 'The UI element declares an inline handler whose body is empty.',
              evidence: trimmed.slice(0, 120),
              surface: 'facade-noop-handler',
            });
          }

          // === WARNING: console.log as only handler body ===
          if (hasConsoleOnlyInlineHandler(trimmed)) {
            appendFacade(facades, {
              detector: 'console-handler-static-predicate',
              kind: 'noop_handler',
              file: relFile,
              line: i + 1,
              severity: 'medium',
              summary: 'Inline click or submit handler only writes to console',
              detail:
                'The UI element declares an inline handler whose observed effect is console output only.',
              evidence: trimmed.slice(0, 120),
              surface: 'facade-noop-handler',
            });
          }

          // === LOW: Silent catch blocks ===
          if (isSilentCatch(trimmed)) {
            appendFacade(facades, {
              detector: 'silent-catch-static-predicate',
              kind: 'silent_catch',
              file: relFile,
              line: i + 1,
              severity: 'low',
              summary: 'Catch block body is empty',
              detail: 'The observed catch clause has no recovery, logging, or rethrow evidence.',
              evidence: trimmed.slice(0, 120),
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
                line: i + 1,
                severity: 'high',
                summary: 'Fallback response collection used outside animation context',
                detail:
                  'The source references fallback response identifiers that can impersonate AI or backend output.',
                evidence: trimmed.slice(0, 120),
                surface: 'facade-hardcoded-response',
              });
            }
          }

          // === CRITICAL: setInterval incrementing displayed values ===
          if (startsInterval(trimmed)) {
            if (isAnimationContext(lines, i)) {
              continue;
            }
            const block = lines.slice(i, Math.min(i + 5, lines.length)).join('\n');
            if (intervalBlockChangesDisplayedValue(block)) {
              appendFacade(facades, {
                detector: 'interval-data-static-predicate',
                kind: 'random_data',
                file: relFile,
                line: i + 1,
                severity: 'high',
                summary: 'setInterval mutates displayed values outside animation context',
                detail:
                  'The interval block increments state or uses Math.random() with no nearby animation evidence.',
                evidence: trimmed.slice(0, 120),
                surface: 'facade-random-data',
              });
            }
          }

          // === WARNING: return [] or return {} in service methods ===
          if (relFile.includes('backend') && file.endsWith('.service.ts')) {
            if (isServiceEmptyReturn(trimmed)) {
              const context10 = lines.slice(Math.max(0, i - 10), i).join('\n');
              if (!contextAllowsEmptyReturn(context10) && !isGuardedEmptyReturnContext(context10)) {
                appendFacade(facades, {
                  detector: 'service-empty-return-static-predicate',
                  kind: 'hardcoded_data',
                  file: relFile,
                  line: i + 1,
                  severity: 'medium',
                  summary: 'Service method returns empty collection/object without guard evidence',
                  detail:
                    'A backend service return statement emits [] or {} outside catch, fallback, normalizer, or guarded-empty context.',
                  evidence: trimmed.slice(0, 120),
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
