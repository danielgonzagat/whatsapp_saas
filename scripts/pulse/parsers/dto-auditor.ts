import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

const FINANCIAL_PATHS = [
  'checkout',
  'wallet',
  'billing',
  'payment',
  'payout',
  'withdraw',
  'transaction',
];

const CLASS_VALIDATOR_DECORATORS = [
  '@IsString',
  '@IsNumber',
  '@IsInt',
  '@IsBoolean',
  '@IsEmail',
  '@IsUrl',
  '@IsOptional',
  '@IsNotEmpty',
  '@IsArray',
  '@IsEnum',
  '@IsUUID',
  '@IsDate',
  '@IsDateString',
  '@IsPositive',
  '@IsNegative',
  '@Min(',
  '@Max(',
  '@MinLength(',
  '@MaxLength(',
  '@Length(',
  '@Matches(',
  '@IsIn(',
  '@NotIn(',
  '@ValidateNested',
  '@ArrayMinSize',
  '@ArrayMaxSize',
  '@IsDefined',
  '@IsObject',
  '@IsNotEmptyObject',
];

const FINANCIAL_FIELD_NAMES =
  /\b(price|amount|fee|commission|value|total|subtotal|discount|balance|credit|debit)\b/i;

function isFinancialFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return FINANCIAL_PATHS.some((p) => lower.includes(p));
}

function hasClassValidatorDecorator(lines: string[], lineIdx: number): boolean {
  // Look 3 lines above for decorators
  const from = Math.max(0, lineIdx - 3);
  for (let i = from; i < lineIdx; i++) {
    const t = lines[i].trim();
    if (CLASS_VALIDATOR_DECORATORS.some((d) => t.startsWith(d))) {
      return true;
    }
  }
  return false;
}

export function checkDtos(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ---- PART 1: Controllers — @Post/@Put/@Patch with untyped @Body() ----
  const controllerFiles = walkFiles(config.backendDir, ['.ts']).filter((f) => {
    if (!f.endsWith('.controller.ts')) {
      return false;
    }
    if (/\.(spec|test)\.ts$/.test(f)) {
      return false;
    }
    // Webhook controllers and external payload handlers receive external payloads — `body: any` is intentional there
    if (f.includes('webhook')) {
      return false;
    }
    if (f.includes('external-payment')) {
      return false;
    }
    if (f.includes('whatsapp-brain')) {
      return false;
    }
    return true;
  });

  for (const file of controllerFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Check if line has a mutating HTTP decorator
      const isMutatingMethod =
        trimmed.startsWith('@Post(') ||
        trimmed.startsWith('@Put(') ||
        trimmed.startsWith('@Patch(') ||
        trimmed.includes('@Post(') ||
        trimmed.includes('@Put(') ||
        trimmed.includes('@Patch(');
      if (!isMutatingMethod) {
        continue;
      }

      // Scan forward up to 20 lines to find the method signature
      const scanEnd = Math.min(i + 20, lines.length);
      for (let j = i + 1; j < scanEnd; j++) {
        const methodLine = lines[j];

        // Stop if we hit another decorator or end of block
        if (/^\s*@(?!Body|Param|Query|Headers|Req|Res|User)/.test(methodLine) && j > i + 2) {
          break;
        }
        if (/^\s*\}/.test(methodLine) && j > i + 3) {
          break;
        }

        // Look for @Body() usage in params
        if (!/@Body\s*\(\s*\)/.test(methodLine) && !/@Body\s*\(/.test(methodLine)) {
          continue;
        }
        // @Body('field') is a field extraction, not a full-body binding — skip
        if (/@Body\s*\(\s*['"]/.test(methodLine)) {
          continue;
        }

        // Extract the parameter after @Body(): look for `@Body() paramName: Type` or `@Body() paramName?: Type`
        // Capture simple word types AND inline object literals; handle optional `?` after param name
        const bodyMatch = methodLine.match(/@Body\s*\([^)]*\)\s+\w+\s*[?]?\s*(?::\s*(.+))?/);
        if (!bodyMatch) {
          continue;
        }

        const rawType = (bodyMatch[1] || '').trim();

        // Inline object type `{ key: Type; ... }` — typed, not `any`; skip
        if (rawType.startsWith('{')) {
          break;
        }
        // Record<string, ...> — typed; skip
        if (rawType.startsWith('Record<')) {
          break;
        }
        // Array types T[] — typed; skip
        if (rawType.endsWith('[]') || rawType.startsWith('Array<')) {
          break;
        }
        // Optional / union type with non-any parts (e.g. string | undefined) — skip
        if (rawType.includes('|') && !rawType.includes('any')) {
          break;
        }

        // Extract first word (handles generics like Partial<Foo>)
        const firstWordMatch = rawType.match(/^(\w+)/);
        const paramType = firstWordMatch ? firstWordMatch[1] : '';

        if (!paramType || paramType === 'any' || paramType === 'object' || paramType === 'Object') {
          breaks.push({
            type: 'ROUTE_NO_DTO',
            severity: 'high',
            file: relFile,
            line: j + 1,
            description: '@Body() parameter has no DTO type annotation or is typed as `any`',
            detail: `${methodLine.trim().slice(0, 120)} — create a typed DTO class with class-validator decorators`,
          });
        }
        break;
      }
    }
  }

  // ---- PART 2: DTO files — classes with properties but no validators ----
  const dtoFiles = walkFiles(config.backendDir, ['.ts']).filter((f) => {
    if (!/\.dto\.ts$/.test(f)) {
      return false;
    }
    if (/\.(spec|test)\.ts$/.test(f)) {
      return false;
    }
    return true;
  });

  for (const file of dtoFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);
    const isFinancial = isFinancialFile(file);

    // Find class declarations
    for (let i = 0; i < lines.length; i++) {
      const classMatch = lines[i].match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
      if (!classMatch) {
        continue;
      }

      const className = classMatch[1];

      // Find the class body end
      let depth = 0;
      let bodyStarted = false;
      let classEnd = Math.min(i + 200, lines.length);
      const classProperties: { line: number; name: string; hasValidator: boolean }[] = [];
      let classHasAnyValidator = false;

      for (let j = i; j < classEnd; j++) {
        for (const ch of lines[j]) {
          if (ch === '{') {
            depth++;
            bodyStarted = true;
          }
          if (ch === '}') {
            depth--;
          }
        }
        if (bodyStarted && depth === 0) {
          classEnd = j + 1;
          break;
        }

        // Detect class property lines (non-static, non-constructor, non-method)
        const propMatch = lines[j].match(/^\s{2,}(?:readonly\s+)?(\w+)\s*[?!]?\s*:\s*\w+/);
        if (propMatch && j > i) {
          // Skip method declarations (they have `()`)
          const propLine = lines[j];
          if (/\([^)]*\)\s*(?::\s*\w+)?\s*\{/.test(propLine)) {
            continue;
          }
          if (
            /^\s*(constructor|static|get |set |async |public |private |protected )\s/.test(propLine)
          ) {
            continue;
          }

          const hasValidator = hasClassValidatorDecorator(lines, j);
          if (hasValidator) {
            classHasAnyValidator = true;
          }

          // Check for financial fields
          if (isFinancial && FINANCIAL_FIELD_NAMES.test(propMatch[1])) {
            // Financial field must have @IsNumber + @Min(0)
            const decoratorBlock = lines.slice(Math.max(0, j - 5), j).join('\n');
            const hasIsNumber = /@IsNumber|@IsInt|@IsPositive/.test(decoratorBlock);
            const hasMinZero = /@Min\s*\(\s*0\s*\)/.test(decoratorBlock);
            if (!hasIsNumber || !hasMinZero) {
              breaks.push({
                type: 'FINANCIAL_FIELD_NO_VALIDATION',
                severity: 'high',
                file: relFile,
                line: j + 1,
                description: `Financial field '${propMatch[1]}' missing @IsNumber + @Min(0) validation`,
                detail: `In class ${className} — financial amounts must be validated as positive numbers`,
              });
            }
          }

          classProperties.push({ line: j, name: propMatch[1], hasValidator });
        }
      }

      // If class has properties but zero validators → DTO_NO_VALIDATION
      if (classProperties.length > 0 && !classHasAnyValidator) {
        breaks.push({
          type: 'DTO_NO_VALIDATION',
          severity: 'high',
          file: relFile,
          line: i + 1,
          description: `DTO class '${className}' has ${classProperties.length} properties but no class-validator decorators`,
          detail: `Add @IsString, @IsNumber, @IsOptional, etc. from 'class-validator' to each property`,
        });
      }
    }
  }

  return breaks;
}
