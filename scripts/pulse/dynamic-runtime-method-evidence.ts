import { METHODS } from 'node:http';
import * as fs from 'node:fs';
import * as path from 'path';
import * as ts from 'typescript';

function regexpEscapeFromObservedLiteral(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function runtimePrototypeMethodNames(prototype: object): Set<string> {
  return new Set(
    Object.getOwnPropertyNames(prototype).filter((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      return typeof descriptor?.value === 'function';
    }),
  );
}

function declarationPathFromPackageEvidence(packageName: string): string | null {
  try {
    const baseDir = path.resolve(process.cwd(), 'backend/node_modules');
    const resolved = require.resolve(packageName, { paths: [baseDir] });
    const declarationPath = resolved.replace(/\.js$/, '.d.ts');
    return fs.existsSync(declarationPath) ? declarationPath : null;
  } catch {
    return null;
  }
}

function sourceFileFromDeclarationPath(declarationPath: string): ts.SourceFile | null {
  try {
    return ts.createSourceFile(
      declarationPath,
      fs.readFileSync(declarationPath, 'utf-8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
  } catch {
    return null;
  }
}

function methodNamesFromTypeMembers(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  function visit(node: ts.Node): void {
    if ((ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) && node.name?.text) {
      for (const member of node.members) {
        if (
          (ts.isMethodSignature(member) || ts.isMethodDeclaration(member)) &&
          member.name &&
          ts.isIdentifier(member.name)
        ) {
          names.add(member.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

function stringLiteralMembersFromSource(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  function visit(node: ts.Node): void {
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) {
      names.add(node.literal.text);
    }
    if (ts.isEnumMember(node) && node.name && ts.isIdentifier(node.name)) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

function packageMethodNames(packageName: string): Set<string> {
  const declarationPath = declarationPathFromPackageEvidence(packageName);
  if (!declarationPath) return new Set();
  const sourceFile = sourceFileFromDeclarationPath(declarationPath);
  return sourceFile ? methodNamesFromTypeMembers(sourceFile) : new Set();
}

export function discoverPrismaClientMethodNamesFromRuntimeTypeEvidence(): Set<string> {
  const names = new Set<string>();
  const declarationCandidates = [
    declarationPathFromPackageEvidence('@prisma/client/runtime/library.js'),
    path.resolve(process.cwd(), 'backend/node_modules/.prisma/client/index.d.ts'),
  ].filter((candidate): candidate is string => Boolean(candidate) && fs.existsSync(candidate));

  for (const declarationPath of declarationCandidates) {
    const sourceFile = sourceFileFromDeclarationPath(declarationPath);
    if (!sourceFile) continue;
    for (const name of methodNamesFromTypeMembers(sourceFile)) names.add(name);
    for (const name of stringLiteralMembersFromSource(sourceFile)) names.add(name);
  }
  return names;
}

export function discoverBullMQMethodNamesFromRuntimeTypeEvidence(): Set<string> {
  return packageMethodNames('bullmq');
}

export function discoverAxiosMethodNamesFromRuntimeTypeEvidence(): Set<string> {
  const methods = new Set([...METHODS].map((method) => method.toLowerCase()));
  for (const name of packageMethodNames('axios')) methods.add(name.toLowerCase());
  return methods;
}

export function discoverReservedJsKeywordsFromRuntimeEvidence(): Set<string> {
  const keywords = runtimePrototypeMethodNames(class PULSE_CONSTRUCTOR_PROBE {}.prototype);
  for (const key of Object.keys(ts.SyntaxKind)) {
    const value = ts.SyntaxKind[key as keyof typeof ts.SyntaxKind];
    if (typeof value !== 'number') continue;
    if (key.endsWith('Keyword') && !key.startsWith('First') && !key.startsWith('Last')) {
      keywords.add(key.replace(/Keyword$/, '').toLowerCase());
    }
  }
  return keywords;
}

export function discoverMutatingHttpVerbsFromSourceEvidence(): Set<string> {
  const methods = new Set<string>();
  const knownMethods = new Set([...METHODS]);
  const skipped = new Set(
    fs.existsSync('.gitignore')
      ? fs
          .readFileSync('.gitignore', 'utf-8')
          .split('\n')
          .map((line) => line.trim().replace(/^\//, '').replace(/\/$/, ''))
          .filter(Boolean)
      : [],
  );
  const stack = [process.cwd()];
  while (stack.length > Number(false)) {
    const current = stack.pop();
    if (!current) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skipped.has(entry.name) && !entry.name.startsWith('.')) stack.push(absolutePath);
        continue;
      }
      if (!entry.name.endsWith(ts.Extension.Ts)) continue;
      let content: string;
      try {
        content = fs.readFileSync(absolutePath, 'utf-8');
      } catch {
        continue;
      }
      if (!/@\s*Body\b/.test(content)) continue;
      for (const method of knownMethods) {
        const observedDecorator = new RegExp(
          `@\\s*${regexpEscapeFromObservedLiteral(method.toLowerCase())}\\b`,
          'i',
        );
        if (observedDecorator.test(content)) methods.add(method);
      }
    }
  }
  return methods;
}
