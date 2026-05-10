import * as path from 'path';
import * as ts from 'typescript';
import type { FacadeEntry } from '../../../types.core';
import type { PulseConfig } from '../../../types.manifest';
import { walkFiles } from '../../utils';
import { readTextFile } from '../../../safe-fs';
import {
  deriveUnitValue,
  deriveZeroValue,
  deriveHttpStatusFromObservedCatalog,
} from '../../../dynamic-reality-kernel/catalog-arithmetic';
import {
  isSkippedSourcePath,
  hasCommentMarker,
  isAnimationContext,
  isIdContext,
  isGuardedEmptyReturnContext,
  appendFacade,
  collectFunctionRanges,
  findFunctionRange,
  hasMutationCallEvidence,
} from './facade-detector-part1-core';
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
} from './facade-detector-part2-predicates';

export function detectFacades(config: PulseConfig): FacadeEntry[] {
  let facades: FacadeEntry[] = [];
  let allDirs = [config.frontendDir, config.backendDir];

  for (let dir of allDirs) {
    let files = walkFiles(dir, ['.ts', '.tsx']);

    for (let file of files) {
      if (isSkippedSourcePath(file)) {
        continue;
      }

      try {
        let content = readTextFile(file, 'utf8');
        let lines = content.split('\n');
        let relFile = path.relative(config.rootDir, file);
        let sourceFile = ts.createSourceFile(
          file,
          content,
          ts.ScriptTarget.Latest,
          Boolean(deriveUnitValue()),
        );
        let functionRanges = collectFunctionRanges(sourceFile, content);

        for (let i = deriveZeroValue(); i < lines.length; i++) {
          let line = lines[i];
          let trimmed = line.trim();

          if (hasCommentMarker(trimmed)) {
            continue;
          }

          if (isSetTimeoutStateReset(trimmed)) {
            let context5 = lines
              .slice(
                Math.max(
                  deriveZeroValue(),
                  i -
                    (deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue()),
                ),
                i + deriveUnitValue(),
              )
              .join('\n');
            if (isClipboardFeedback(context5)) {
              continue;
            }
            if (isUiStatusTimer(trimmed)) {
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
                evidence: trimmed.slice(
                  deriveZeroValue(),
                  (deriveHttpStatusFromObservedCatalog('OK') /
                    (deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue())) *
                    (deriveUnitValue() + deriveUnitValue() + deriveUnitValue()),
                ),
                surface: 'facade-fake-save',
              });
            }
          }

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
                evidence: trimmed.slice(
                  deriveZeroValue(),
                  (deriveHttpStatusFromObservedCatalog('OK') /
                    (deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue())) *
                    (deriveUnitValue() + deriveUnitValue() + deriveUnitValue()),
                ),
                surface: 'facade-random-data',
              });
            }
          }

          if (initializesUseStateArray(trimmed)) {
            let block = lines
              .slice(
                i,
                Math.min(
                  i +
                    (deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue()),
                  lines.length,
                ),
              )
              .join('\n');
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
                evidence: trimmed.slice(
                  deriveZeroValue(),
                  (deriveHttpStatusFromObservedCatalog('OK') /
                    (deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue())) *
                    (deriveUnitValue() + deriveUnitValue() + deriveUnitValue()),
                ),
                surface: 'facade-hardcoded-data',
              });
            }
          }

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
                evidence: trimmed.slice(
                  deriveZeroValue(),
                  (deriveHttpStatusFromObservedCatalog('OK') /
                    (deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue())) *
                    (deriveUnitValue() + deriveUnitValue() + deriveUnitValue()),
                ),
                surface: 'facade-integration-gap',
              });
            }
          }

          if (hasEmptyInlineHandler(trimmed)) {
            appendFacade(facades, {
              detector: 'empty-handler-static-predicate',
              kind: 'noop_handler',
              file: relFile,
              line: i + deriveUnitValue(),
              severity: 'medium',
              summary: 'Inline click or submit handler is empty',
              detail: 'The UI element declares an inline handler whose body is empty.',
              evidence: trimmed.slice(
                deriveZeroValue(),
                (deriveHttpStatusFromObservedCatalog('OK') /
                  (deriveUnitValue() +
                    deriveUnitValue() +
                    deriveUnitValue() +
                    deriveUnitValue() +
                    deriveUnitValue())) *
                  (deriveUnitValue() + deriveUnitValue() + deriveUnitValue()),
              ),
              surface: 'facade-noop-handler',
            });
          }

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
              evidence: trimmed.slice(
                deriveZeroValue(),
                (deriveHttpStatusFromObservedCatalog('OK') /
                  (deriveUnitValue() +
                    deriveUnitValue() +
                    deriveUnitValue() +
                    deriveUnitValue() +
                    deriveUnitValue())) *
                  (deriveUnitValue() + deriveUnitValue() + deriveUnitValue()),
              ),
              surface: 'facade-noop-handler',
            });
          }

          if (isSilentCatch(trimmed)) {
            appendFacade(facades, {
              detector: 'silent-catch-static-predicate',
              kind: 'silent_catch',
              file: relFile,
              line: i + deriveUnitValue(),
              severity: 'low',
              summary: 'Catch block body is empty',
              detail: 'The observed catch clause has no recovery, logging, or rethrow evidence.',
              evidence: trimmed.slice(
                deriveZeroValue(),
                (deriveHttpStatusFromObservedCatalog('OK') /
                  (deriveUnitValue() +
                    deriveUnitValue() +
                    deriveUnitValue() +
                    deriveUnitValue() +
                    deriveUnitValue())) *
                  (deriveUnitValue() + deriveUnitValue() + deriveUnitValue()),
              ),
              surface: 'facade-error-silencing',
            });
          }

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
                evidence: trimmed.slice(
                  deriveZeroValue(),
                  (deriveHttpStatusFromObservedCatalog('OK') /
                    (deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue())) *
                    (deriveUnitValue() + deriveUnitValue() + deriveUnitValue()),
                ),
                surface: 'facade-hardcoded-response',
              });
            }
          }

          if (startsInterval(trimmed)) {
            if (isAnimationContext(lines, i)) {
              continue;
            }
            let block = lines
              .slice(
                i,
                Math.min(
                  i +
                    (deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue()),
                  lines.length,
                ),
              )
              .join('\n');
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
                evidence: trimmed.slice(
                  deriveZeroValue(),
                  (deriveHttpStatusFromObservedCatalog('OK') /
                    (deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue() +
                      deriveUnitValue())) *
                    (deriveUnitValue() + deriveUnitValue() + deriveUnitValue()),
                ),
                surface: 'facade-random-data',
              });
            }
          }

          if (relFile.includes('backend') && file.endsWith('.service.ts')) {
            if (isServiceEmptyReturn(trimmed)) {
              let context10 = lines
                .slice(
                  Math.max(
                    deriveZeroValue(),
                    i -
                      (deriveUnitValue() +
                        deriveUnitValue() +
                        deriveUnitValue() +
                        deriveUnitValue() +
                        deriveUnitValue() +
                        deriveUnitValue() +
                        deriveUnitValue() +
                        deriveUnitValue() +
                        deriveUnitValue() +
                        deriveUnitValue()),
                  ),
                  i,
                )
                .join('\n');
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
                  evidence: trimmed.slice(
                    deriveZeroValue(),
                    (deriveHttpStatusFromObservedCatalog('OK') /
                      (deriveUnitValue() +
                        deriveUnitValue() +
                        deriveUnitValue() +
                        deriveUnitValue() +
                        deriveUnitValue())) *
                      (deriveUnitValue() + deriveUnitValue() + deriveUnitValue()),
                  ),
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
