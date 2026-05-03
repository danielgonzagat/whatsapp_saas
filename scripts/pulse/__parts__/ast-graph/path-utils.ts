import * as path from 'path';

export function normalizePath(input: string): string {
  return input.split(path.sep).join('/');
}

let nextId = 0;

export function generateId(prefix: string): string {
  nextId += 1;
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
