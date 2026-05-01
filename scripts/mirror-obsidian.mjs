#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { readdirSync, statSync } from 'fs';
import { basename, dirname, extname, join } from 'path';

const BASE = '/Users/danielpenin/whatsapp_saas';
const OUT = '/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo';

const SOURCES = [
  { dir: 'frontend/src/components/flow', mirror: 'frontend/components/flow' },
  { dir: 'frontend/src/components/canvas', mirror: 'frontend/components/canvas' },
  { dir: 'frontend/src/components/checkout', mirror: 'frontend/components/checkout' },
  { dir: 'frontend/src/components/plans', mirror: 'frontend/components/plans' },
  { dir: 'frontend/src/components/products', mirror: 'frontend/components/products' },
  { dir: 'frontend/src/components/ui', mirror: 'frontend/components/ui' },
  { dir: 'frontend/src/components/kloel', mirror: 'frontend/components/kloel' },
];

function readFilesSync(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory() && e.name !== '__tests__') {
        results.push(...readFilesSync(full));
      } else if (/\.(tsx?)$/.test(e.name) && !e.name.includes('.test.')) {
        results.push(full);
      }
    }
  } catch (err) {
    console.error(`Error reading ${dir}: ${err.message}`);
  }
  return results;
}

function mirrorFile(srcPath, mirrorPath) {
  const content = readFileSync(srcPath, 'utf-8');
  const relPath = srcPath.replace(BASE + '/', '');
  const tagName = basename(dirname(dirname(mirrorPath)));
  const fileName = basename(srcPath);
  const extLabel = extname(srcPath).replace('.', '');

  const md = `---
tags: [frontend, ${tagName}, espelho]
source: ${relPath}
type: component
---

# \`${fileName}\` — ${tagName}

## Visao Geral

Componente do sistema Kloel. Localizado em \`${relPath}\`.

---

## Codigo Fonte Completo

\`\`\`${extLabel === 'tsx' ? 'tsx' : 'ts'}
${content}
\`\`\`
`;

  mkdirSync(dirname(mirrorPath), { recursive: true });
  writeFileSync(mirrorPath, md, 'utf-8');
}

let total = 0;

for (const src of SOURCES) {
  const srcDir = join(BASE, src.dir);
  const files = readFilesSync(srcDir);

  for (const file of files) {
    const relFile = file.replace(srcDir, '');
    const outPath = join(OUT, src.mirror, relFile.replace(/\.(tsx?)$/, '.md'));
    mirrorFile(file, outPath);
    total++;
  }
  console.log(`[${src.dir}]: ${files.length} files mirrored`);
}

console.log(`\nTOTAL: ${total} files mirrored to ${OUT}`);
