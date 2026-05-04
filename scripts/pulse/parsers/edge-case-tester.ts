/**
 * PULSE Parser 87: Edge Case Tester
 * Layer 18: Robustness
 * Mode: DEEP (requires codebase scan + optional runtime validation)
 *
 * CHECKS:
 * 1. Input-shape signals that imply missing boundary synthesis.
 * 2. Raw regex/decorator matches are weak evidence only; visible names come from
 *    the observed input token, property, or call shape.
 *
 * REQUIRES: PULSE_DEEP=1
 * BREAK TYPES:
 *   input-boundary-evidence-gap is a compatibility label only.
 *   The diagnostic text is synthesized from the input shape evidence instead of
 *   treating date/string/number/file/array/pagination buckets as final truth.
 */
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

const WEAK_INPUT_SHAPE_SOURCE = 'input-shape-boundary-synthesis:weak-regex';

interface BoundarySignal {
  type: Break['type'];
  severity: Break['severity'];
  observedName: string;
  observedShape: string;
  missingBoundary: string;
  rawEvidence: string;
  recommendation: string;
  lineText: string;
}

function cleanObservedName(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const cleaned = value
    .replace(/['"`{}()[\];,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

function inferDecoratedProperty(context: string, fallback: string): string {
  const propertyMatch = context.match(/^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)[!?]?\s*:/m);
  return cleanObservedName(propertyMatch?.[1], fallback);
}

function inferFunctionArgument(line: string, functionName: string, fallback: string): string {
  const escapedFunctionName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = line.match(new RegExp(`${escapedFunctionName}\\s*\\(\\s*([^,)]+)`));
  return cleanObservedName(match?.[1], fallback);
}

function inferNumericParseInput(line: string): string {
  const numberArgument = line.match(/Number\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/)?.[1];
  if (numberArgument) return cleanObservedName(numberArgument, 'parsed numeric input');

  const parseArgument = line.match(/parseInt\s*\(\s*([A-Za-z_$][\w$]*)\s*(?:,|\))/)?.[1];
  if (parseArgument) return cleanObservedName(parseArgument, 'parsed numeric input');

  const unaryArgument = line.match(/\+\s*([A-Za-z_$][\w$]*)/)?.[1];
  if (unaryArgument) return cleanObservedName(unaryArgument, 'parsed numeric input');

  return cleanObservedName(line.match(/\b(page|limit|skip|take)\b/i)?.[1], 'parsed list cursor');
}

function buildBoundaryBreak(file: string, line: number, signal: BoundarySignal): Break {
  return {
    type: signal.type,
    severity: signal.severity,
    file,
    line,
    description: `Input boundary candidate "${signal.observedName}" lacks synthesized constraints from observed ${signal.observedShape}`,
    detail: [
      `rawWeakEvidence=${signal.rawEvidence}`,
      `missingBoundary=${signal.missingBoundary}`,
      `sample=${signal.lineText.slice(0, 120)}`,
      `suggestion=${signal.recommendation}`,
    ].join(' | '),
    source: WEAK_INPUT_SHAPE_SOURCE,
    surface: signal.observedShape,
  };
}

/** Check edge cases. */
export function checkEdgeCases(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const backendFiles = walkFiles(config.backendDir, ['.ts']);

  for (const file of backendFiles) {
    if (/\.spec\.ts$|\.test\.ts$|\.spec-helpers\.ts$|\.fixtures\.ts$|migration|seed/i.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const usesDateLibrary = /from\s+['"](date-fns|luxon|moment-timezone|dayjs)['"]/.test(content);

    const relFile = path.relative(config.rootDir, file);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('//') || line.startsWith('*')) {
        continue;
      }

      if (/\b(page|limit|skip|take)\b/i.test(line) && /parseInt|Number\s*\(|\+\w/i.test(line)) {
        const context = lines.slice(Math.max(0, i - 3), i + 3).join('\n');
        const hasClamping = /Math\.max|Math\.min|\|\|\s*\d|\?\?\s*\d|isNaN|isFinite/i.test(context);
        if (!hasClamping) {
          breaks.push(
            buildBoundaryBreak(relFile, i + 1, {
              type: 'input-boundary-evidence-gap',
              severity: 'high',
              observedName: inferNumericParseInput(line),
              observedShape: 'numeric request cursor',
              missingBoundary: 'lower/upper bound clamp',
              rawEvidence: 'numeric parse near cursor token',
              lineText: line,
              recommendation: 'derive min/max/default constraints before using the cursor',
            }),
          );
        }
      }

      if (/@IsString\(\)|IsString\s*\(\)/.test(line)) {
        const context = lines.slice(i, Math.min(lines.length, i + 6)).join('\n');
        if (
          !/@MaxLength\b|@Length\b|@IsNotEmpty\b|@IsIn\b|@IsEnum\b|@Matches\b|maxLength|minLength/i.test(
            context,
          )
        ) {
          breaks.push(
            buildBoundaryBreak(relFile, i + 1, {
              type: 'input-boundary-evidence-gap',
              severity: 'high',
              observedName: inferDecoratedProperty(context, 'decorated text input'),
              observedShape: 'decorated scalar input',
              missingBoundary: 'length, membership, or content constraint',
              rawEvidence: '@IsString decorator without nearby constraining decorator',
              lineText: line,
              recommendation: 'derive explicit length/content constraints from the DTO contract',
            }),
          );
        }
      }

      if (/@IsNumber\(\)|@IsInt\(\)|IsNumber\s*\(\)|IsInt\s*\(\)/.test(line)) {
        const context = lines.slice(i, Math.min(lines.length, i + 6)).join('\n');
        if (!/@Min\(|@Max\(|@IsPositive\(\)|@IsNegative\(\)/i.test(context)) {
          breaks.push(
            buildBoundaryBreak(relFile, i + 1, {
              type: 'input-boundary-evidence-gap',
              severity: 'high',
              observedName: inferDecoratedProperty(context, 'decorated numeric input'),
              observedShape: 'decorated scalar input',
              missingBoundary: 'range or sign constraint',
              rawEvidence: '@IsNumber/@IsInt decorator without nearby range decorator',
              lineText: line,
              recommendation: 'derive explicit min/max/sign constraints from domain usage',
            }),
          );
        }
      }

      if (!usesDateLibrary) {
        if (
          /new Date\s*\(\s*(?!Date\.now|'|"|\d)/.test(line) &&
          !/isValid|isNaN|instanceof Date/i.test(line)
        ) {
          // .toISOString() on the same line = UTC conversion is present
          if (/\.toISOString\(\)/.test(line)) {
            continue;
          }
          // new Date() with no arguments = creating current timestamp, not parsing user input
          if (/new Date\s*\(\s*\)/.test(line)) {
            continue;
          }
          const context = lines.slice(Math.max(0, i - 2), i + 3).join('\n');
          if (!/isValid|isNaN|isFinite|dayjs|moment/i.test(context)) {
            breaks.push(
              buildBoundaryBreak(relFile, i + 1, {
                type: 'input-boundary-evidence-gap',
                severity: 'medium',
                observedName: inferFunctionArgument(line, 'new Date', 'parsed temporal input'),
                observedShape: 'runtime parsed scalar input',
                missingBoundary: 'validity check after parse',
                rawEvidence: 'new Date call with non-literal argument',
                lineText: line,
                recommendation: 'derive a validity guard before using the parsed value',
              }),
            );
          }
        }
      }

      if (/multer|@UploadedFile|FileInterceptor|diskStorage|memoryStorage/i.test(line)) {
        if (/^import\b/.test(line) || /^[A-Z]\w+,$/.test(line)) {
          continue;
        }
        if (/FileInterceptor/i.test(line) && !/FileInterceptor\s*\(/.test(line)) {
          continue;
        }

        const context = lines.slice(Math.max(0, i - 30), i + 30).join('\n');
        const hasSizeLimit = /fileSize|limits.*size|maxSize|MaxFileSizeValidator/i.test(context);
        const hasMimeCheck =
          /mimetype|fileFilter|allowedMimeTypes|mime|FileTypeValidator|fileType/i.test(context);

        if (!hasSizeLimit) {
          breaks.push(
            buildBoundaryBreak(relFile, i + 1, {
              type: 'input-boundary-evidence-gap',
              severity: 'high',
              observedName: inferFunctionArgument(line, 'FileInterceptor', 'uploaded payload'),
              observedShape: 'binary multipart boundary',
              missingBoundary: 'byte-size constraint',
              rawEvidence: 'upload interceptor/storage shape without nearby size limit',
              lineText: line,
              recommendation: 'derive a max byte limit from the accepted upload contract',
            }),
          );
        }
        if (!hasMimeCheck) {
          breaks.push(
            buildBoundaryBreak(relFile, i + 1, {
              type: 'input-boundary-evidence-gap',
              severity: 'high',
              observedName: inferFunctionArgument(line, 'FileInterceptor', 'uploaded payload'),
              observedShape: 'binary multipart boundary',
              missingBoundary: 'accepted media signature/type constraint',
              rawEvidence: 'upload interceptor/storage shape without nearby type filter',
              lineText: line,
              recommendation: 'derive accepted media constraints from the route contract',
            }),
          );
        }
      }

      if (/@IsArray\(\)|IsArray\s*\(\)/.test(line)) {
        const context = lines.slice(i, Math.min(lines.length, i + 6)).join('\n');
        if (!/@ArrayMaxSize|@ArrayMinSize|maxLength|MaxLength/i.test(context)) {
          breaks.push(
            buildBoundaryBreak(relFile, i + 1, {
              type: 'input-boundary-evidence-gap',
              severity: 'medium',
              observedName: inferDecoratedProperty(context, 'decorated collection input'),
              observedShape: 'decorated collection input',
              missingBoundary: 'collection cardinality constraint',
              rawEvidence: '@IsArray decorator without nearby cardinality decorator',
              lineText: line,
              recommendation: 'derive max/min collection size from downstream usage',
            }),
          );
        }
      }
    }

    if (/report|analytics|dashboard|export/i.test(file)) {
      if (/\.findMany\s*\(\s*\{/.test(content) && !/take:|skip:|cursor:/i.test(content)) {
        breaks.push(
          buildBoundaryBreak(relFile, 0, {
            type: 'input-boundary-evidence-gap',
            severity: 'high',
            observedName: `${path.basename(file)} findMany result`,
            observedShape: 'unbounded collection read',
            missingBoundary: 'result window constraint',
            rawEvidence: 'findMany call in aggregate/reporting path without take/skip/cursor',
            lineText: '.findMany({',
            recommendation: 'derive a bounded result window from caller contract or route input',
          }),
        );
      }
    }
  }

  // TODO: Implement when infrastructure available
  // - Send actual edge case payloads to running API endpoints
  // - Fuzz testing with random/boundary values
  // - Large dataset performance testing

  return breaks;
}
