// PULSE — AST Graph Core Utilities
// Shared types, path normalization, and ID generation.

import * as path from 'path';
import { type Node, type Decorator } from 'ts-morph';
import { deriveUnitValue } from '../dynamic-reality-kernel/catalog-arithmetic';

// ── Types ───────────────────────────────────────────────────────────────

export type TsMorphSymbol = NonNullable<ReturnType<Node['getSymbol']>>;
export type AstTargetSymbol = TsMorphSymbol & {
  getDeclarations?(): Node[];
};
export type AstTypeChecker = ReturnType<import('ts-morph').Project['getTypeChecker']>;

export type DecoratorSemanticRole =
  | 'class_controller'
  | 'framework_module'
  | 'provider'
  | 'http_route'
  | 'schedule'
  | 'queue_handler'
  | 'event_handler'
  | 'realtime_gateway'
  | 'graphql_resolver';

export type DecoratorTargetKind = 'class' | 'method' | 'property' | 'unknown';

export interface FrameworkDecoratorMeta {
  decorator: string | null;
  frameworkHints: string[];
  semanticRoles: DecoratorSemanticRole[];
  httpMethod: string | null;
  routePath: string | null;
  authority: 'observed_ast_evidence' | 'unclassified_decorator';
}

// ── Path / Skip ─────────────────────────────────────────────────────────

export const SKIP_PATTERNS = [
  /[\\/]node_modules[\\/]/,
  /[\\/]dist[\\/]/,
  /[\\/]\.next[\\/]/,
  /[\\/]__tests__[\\/]/,
  /\.spec\.[jt]sx?$/,
  /\.test\.[jt]sx?$/,
  /\.d\.ts$/,
];

export function shouldSkip(filePath: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(filePath));
}

export function normalizePath(input: string): string {
  return input.split(path.sep).join('/');
}

// ── ID Generation ───────────────────────────────────────────────────────

let nextId = 0;

export function generateId(prefix: string): string {
  nextId += deriveUnitValue();
  return `${prefix}_${nextId}`;
}

export function buildSymbolId(filePath: string, name: string, line: number): string {
  return `${normalizePath(filePath)}:${name}:${line}`;
}

export function buildEdgeId(fromId: string, toId: string): string {
  return `${fromId}->${toId}`;
}

export function resolveSymbolId(
  symbol: { getName(): string },
  filePath: string,
  line: number,
): string {
  return buildSymbolId(filePath, symbol.getName(), line);
}
