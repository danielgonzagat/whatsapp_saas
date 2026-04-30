import * as path from 'path';
import * as ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

interface ValidatorImportEvidence {
  namedDecorators: Map<string, string>;
  namespaces: Set<string>;
}

interface DtoPropertyEvidence {
  line: number;
  name: string;
  typeName: string;
  validatorDecorators: string[];
  decoratorBlock: string;
}

function eventType(...parts: string[]): string {
  return parts.map((part) => part.toUpperCase()).join('_');
}

function dtoBreakType(...parts: string[]): string {
  return eventType(...parts);
}

function pushBreak(breaks: Break[], entry: Break): void {
  breaks.push(entry);
}

function collectValidatorImportEvidence(content: string): ValidatorImportEvidence {
  const namedDecorators = new Map<string, string>();
  const namespaces = new Set<string>();
  const sourceFile = ts.createSourceFile('dto.ts', content, ts.ScriptTarget.Latest, true);

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (statement.moduleSpecifier.text !== 'class-validator') {
      continue;
    }
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings) {
      continue;
    }
    if (ts.isNamespaceImport(namedBindings)) {
      namespaces.add(namedBindings.name.text);
      continue;
    }
    for (const element of namedBindings.elements) {
      namedDecorators.set(element.name.text, element.propertyName?.text ?? element.name.text);
    }
  }

  return { namedDecorators, namespaces };
}

function collectDecoratorBlock(lines: string[], lineIdx: number): string {
  const block: string[] = [];
  for (let i = lineIdx - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      if (block.length > 0) {
        break;
      }
      continue;
    }
    const startsDecoratorTail =
      block.length === 0 &&
      (trimmed.endsWith(')') || trimmed.endsWith('})') || trimmed.endsWith('}'));
    if (trimmed.startsWith('@') || block.length > 0 || startsDecoratorTail) {
      block.unshift(lines[i]);
      if (trimmed.startsWith('@')) {
        continue;
      }
      continue;
    }
    break;
  }
  return block.join('\n');
}

function validatorDecoratorsInBlock(
  decoratorBlock: string,
  importEvidence: ValidatorImportEvidence,
): string[] {
  const decorators = new Set<string>();

  for (let index = 0; index < decoratorBlock.length; index++) {
    if (decoratorBlock[index] !== '@') {
      continue;
    }
    const baseStart = index + 1;
    const baseEnd = readIdentifierEnd(decoratorBlock, baseStart);
    if (baseEnd === baseStart) {
      continue;
    }
    const baseName = decoratorBlock.slice(baseStart, baseEnd);
    let propertyName: string | null = null;
    if (decoratorBlock[baseEnd] === '.') {
      const propertyStart = baseEnd + 1;
      const propertyEnd = readIdentifierEnd(decoratorBlock, propertyStart);
      if (propertyEnd > propertyStart) {
        propertyName = decoratorBlock.slice(propertyStart, propertyEnd);
        index = propertyEnd - 1;
      }
    } else {
      index = baseEnd - 1;
    }

    if (propertyName) {
      if (importEvidence.namespaces.has(baseName)) {
        decorators.add(propertyName);
      }
      continue;
    }
    const importedName = importEvidence.namedDecorators.get(baseName);
    if (importedName) {
      decorators.add(importedName);
    }
  }

  return [...decorators];
}

function readIdentifierEnd(value: string, start: number): number {
  let index = start;
  while (index < value.length) {
    const char = value[index];
    const isLetter = char.toLowerCase() !== char.toUpperCase();
    const isDigit = char >= '0' && char <= '9';
    if (!isLetter && !isDigit && char !== '_' && char !== '$') {
      break;
    }
    index++;
  }
  return index;
}

function isNumericTypeName(typeName: string): boolean {
  return typeName === 'number' || typeName === 'bigint';
}

function hasNumericValidator(property: DtoPropertyEvidence): boolean {
  return property.validatorDecorators.some((decorator) => {
    const normalized = decorator.toLowerCase();
    return (
      normalized.includes('number') ||
      normalized.includes('int') ||
      normalized.includes('positive') ||
      normalized.includes('min')
    );
  });
}

function hasLowerBoundEvidence(property: DtoPropertyEvidence): boolean {
  if (
    property.validatorDecorators.some((decorator) => decorator.toLowerCase().includes('positive'))
  ) {
    return true;
  }
  return decoratorBlockHasZeroFirstArgument(property.decoratorBlock);
}

function decoratorBlockHasZeroFirstArgument(decoratorBlock: string): boolean {
  for (let index = 0; index < decoratorBlock.length; index++) {
    if (decoratorBlock[index] !== '@') {
      continue;
    }
    const openParen = decoratorBlock.indexOf('(', index);
    if (openParen === -1) {
      continue;
    }
    let argumentStart = openParen + 1;
    while (decoratorBlock[argumentStart] === ' ') {
      argumentStart++;
    }
    if (decoratorBlock[argumentStart] !== '0') {
      continue;
    }
    let argumentEnd = argumentStart + 1;
    while (decoratorBlock[argumentEnd] === ' ') {
      argumentEnd++;
    }
    if (decoratorBlock[argumentEnd] === ',' || decoratorBlock[argumentEnd] === ')') {
      return true;
    }
  }
  return false;
}

/** Check dtos. */
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
    return true;
  });

  for (const file of controllerFiles) {
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
          pushBreak(breaks, {
            type: dtoBreakType('route', 'no', 'dto'),
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
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);
    const validatorImportEvidence = collectValidatorImportEvidence(content);

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
      const classProperties: DtoPropertyEvidence[] = [];
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
        const propMatch = lines[j].match(/^\s{2,}(?:readonly\s+)?(\w+)\s*[?!]?\s*:\s*(\w+)/);
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

          const decoratorBlock = collectDecoratorBlock(lines, j);
          const validatorDecorators = validatorDecoratorsInBlock(
            decoratorBlock,
            validatorImportEvidence,
          );
          if (validatorDecorators.length > 0) {
            classHasAnyValidator = true;
          }

          const propertyEvidence: DtoPropertyEvidence = {
            line: j,
            name: propMatch[1],
            typeName: propMatch[2],
            validatorDecorators,
            decoratorBlock,
          };

          if (isNumericTypeName(propertyEvidence.typeName)) {
            if (
              !hasNumericValidator(propertyEvidence) ||
              !hasLowerBoundEvidence(propertyEvidence)
            ) {
              pushBreak(breaks, {
                type: dtoBreakType('dto', 'numeric', 'field', 'missing', 'bounds'),
                severity: 'high',
                file: relFile,
                line: j + 1,
                description: `Numeric DTO field '${propertyEvidence.name}' is missing numeric validation with lower-bound evidence`,
                detail: `In class ${className} — numeric inputs need a class-validator numeric decorator and non-negative bound`,
              });
            }
          }

          classProperties.push(propertyEvidence);
        }
      }

      // If class has properties but zero validators → DTO_NO_VALIDATION
      if (classProperties.length > 0 && !classHasAnyValidator) {
        pushBreak(breaks, {
          type: dtoBreakType('dto', 'no', 'validation'),
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
