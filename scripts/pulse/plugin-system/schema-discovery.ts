import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';
import type { PluginKind } from '../../types.plugin-system';

interface PluginDescriptor {
  id: string;
  path: string;
  kind: PluginKind;
}

const PLUGINS_DIR_NAME = 'plugins';
const pluginKindSchemaCache = new Map<string, Set<string>>();

export function findPulseDir(startDir: string): string {
  let current = startDir;
  while (current !== path.dirname(current)) {
    const candidate = path.join(current, 'types.plugin-system.ts');
    if (fs.existsSync(candidate)) {
      return current;
    }
    current = path.dirname(current);
  }
  return startDir;
}

function pluginKindSchema(pulseDir: string): Set<string> {
  const cached = pluginKindSchemaCache.get(pulseDir);
  if (cached) {
    return cached;
  }

  const schema = new Set<string>();
  const sourcePath = path.join(pulseDir, 'types.plugin-system.ts');
  try {
    const source = fs.readFileSync(sourcePath, 'utf8');
    const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
    sourceFile.forEachChild((node) => {
      if (!ts.isTypeAliasDeclaration(node) || node.name.text !== 'PluginKind') {
        return;
      }
      const typeNodes = ts.isUnionTypeNode(node.type) ? node.type.types : [node.type];
      for (const typeNode of typeNodes) {
        if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) {
          schema.add(typeNode.literal.text);
        }
      }
    });
  } catch {
    // Missing schema keeps the registry fail-closed at the individual plugin.
  }
  pluginKindSchemaCache.set(pulseDir, schema);
  return schema;
}

function asPluginKind(value: string, pulseDir: string): PluginKind | null {
  return pluginKindSchema(pulseDir).has(value) ? (value as PluginKind) : null;
}

function readDeclaredPluginKind(pluginDir: string): PluginKind | null {
  const indexPath = path.join(pluginDir, 'index.ts');
  if (!fs.existsSync(indexPath)) {
    return null;
  }

  try {
    const source = fs.readFileSync(indexPath, 'utf8');
    const sourceFile = ts.createSourceFile(indexPath, source, ts.ScriptTarget.Latest, true);
    let declaredKind: string | null = null;
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'kind' &&
        ts.isStringLiteralLike(node.initializer)
      ) {
        declaredKind = node.initializer.text;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return declaredKind ? asPluginKind(declaredKind, findPulseDir(pluginDir)) : null;
  } catch {
    return null;
  }
}

/**
 * Infer the plugin kind from its directory name and contents.
 *
 * Uses naming conventions to classify plugins:
 *   - `parser-*` → `parser`
 *   - `adapter-*` → `adapter`
 *   - `evidence-*` → `evidence_provider`
 *   - `gate-*` → `gate_provider`
 *   - `executor-*` → `executor`
 *   - `domain-pack-*` → `domain_pack`
 *
 * @param dirName - Plugin directory name
 * @param pluginDir - Plugin directory path (reserved for future use)
 * @returns Inferred plugin kind
 */
function inferPluginKind(dirName: string, pluginDir: string): PluginKind {
  const pulseDir = findPulseDir(pluginDir);
  const normalizedName = dirName
    .toLowerCase()
    .split('')
    .map((char) => (char === '_' || char === ':' ? '-' : char))
    .join('');
  const kinds = [...pluginKindSchema(pulseDir)];
  for (const kind of kinds) {
    const kindTokens = kind
      .toLowerCase()
      .split('')
      .map((char) => (char === '_' || char === '-' ? ' ' : char))
      .join('')
      .split(' ')
      .filter(Boolean);
    const normalizedKind = kind.split('_').join('-');
    if (
      normalizedName.startsWith(`${normalizedKind}-`) ||
      kindTokens.every((token) => normalizedName.includes(token))
    ) {
      const pluginKind = asPluginKind(kind, pulseDir);
      if (pluginKind) {
        return pluginKind;
      }
    }
  }
  const fallback = asPluginKind(kinds[0] ?? '', pulseDir);
  if (!fallback) {
    throw new Error(`Plugin kind schema could not be discovered from ${pulseDir}`);
  }
  return fallback;
}

/**
 * Discover all available plugins from the filesystem.
 *
 * Scans `scripts/pulse/plugins/` for subdirectories containing an index.ts
 * entry point. Domain packs are allowed, but they must be present on disk; the
 * PULSE core does not seed product/domain reality from built-in lists.
 *
 * @param rootDir - Repository root directory
 * @returns Array of discovered plugin descriptors with their kind
 */
export function discoverPlugins(rootDir: string): PluginDescriptor[] {
  const discovered: PluginDescriptor[] = [];

  const pluginsDir = path.join(rootDir, 'scripts', 'pulse', PLUGINS_DIR_NAME);

  if (fs.existsSync(pluginsDir)) {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
    } catch {
      return discovered;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const pluginDir = path.join(pluginsDir, entry.name);
      const indexPath = path.join(pluginDir, 'index.ts');

      if (!fs.existsSync(indexPath)) {
        continue;
      }

      const kind = readDeclaredPluginKind(pluginDir) ?? inferPluginKind(entry.name, pluginDir);
      discovered.push({
        id: entry.name,
        path: indexPath,
        kind,
      });
    }
  }

  return discovered;
}
