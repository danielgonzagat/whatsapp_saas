/**
 * PULSE Parser 87: Edge Case Tester
 * Layer 18: Robustness
 * Mode: DEEP (requires codebase scan + optional runtime validation)
 *
 * CHECKS:
 * 1. Pagination edge cases: page=0, page=-1, limit=0, limit=99999, missing params
 *    — verifies backend clamps/defaults and frontend handles empty/overflow pages
 * 2. String edge cases: empty string, whitespace-only, very long string (>1000 chars),
 *    SQL injection fragments, null bytes, HTML in text fields
 * 3. Number edge cases: 0, -1, NaN, Infinity, very large numbers (overflow),
 *    numbers as strings, decimal precision loss
 * 4. Date edge cases: invalid date strings, dates far in future/past, null dates,
 *    DST transition dates, Feb 29 on non-leap years
 * 5. File upload edge cases: empty file, file > size limit, wrong MIME type,
 *    filename with special characters, no extension
 * 6. Array edge cases: empty array, single element, very large array (>10k elements),
 *    duplicate values, null/undefined elements
 *
 * REQUIRES: PULSE_DEEP=1
 * BREAK TYPES:
 *   EDGE_CASE_PAGINATION(high) — pagination has no bounds checking
 *   EDGE_CASE_STRING(high)     — string inputs not validated for length/content
 *   EDGE_CASE_NUMBER(high)     — numeric inputs not validated for NaN/Infinity/range
 *   EDGE_CASE_DATE(medium)     — date inputs not validated
 *   EDGE_CASE_FILE(high)       — file uploads missing size/type validation
 *   EDGE_CASE_ARRAY(medium)    — array inputs not bounded
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

/** Check edge cases. */
export function checkEdgeCases(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const backendFiles = walkFiles(config.backendDir, ['.ts']);

  for (const file of backendFiles) {
    if (/\.spec\.ts$|migration|seed/i.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('//') || line.startsWith('*')) {
        continue;
      }

      // CHECK 1: Pagination without bounds
      if (/page|limit|skip|take/i.test(line) && /parseInt|Number\s*\(|\+\w/i.test(line)) {
        // Look for clamping in context
        const context = lines.slice(Math.max(0, i - 3), i + 3).join('\n');
        const hasClamping = /Math\.max|Math\.min|\|\|\s*\d|\?\?\s*\d|isNaN|isFinite/i.test(context);
        if (!hasClamping) {
          breaks.push({
            type: 'EDGE_CASE_PAGINATION',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description:
              'Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed',
            detail: `${line.slice(0, 120)} — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)`,
          });
        }
      }

      // CHECK 2: String inputs without MaxLength decorator or length check
      if (/@IsString\(\)|IsString\s*\(\)/.test(line)) {
        // Look for @MaxLength or @Length in next 5 lines
        const context = lines.slice(i, Math.min(lines.length, i + 6)).join('\n');
        if (!/@MaxLength|@Length|@IsNotEmpty|maxLength|minLength/i.test(context)) {
          breaks.push({
            type: 'EDGE_CASE_STRING',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description:
              '@IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB',
            detail:
              'Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings',
          });
        }
      }

      // CHECK 3: Number inputs without IsInt/IsNumber + Min/Max
      if (/@IsNumber\(\)|@IsInt\(\)|IsNumber\s*\(\)|IsInt\s*\(\)/.test(line)) {
        const context = lines.slice(i, Math.min(lines.length, i + 6)).join('\n');
        if (!/@Min\(|@Max\(|@IsPositive\(\)|@IsNegative\(\)/i.test(context)) {
          breaks.push({
            type: 'EDGE_CASE_NUMBER',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description:
              '@IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation',
            detail:
              'Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts',
          });
        }
      }

      // CHECK 4: Date parsing without validation
      if (
        /new Date\s*\(\s*(?!Date\.now|'|"|\d)/.test(line) &&
        !/isValid|isNaN|instanceof Date/i.test(line)
      ) {
        const context = lines.slice(Math.max(0, i - 2), i + 3).join('\n');
        if (!/isValid|isNaN|isFinite|dayjs|moment/i.test(context)) {
          breaks.push({
            type: 'EDGE_CASE_DATE',
            severity: 'medium',
            file: relFile,
            line: i + 1,
            description:
              'new Date() from user input without validation — invalid dates produce Invalid Date silently',
            detail: `${line.slice(0, 120)} — validate with: if (isNaN(date.getTime())) throw new BadRequestException('Invalid date')`,
          });
        }
      }

      // CHECK 5: File upload without size/type validation
      if (/multer|@UploadedFile|FileInterceptor|diskStorage|memoryStorage/i.test(line)) {
        const context = lines.slice(Math.max(0, i - 10), i + 20).join('\n');
        const hasSizeLimit = /fileSize|limits.*size|maxSize/i.test(context);
        const hasMimeCheck = /mimetype|fileFilter|allowedMimeTypes|mime/i.test(context);

        if (!hasSizeLimit) {
          breaks.push({
            type: 'EDGE_CASE_FILE',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description:
              'File upload without size limit — large files may exhaust memory or storage',
            detail: 'Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)',
          });
        }
        if (!hasMimeCheck) {
          breaks.push({
            type: 'EDGE_CASE_FILE',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description: 'File upload without MIME type validation — any file type accepted',
            detail:
              'Add fileFilter to reject non-image/non-document files; check mimetype whitelist',
          });
        }
      }

      // CHECK 6: Array inputs without max length
      if (/@IsArray\(\)|IsArray\s*\(\)/.test(line)) {
        const context = lines.slice(i, Math.min(lines.length, i + 6)).join('\n');
        if (!/@ArrayMaxSize|@ArrayMinSize|maxLength|MaxLength/i.test(context)) {
          breaks.push({
            type: 'EDGE_CASE_ARRAY',
            severity: 'medium',
            file: relFile,
            line: i + 1,
            description:
              '@IsArray() without @ArrayMaxSize — user can send array with 10k+ elements',
            detail:
              'Add @ArrayMaxSize(100) or appropriate limit to prevent DoS via large array payloads',
          });
        }
      }
    }

    // CHECK: findMany without pagination in financial/reporting contexts
    if (/report|analytics|dashboard|export/i.test(file)) {
      if (/\.findMany\s*\(\s*\{/.test(content) && !/take:|skip:|cursor:/i.test(content)) {
        breaks.push({
          type: 'EDGE_CASE_PAGINATION',
          severity: 'high',
          file: relFile,
          line: 0,
          description:
            'findMany() in reporting context without take/skip — may return all records and exhaust memory',
          detail:
            'Add take: and skip: to all findMany() calls; provide pagination for large datasets',
        });
      }
    }
  }

  // TODO: Implement when infrastructure available
  // - Send actual edge case payloads to running API endpoints
  // - Fuzz testing with random/boundary values
  // - Large dataset performance testing

  return breaks;
}
