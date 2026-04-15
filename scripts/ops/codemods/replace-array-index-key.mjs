#!/usr/bin/env node
// Codemod: replace JSX `key={index}` with a stable identifier from the item.
// Targets Biome's lint/suspicious/noArrayIndexKey rule.
//
// Strategy (conservative, runtime-grounded):
// 1. For every JSX `key` attribute whose expression is a plain Identifier,
//    walk up to the nearest enclosing `.map()` arrow/function callback.
// 2. If the Identifier matches the callback's SECOND parameter (the index),
//    inspect the FIRST parameter (the item) and its TypeScript type.
// 3. If the item's type has a string/number `id` property  -> use `<item>.id`.
//    Else if it has a string/number `key` property         -> use `<item>.key`.
//    Else if it has a string/number `uuid`, `slug`, or
//         `_id` property (common stable ids)               -> use that.
//    Else                                                  -> SKIP.
// 4. If the item parameter is destructured (ObjectBindingPattern) and the
//    destructured names include any of the above, use that name directly.
// 5. Never guess, never concat, never Math.random().  Conservative beats wrong.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const frontendDir = path.join(repoRoot, 'frontend');

const { Project, SyntaxKind, Node } = await import('ts-morph');

const project = new Project({
  tsConfigFilePath: path.join(frontendDir, 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
});

const globs = [
  path.join(frontendDir, 'src/**/*.tsx'),
  `!${path.join(frontendDir, 'src/**/*.spec.tsx')}`,
  `!${path.join(frontendDir, 'src/**/*.test.tsx')}`,
  `!${path.join(frontendDir, 'src/**/__tests__/**')}`,
];

project.addSourceFilesAtPaths(globs);
// We need the surrounding project for type information.
project.resolveSourceFileDependencies();

const sourceFiles = project
  .getSourceFiles()
  .filter((sf) => sf.getFilePath().includes(`${path.sep}frontend${path.sep}src${path.sep}`))
  .filter((sf) => !/\.(spec|test)\.tsx?$/.test(sf.getFilePath()))
  .filter((sf) => !sf.getFilePath().includes(`${path.sep}__tests__${path.sep}`));

const INDEX_NAMES = new Set(['i', 'idx', 'index', 'ix', 'n']);
const STABLE_FIELDS = ['id', 'uuid', '_id', 'slug', 'key'];

let filesModified = 0;
let totalReplaced = 0;
const replacedByField = {};
const skipReasons = {
  notIndexIdentifier: 0,
  noEnclosingMap: 0,
  indexNameMismatch: 0,
  itemDestructuredNoField: 0,
  itemTypeNoStableField: 0,
  itemHasNoType: 0,
  other: 0,
};

function incReason(key) {
  skipReasons[key] = (skipReasons[key] ?? 0) + 1;
}

function isMapCallback(node) {
  // node is ArrowFunction or FunctionExpression; check parent is CallExpression
  // whose expression is a PropertyAccessExpression ending in .map
  const parent = node.getParent();
  if (!parent || parent.getKind() !== SyntaxKind.CallExpression) return false;
  const callExpr = parent;
  // Ensure this node is the FIRST argument of the call (the callback).
  const args = callExpr.getArguments();
  if (args.length === 0 || args[0] !== node) return false;
  const expr = callExpr.getExpression();
  if (!expr || expr.getKind() !== SyntaxKind.PropertyAccessExpression) return false;
  const name = expr.getName();
  return name === 'map';
}

function findEnclosingMapCallback(start) {
  let current = start.getParent();
  while (current) {
    const kind = current.getKind();
    if (kind === SyntaxKind.ArrowFunction || kind === SyntaxKind.FunctionExpression) {
      if (isMapCallback(current)) return current;
    }
    current = current.getParent();
  }
  return null;
}

function typeHasStringishProperty(type, name) {
  if (!type) return false;
  try {
    const prop = type.getProperty(name);
    if (!prop) return false;
    // Prefer a primitive-ish type
    const decls = prop.getDeclarations();
    if (!decls || decls.length === 0) return true; // exists — good enough
    const declType = prop.getTypeAtLocation(decls[0]);
    const text = declType.getText();
    // Accept string, number, literal string/number, or unions of those.
    if (/string|number/.test(text)) return true;
    // unknown/any — accept cautiously
    if (text === 'any' || text === 'unknown') return false;
    return false;
  } catch {
    return false;
  }
}

function pickStableField(type) {
  for (const name of STABLE_FIELDS) {
    if (typeHasStringishProperty(type, name)) return name;
  }
  return null;
}

function getDestructuredNames(bindingPattern) {
  // Returns array of top-level property names bound from an ObjectBindingPattern.
  const names = [];
  for (const el of bindingPattern.getElements()) {
    // el: BindingElement
    const propNameNode = el.getPropertyNameNode();
    const nameNode = el.getNameNode();
    if (propNameNode) {
      // { foo: bar } -> original property is foo; binding name is bar
      if (propNameNode.getKind() === SyntaxKind.Identifier) {
        names.push({ property: propNameNode.getText(), local: nameNode.getText() });
      }
    } else if (nameNode && nameNode.getKind() === SyntaxKind.Identifier) {
      names.push({ property: nameNode.getText(), local: nameNode.getText() });
    }
  }
  return names;
}

function processSourceFile(sourceFile) {
  let changed = 0;
  const jsxAttrs = sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute);
  for (const attr of jsxAttrs) {
    const nameNode = attr.getNameNode();
    if (!nameNode || nameNode.getText() !== 'key') continue;
    const initializer = attr.getInitializer();
    if (!initializer || initializer.getKind() !== SyntaxKind.JsxExpression) continue;
    const expr = initializer.getExpression();
    if (!expr) continue;
    // Only target plain Identifier expressions
    if (expr.getKind() !== SyntaxKind.Identifier) {
      incReason('notIndexIdentifier');
      continue;
    }
    const identName = expr.getText();
    // Walk up to enclosing map callback
    const callback = findEnclosingMapCallback(attr);
    if (!callback) {
      incReason('noEnclosingMap');
      continue;
    }
    const params = callback.getParameters();
    if (params.length < 2) {
      incReason('noEnclosingMap');
      continue;
    }
    const itemParam = params[0];
    const indexParam = params[1];
    const indexParamName = indexParam.getName?.() ?? indexParam.getNameNode().getText();

    // The key identifier must match the index parameter name.
    if (identName !== indexParamName) {
      // Allow common index synonyms, but still require exact match to the param
      incReason('indexNameMismatch');
      continue;
    }
    // Sanity: index name should look like an index (otherwise suspicious)
    if (!INDEX_NAMES.has(indexParamName)) {
      incReason('indexNameMismatch');
      continue;
    }

    // Inspect item parameter: destructured or named?
    const itemNameNode = itemParam.getNameNode();
    let replacement = null;
    let fieldUsed = null;

    if (itemNameNode.getKind() === SyntaxKind.ObjectBindingPattern) {
      // Destructured: see if a stable field is already destructured
      const bindings = getDestructuredNames(itemNameNode);
      for (const field of STABLE_FIELDS) {
        const match = bindings.find((b) => b.property === field);
        if (match) {
          replacement = match.local;
          fieldUsed = `destructured.${field}`;
          break;
        }
      }
      if (!replacement) {
        incReason('itemDestructuredNoField');
        continue;
      }
    } else if (itemNameNode.getKind() === SyntaxKind.Identifier) {
      const itemName = itemNameNode.getText();
      // Use type to find stable field
      let itemType;
      try {
        itemType = itemParam.getType();
      } catch {
        incReason('itemHasNoType');
        continue;
      }
      if (!itemType) {
        incReason('itemHasNoType');
        continue;
      }
      const field = pickStableField(itemType);
      if (!field) {
        incReason('itemTypeNoStableField');
        continue;
      }
      replacement = `${itemName}.${field}`;
      fieldUsed = field;
    } else {
      incReason('other');
      continue;
    }

    // Replace the expression text
    try {
      expr.replaceWithText(replacement);
    } catch {
      incReason('other');
      continue;
    }

    replacedByField[fieldUsed] = (replacedByField[fieldUsed] ?? 0) + 1;
    totalReplaced += 1;
    changed += 1;
  }

  if (changed > 0) {
    sourceFile.saveSync();
    filesModified += 1;
    const rel = path.relative(repoRoot, sourceFile.getFilePath());
    console.log(`  ${rel}: +${changed}`);
  }
}

for (const sf of sourceFiles) {
  processSourceFile(sf);
}

console.log('');
console.log('=== Summary ===');
console.log(`Files modified:               ${filesModified}`);
console.log(`Total keys replaced:          ${totalReplaced}`);
for (const [field, count] of Object.entries(replacedByField)) {
  console.log(`  via ${field.padEnd(22)}${count}`);
}
console.log('Skipped (reason):');
for (const [reason, count] of Object.entries(skipReasons)) {
  console.log(`  ${reason.padEnd(28)}${count}`);
}
