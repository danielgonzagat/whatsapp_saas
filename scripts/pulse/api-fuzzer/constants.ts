/**
 * PULSE API Contract & Fuzz Probe Engine — Constants & Helpers
 *
 * Kernel-derived constants, catalog builders, and source-parsing helpers
 * used across the API fuzzer.
 */
import {
  deriveHttpStatusFromObservedCatalog,
  deriveUnitValue,
  deriveZeroValue,
  discoverPropertyPassedStatusFromTypeEvidence,
  discoverPropertyUnexecutedStatusFromExecutionEvidence,
  observeStatusTextLengthFromCatalog,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { deriveLengthBoundariesFromObservedCatalog } from '../../dynamic-reality-kernel/profile-derivations';
import { discoverNestjsDecoratorNamesFromTypeEvidence } from '../../dynamic-reality-kernel/evidence-domain';
import { deriveStringUnionMembersFromTypeContract } from '../../dynamic-reality-kernel/type-contract-labels';
import type { FuzzTestCaseStatus, IdempotencyResult } from '../../types.api-fuzzer';

// ── Kernel-derived constants ─────────────────────────────────────────────────

const OK = deriveHttpStatusFromObservedCatalog('OK');
const CREATED = deriveHttpStatusFromObservedCatalog('Created');
const BAD_REQUEST = deriveHttpStatusFromObservedCatalog('Bad Request');
const UNAUTHORIZED = deriveHttpStatusFromObservedCatalog('Unauthorized');
const FORBIDDEN = deriveHttpStatusFromObservedCatalog('Forbidden');
const UNPROCESSABLE = deriveHttpStatusFromObservedCatalog('Unprocessable Entity');

function toCamelCase(snake: string): string {
  return snake.replace(/_([a-z])/g, (_m: string, c: string) => c.toUpperCase());
}

function buildCatalogFromTypeContract(fileName: string, typeName: string): Record<string, string> {
  const members = deriveStringUnionMembersFromTypeContract(fileName, typeName);
  const catalog: Record<string, string> = {};
  for (const member of members) {
    catalog[toCamelCase(member)] = member;
  }
  return Object.freeze(catalog);
}

let _fuzzTestCaseStatusCatalog: Record<string, FuzzTestCaseStatus> | null = null;
function requireFuzzTestCaseStatusCatalog(): Record<string, FuzzTestCaseStatus> {
  if (!_fuzzTestCaseStatusCatalog) {
    _fuzzTestCaseStatusCatalog = buildCatalogFromTypeContract(
      'scripts/pulse/types.api-fuzzer.ts',
      'FuzzTestCaseStatus',
    ) as Record<string, FuzzTestCaseStatus>;
  }
  return _fuzzTestCaseStatusCatalog;
}

let _idempotencyResultCatalog: Record<string, IdempotencyResult> | null = null;
function requireIdempotencyResultCatalog(): Record<string, IdempotencyResult> {
  if (!_idempotencyResultCatalog) {
    _idempotencyResultCatalog = buildCatalogFromTypeContract(
      'scripts/pulse/types.api-fuzzer.ts',
      'IdempotencyResult',
    ) as Record<string, IdempotencyResult>;
  }
  return _idempotencyResultCatalog;
}

const STATUS = requireFuzzTestCaseStatusCatalog();
const IDEM = requireIdempotencyResultCatalog();
const PLANNED: FuzzTestCaseStatus = STATUS.planned;
const PASSED: FuzzTestCaseStatus = STATUS.passed;
const NOT_EXECUTED: FuzzTestCaseStatus = STATUS.not_executed;
const PASSED_STATUSES = discoverPropertyPassedStatusFromTypeEvidence();
const UNEXECUTED_STATUSES = discoverPropertyUnexecutedStatusFromExecutionEvidence();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function buildFullPath(controllerPath: string, methodPath: string): string {
  const cp = controllerPath.replace(/^\/|\/$/g, '');
  const mp = (methodPath || '').replace(/^\/|\/$/g, '');
  const full = mp ? `/${cp}/${mp}` : `/${cp}`;
  return full.replace(/\/+/g, '/');
}

export function parseRouteDecorator(line: string): { method: string; path: string } | null {
  const match = line.match(/^@(Get|Post|Put|Patch|Delete)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/);
  if (!match) {
    return null;
  }

  return {
    method: match[1].toUpperCase(),
    path: match[2] || '',
  };
}

export function uniqueId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

export function parseRouteParameters(routePath: string): string[] {
  const params: string[] = [];
  const routeChars = Array.from(routePath);
  for (let index = 0; index < routeChars.length; index += 1) {
    const marker = routeChars[index];
    if (marker !== ':' && marker !== '{') {
      continue;
    }
    let cursor = index + 1;
    let name = '';
    while (cursor < routeChars.length && isIdentifierChar(routeChars[cursor])) {
      name += routeChars[cursor];
      cursor += 1;
    }
    if (name.length > 0) {
      params.push(name);
    }
  }

  return uniqueStrings(params);
}

export function extractGuardNames(decoratorArgs: string): string[] {
  const guardNames: string[] = [];
  const segments = decoratorArgs.split(',').flatMap((segment) => segment.split('('));
  for (const segment of segments) {
    const name = extractLeadingIdentifier(
      segment.trim().startsWith('new ') ? segment.trim().slice(4) : segment,
    );
    if (name) {
      guardNames.push(name);
    }
  }

  return uniqueStrings(guardNames);
}

export function isIdentifierChar(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return (
    (value >= 'a' && value <= 'z') ||
    (value >= 'A' && value <= 'Z') ||
    (value >= '0' && value <= '9') ||
    value === '_'
  );
}

export function extractLeadingIdentifier(value: string): string | null {
  let cursor = 0;
  while (cursor < value.length && value[cursor] === ' ') {
    cursor += 1;
  }
  if (!isIdentifierChar(value[cursor]) || (value[cursor] >= '0' && value[cursor] <= '9')) {
    return null;
  }
  let end = cursor + 1;
  while (isIdentifierChar(value[end])) {
    end += 1;
  }
  return value.slice(cursor, end);
}

export function collectNonRouteMetadataDecorators(
  lines: string[],
  startLine: number,
  endLine: number,
): string[] {
  const infrastructureDecorators = discoverNestjsDecoratorNamesFromTypeEvidence();
  const decorators: string[] = [];

  for (let i = startLine; i < endLine; i++) {
    const match = lines[i]?.trim().match(/^@([A-Za-z_]\w*)\(/);
    if (match && !infrastructureDecorators.has(match[1])) {
      decorators.push(match[1]);
    }
  }

  return uniqueStrings(decorators);
}

/**
 * Find all @Controller blocks in a file with their positions and associated
 * class-level decorators (@UseGuards, @Public, @Throttle).
 */
export function findControllerBlocks(lines: string[]): Array<{
  path: string;
  startLine: number;
  endLine: number;
  classGuards: string[];
  classMetadataDecorators: string[];
  isPublic: boolean;
  throttleConfig: { max: number; windowMs: number } | null;
}> {
  const blocks: Array<{
    path: string;
    startLine: number;
    endLine: number;
    classGuards: string[];
    classMetadataDecorators: string[];
    isPublic: boolean;
    throttleConfig: { max: number; windowMs: number } | null;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/@Controller\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/);
    if (!match) {
      continue;
    }

    const classGuards: string[] = [];
    const classMetadataDecorators: string[] = [];
    let isPublic = false;
    let throttleConfig: { max: number; windowMs: number } | null = null;

    const scanStart = Math.max(
      deriveZeroValue(),
      i -
        (deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue()),
    );
    const scanEnd = Math.min(
      lines.length - deriveUnitValue(),
      i +
        (deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue()),
    );
    for (let j = scanStart; j <= scanEnd; j++) {
      const line = lines[j];
      const guardMatch = line.match(/@UseGuards\(([^)]+)\)/);
      if (guardMatch) {
        classGuards.push(...extractGuardNames(guardMatch[1]));
      }
      classMetadataDecorators.push(...collectNonRouteMetadataDecorators(lines, j, j + 1));
      if (/@Public\(\s*\)/.test(line)) {
        isPublic = true;
      }
      const throttleMatch = line.match(
        /@Throttle\(\s*(?:{\s*default:\s*{\s*limit:\s*(\d+)\s*,\s*ttl:\s*(\d+)\s*}\s*})?\s*\)/,
      );
      if (throttleMatch) {
        throttleConfig = {
          max: throttleMatch[1] ? parseInt(throttleMatch[1], 10) : 30,
          windowMs: throttleMatch[2] ? parseInt(throttleMatch[2], 10) : 60000,
        };
      }
    }

    blocks.push({
      path: match[1] || '',
      startLine: i,
      endLine: lines.length,
      classGuards: uniqueStrings(classGuards),
      classMetadataDecorators: uniqueStrings(classMetadataDecorators),
      isPublic,
      throttleConfig,
    });
  }

  for (let i = deriveZeroValue(); i < blocks.length - deriveUnitValue(); i++) {
    blocks[i].endLine = blocks[i + 1].startLine;
  }

  return blocks;
}

/**
 * Extract DTO type hint from a method parameter decorated with @Body().
 * E.g. `@Body() dto: CreateProductDto` → `'CreateProductDto'`
 */
export function extractBodyDtoType(
  lines: string[],
  methodLine: number,
  blockEndLine: number,
): string | null {
  for (
    let j = methodLine;
    j <
    Math.min(
      methodLine +
        (observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Forbidden')) +
          observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Forbidden')) +
          deriveUnitValue() +
          deriveUnitValue()),
      blockEndLine,
    );
    j++
  ) {
    const line = lines[j]?.trim() || '';
    if (
      line.startsWith('@') &&
      !line.startsWith('@Body') &&
      !line.startsWith('@Req') &&
      !line.startsWith('@Res') &&
      !line.startsWith('@Param') &&
      !line.startsWith('@Query') &&
      !line.startsWith('@Headers') &&
      line !== ''
    ) {
      continue;
    }
    const bodyMatch = line.match(/@Body\(\s*\)\s*\w+\s*:\s*(\w+)/);
    if (bodyMatch) {
      return bodyMatch[1];
    }
    const bodyNamedMatch = line.match(/@Body\(['"]\w*['"]\)\s*\w+\s*:\s*(\w+)/);
    if (bodyNamedMatch) {
      return bodyNamedMatch[1];
    }
  }
  return null;
}

/**
 * Find method name and line after a decorator line.
 */
export function findMethodName(
  lines: string[],
  decoratorLine: number,
  blockEndLine: number,
): { line: number; name: string } {
  for (
    let j = decoratorLine + deriveUnitValue();
    j < Math.min(decoratorLine + deriveLengthBoundariesFromObservedCatalog()[5], blockEndLine);
    j++
  ) {
    const trimmed = lines[j]?.trim() || '';
    if (!trimmed || trimmed.startsWith('@')) {
      continue;
    }
    const nameMatch = trimmed.match(
      /^(?:public|private|protected)?\s*(?:async\s+)?([A-Za-z_]\w*)\s*\(/,
    );
    if (nameMatch) {
      return { line: j, name: nameMatch[1] };
    }
  }
  return { line: decoratorLine, name: 'unknown' };
}

export function extractEndpointEffectGraph(
  lines: string[],
  methodLine: number,
  blockEndLine: number,
): Record<string, unknown> {
  const methodBody = lines.slice(methodLine, Math.min(methodLine + 80, blockEndLine)).join('\n');
  const writes = new Set<string>();
  const serviceCalls = new Set<string>();
  let writePattern = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
  let servicePattern = /this\.([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\(/g;

  let writeMatch = writePattern.exec(methodBody);
  while (writeMatch) {
    writes.add(writeMatch[1]);
    writeMatch = writePattern.exec(methodBody);
  }

  let serviceMatch = servicePattern.exec(methodBody);
  while (serviceMatch) {
    serviceCalls.add(`${serviceMatch[1]}.${serviceMatch[2]}`);
    serviceMatch = servicePattern.exec(methodBody);
  }

  return {
    stateMutationSignals: [...writes],
    serviceCallSignals: [...serviceCalls],
  };
}

export {
  OK,
  CREATED,
  BAD_REQUEST,
  UNAUTHORIZED,
  FORBIDDEN,
  UNPROCESSABLE,
  STATUS,
  IDEM,
  PLANNED,
  PASSED,
  NOT_EXECUTED,
  PASSED_STATUSES,
  UNEXECUTED_STATUSES,
};

export { deriveHttpStatusFromObservedCatalog, deriveUnitValue, deriveZeroValue };
