// PULSE — Live Codebase Nervous System
// AST-resolved call graph builder using ts-morph Compiler API.
// Replaces regex-based call resolution with type-aware symbol traces.

import type { Node, Project } from 'ts-morph';

export type TsMorphSymbol = NonNullable<ReturnType<Node['getSymbol']>>;
export type AstTargetSymbol = TsMorphSymbol & {
  getDeclarations?(): Node[];
};
export type AstTypeChecker = ReturnType<Project['getTypeChecker']>;

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

const SKIP_PATTERNS = [
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
