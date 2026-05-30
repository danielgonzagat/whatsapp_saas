import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { validate } from './engine.js';

export interface CrossFileRenameResult {
  symbol: string;
  changes: Map<string, string>;
  totalReferences: number;
  validations: { file: string; ok: boolean; introduced?: string }[];
}

type NamedNode = { getKind: () => number; getParent: () => unknown; getName?: () => string | undefined };
type ObjectLike = { getKind?: () => number; getProperties?: () => unknown[]; getProperty?: (name: string) => { getInitializer?: () => unknown } | undefined };
type NameNode = { getText?: () => string; replaceWithText?: (text: string) => void };

function findNearestTsconfig(absFile: string, repoRoot: string): string | undefined {
  let dir = path.dirname(absFile);
  for (;;) {
    const candidate = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(candidate)) return candidate;
    if (dir === repoRoot || dir === path.dirname(dir)) return undefined;
    dir = path.dirname(dir);
  }
}

function findOwnerTypeName(renameable: { getParent: () => unknown }): string | undefined {
  let current = renameable.getParent() as NamedNode | undefined;
  while (current) {
    const kind = current.getKind();
    if (kind === ts.SyntaxKind.ClassDeclaration || kind === ts.SyntaxKind.InterfaceDeclaration) {
      return current.getName?.();
    }
    current = current.getParent() as NamedNode | undefined;
  }
  return undefined;
}

function propertyName(node: NameNode | undefined): { raw: string; bare: string; quote: string } {
  const raw = node?.getText?.() ?? '';
  const quote = raw.length > 1 && (raw[0] === "'" || raw[0] === '"' || raw[0] === '`') ? raw[0] : '';
  return { raw, bare: quote ? raw.slice(1, -1) : raw, quote };
}

function renameKeyInObject(obj: unknown, oldName: string, newName: string, kind: typeof ts.SyntaxKind): void {
  const objectLiteral = obj as ObjectLike | undefined;
  if (!objectLiteral || objectLiteral.getKind?.() !== kind.ObjectLiteralExpression) return;
  for (const prop of objectLiteral.getProperties?.() ?? []) {
    const property = prop as { getKind?: () => number; getNameNode?: () => NameNode | undefined };
    const propKind = property.getKind?.();
    if (
      propKind !== kind.PropertyAssignment &&
      propKind !== kind.MethodDeclaration &&
      propKind !== kind.GetAccessor &&
      propKind !== kind.SetAccessor
    ) {
      continue;
    }
    const nameNode = property.getNameNode?.();
    const name = propertyName(nameNode);
    if (name.bare === oldName) nameNode?.replaceWithText?.(name.quote ? name.quote + newName + name.quote : newName);
  }
}

function factoryObject(init: unknown, kind: typeof ts.SyntaxKind): unknown {
  const fn = init as { getKind?: () => number; getBody?: () => unknown } | undefined;
  const fnKind = fn?.getKind?.();
  if (fnKind !== kind.ArrowFunction && fnKind !== kind.FunctionExpression) return undefined;
  const body = fn?.getBody?.() as { getKind?: () => number; getExpression?: () => unknown; getStatements?: () => unknown[] } | undefined;
  const bodyKind = body?.getKind?.();
  if (bodyKind === kind.ParenthesizedExpression) return body?.getExpression?.();
  if (bodyKind === kind.ObjectLiteralExpression) return body;
  if (bodyKind !== kind.Block) return undefined;
  for (const statement of body?.getStatements?.() ?? []) {
    const s = statement as { getKind?: () => number; getExpression?: () => unknown };
    if (s.getKind?.() !== kind.ReturnStatement) continue;
    const expr = s.getExpression?.() as { getKind?: () => number; getExpression?: () => unknown } | undefined;
    return expr?.getKind?.() === kind.ParenthesizedExpression ? expr.getExpression?.() : expr;
  }
  return undefined;
}

function renameAccessesOfVar(nameNode: unknown, oldName: string, newName: string, kind: typeof ts.SyntaxKind): void {
  const node = nameNode as { findReferencesAsNodes?: () => unknown[] } | undefined;
  let refs: unknown[] = [];
  try {
    refs = node?.findReferencesAsNodes?.() ?? [];
  } catch {
    return;
  }
  for (const ref of refs) {
    const parent = (ref as { getParent?: () => unknown }).getParent?.() as
      | { getKind?: () => number; getExpression?: () => unknown; getNameNode?: () => NameNode | undefined }
      | undefined;
    if (parent?.getKind?.() !== kind.PropertyAccessExpression || parent.getExpression?.() !== ref) continue;
    const member = parent.getNameNode?.();
    if (member?.getText?.() === oldName) member.replaceWithText?.(newName);
  }
}

function unwrapExpression(node: unknown, peel: Set<number>): unknown {
  let current = node as { getKind?: () => number; getExpression?: () => unknown } | undefined;
  let guard = 0;
  while (current?.getKind && current.getExpression && peel.has(current.getKind()) && guard++ < 10) {
    current = current.getExpression() as typeof current;
  }
  return current;
}

function renameBoundTestDoubles(project: { getSourceFiles: () => unknown[] }, ownerTypeName: string, oldName: string, newName: string): void {
  const kind = ts.SyntaxKind;
  const peel = new Set([kind.AsExpression, kind.ParenthesizedExpression, kind.NonNullExpression, kind.SatisfiesExpression, kind.TypeAssertionExpression]);
  const ownerTypePattern = new RegExp(`\\b(?:Partial|Pick|Record|Mocked)\\s*<\\s*${ownerTypeName}\\b`);
  for (const file of project.getSourceFiles()) {
    try {
      const source = file as { getDescendantsOfKind: (kind: number) => unknown[] };
      for (const obj of source.getDescendantsOfKind(kind.ObjectLiteralExpression)) {
        const objectLiteral = obj as ObjectLike;
        const provideVal = unwrapExpression(objectLiteral.getProperty?.('provide')?.getInitializer?.(), peel) as { getText?: () => string } | undefined;
        if (provideVal?.getText?.() !== ownerTypeName) continue;
        const useValue = unwrapExpression(objectLiteral.getProperty?.('useValue')?.getInitializer?.(), peel) as { getKind?: () => number; getSymbol?: () => { getValueDeclaration?: () => { getInitializer?: () => unknown; getNameNode?: () => unknown } | undefined } | undefined } | undefined;
        if (useValue?.getKind?.() === kind.ObjectLiteralExpression) renameKeyInObject(useValue, oldName, newName, kind);
        else if (useValue?.getKind?.() === kind.Identifier) {
          const declaration = useValue.getSymbol?.()?.getValueDeclaration?.();
          renameKeyInObject(declaration?.getInitializer?.(), oldName, newName, kind);
          renameAccessesOfVar(declaration?.getNameNode?.(), oldName, newName, kind);
        }
        renameKeyInObject(factoryObject(objectLiteral.getProperty?.('useFactory')?.getInitializer?.(), kind), oldName, newName, kind);
      }
      for (const variable of source.getDescendantsOfKind(kind.VariableDeclaration)) {
        const declaration = variable as { getTypeNode?: () => { getText?: () => string } | undefined; getInitializer?: () => unknown; getNameNode?: () => unknown };
        const typeText = declaration.getTypeNode?.()?.getText?.() ?? '';
        if (typeText !== ownerTypeName && !ownerTypePattern.test(typeText)) continue;
        const init = declaration.getInitializer?.();
        if ((init as { getKind?: () => number } | undefined)?.getKind?.() === kind.ObjectLiteralExpression) {
          renameKeyInObject(init, oldName, newName, kind);
        }
        renameAccessesOfVar(declaration.getNameNode?.(), oldName, newName, kind);
      }
    } catch {
      // Auxiliary test-double coverage must never break the validated language-service rename.
    }
  }
}

export async function renameSymbolCrossFile(
  absFile: string,
  repoRoot: string,
  line: number,
  column: number,
  newName: string,
): Promise<CrossFileRenameResult> {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(newName)) throw new Error(`invalid identifier: ${JSON.stringify(newName)}`);
  const tsconfig = findNearestTsconfig(absFile, repoRoot);
  const { Project } = await import('ts-morph');
  const project = tsconfig ? new Project({ tsConfigFilePath: tsconfig }) : new Project({ compilerOptions: { allowJs: true, noEmit: true } });
  if (!tsconfig) project.addSourceFilesAtPaths(path.join(path.dirname(absFile), '**/*.{ts,tsx,js,jsx}'));
  const projectRoot = tsconfig ? path.dirname(tsconfig) : path.dirname(absFile);
  project.addSourceFilesAtPaths([
    path.join(projectRoot, '**/*.spec.{ts,tsx}'),
    path.join(projectRoot, '**/*.test.{ts,tsx}'),
    `!${path.join(projectRoot, '**/node_modules/**')}`,
    `!${path.join(projectRoot, '**/dist/**')}`,
  ]);

  const sourceFile = project.getSourceFile(absFile) ?? project.addSourceFileAtPath(absFile);
  const original = new Map<string, string>();
  for (const file of project.getSourceFiles()) original.set(file.getFilePath(), file.getFullText());

  const text = sourceFile.getFullText();
  let offset = 0;
  for (let currentLine = 1; currentLine < line; currentLine++) {
    const newline = text.indexOf('\n', offset);
    if (newline === -1) throw new Error(`line ${line} out of range`);
    offset = newline + 1;
  }
  offset += column - 1;
  const node = sourceFile.getDescendantAtPos(offset);
  if (!node) throw new Error(`no node at ${line}:${column}`);
  const identifier = node.getKindName() === 'Identifier' ? node : node.getFirstAncestorByKind?.(ts.SyntaxKind.Identifier);
  if (!identifier || identifier.getKindName() !== 'Identifier') throw new Error(`position ${line}:${column} is not an identifier (got ${node.getKindName()})`);

  const oldName = identifier.getText();
  const renameable = identifier.asKindOrThrow(ts.SyntaxKind.Identifier);
  const ownerTypeName = findOwnerTypeName(renameable);
  const totalReferences = renameable.findReferences().reduce((count, reference) => count + reference.getReferences().length, 0);
  renameable.rename(newName);
  if (ownerTypeName) renameBoundTestDoubles(project, ownerTypeName, oldName, newName);

  const changes = new Map<string, string>();
  const validations: CrossFileRenameResult['validations'] = [];
  for (const file of project.getSourceFiles()) {
    const fullPath = file.getFilePath();
    const before = original.get(fullPath) ?? '';
    const after = file.getFullText();
    if (after === before) continue;
    const rel = path.relative(repoRoot, fullPath).split(path.sep).join('/');
    const validation = validate(rel, before, after);
    validations.push({ file: rel, ok: validation.ok, introduced: validation.introduced });
    changes.set(rel, after);
  }
  return { symbol: `${oldName} -> ${newName}`, changes, totalReferences, validations };
}

export async function renameMemberCrossFile(
  absFile: string,
  repoRoot: string,
  className: string,
  memberName: string,
  newName: string,
): Promise<CrossFileRenameResult> {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(newName)) throw new Error(`invalid identifier: ${JSON.stringify(newName)}`);
  const { Project } = await import('ts-morph');
  const probe = new Project({ compilerOptions: { allowJs: true, noEmit: true } });
  const sourceFile = probe.addSourceFileAtPath(absFile);
  const owner =
    (sourceFile.getClass?.(className) as { getMembers?: () => unknown[] } | undefined) ??
    (sourceFile.getInterface?.(className) as { getMembers?: () => unknown[] } | undefined);
  if (!owner) throw new Error(`class/interface "${className}" not found in ${path.basename(absFile)}`);
  let nameNode: { getStart?: () => number } | undefined;
  for (const member of owner.getMembers?.() ?? []) {
    const candidate = member as { getName?: () => string | undefined; getNameNode?: () => unknown };
    if (candidate.getName?.() === memberName) {
      nameNode = candidate.getNameNode?.() as { getStart?: () => number } | undefined;
      break;
    }
  }
  if (!nameNode?.getStart) throw new Error(`member "${memberName}" not found on ${className} in ${path.basename(absFile)}`);
  const pos = sourceFile.getLineAndColumnAtPos(nameNode.getStart());
  return renameSymbolCrossFile(absFile, repoRoot, pos.line, pos.column, newName);
}
