import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, globSync, statSync } from 'node:fs';
import { join, relative, dirname, extname } from 'node:path';

const REPO_ROOT = '/Users/danielpenin/whatsapp_saas';
const OUTPUT_BASE =
  '/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo/_source/Tests';

const PATTERNS = [
  'backend/src/**/*.spec.ts',
  'frontend/src/**/*.test.ts',
  'frontend/src/**/*.test.tsx',
  'worker/test/**/*.spec.ts',
  'e2e/**/*.spec.ts',
  'scripts/pulse/__tests__/**/*.spec.ts',
  'backend/test/**/*.e2e-spec.ts',
];

function collectFiles() {
  const files = [];
  for (const pattern of PATTERNS) {
    const matches = globSync(pattern, { cwd: REPO_ROOT });
    for (const m of matches) {
      const full = join(REPO_ROOT, m);
      try {
        if (statSync(full).isFile()) {
          files.push(full);
        }
      } catch (e) {
        /* skip */
      }
    }
  }
  return [...new Set(files)]; // dedup
}

function sha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function isoNow() {
  return new Date().toISOString();
}

function langFromExt(ext) {
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    default:
      return '';
  }
}

function escapeWikiLink(s) {
  // Obsidian wiki-link safe: replace problematic chars
  return s.replace(/[\[\]|#]/g, '-');
}

function mirrorFile(filePath) {
  const rel = relative(REPO_ROOT, filePath);
  const content = readFileSync(filePath, 'utf8');
  const hash = sha256(content);
  const ext = extname(filePath);
  const lang = langFromExt(ext);

  // Output path mirrors source structure under Tests/
  const outRel = rel.replace(/\//g, ' - ').replace(new RegExp(`\\${ext}$`), '') + '.md';
  const outPath = join(OUTPUT_BASE, outRel);

  // Ensure directory exists
  mkdirSync(dirname(outPath), { recursive: true });

  const frontmatter = [
    '---',
    'tipo: espelho',
    'status: SINCRONIZADO',
    `source: ${rel}`,
    `source_hash: ${hash}`,
    `ultima_verificacao: ${isoNow()}`,
    '---',
  ].join('\n');

  const body = `\`\`\`${lang}\n${content}\n\`\`\``;

  writeFileSync(outPath, frontmatter + '\n\n' + body, 'utf8');
  return { rel, outRel };
}

// --- Main ---
const files = collectFiles();
let count = 0;
for (const f of files) {
  try {
    const { rel } = mirrorFile(f);
    count++;
  } catch (err) {
    console.error(`ERRO: ${relative(REPO_ROOT, f)} — ${err.message}`);
  }
}

console.log(`Total: ${files.length} files found`);
console.log(`Criados: ${count} mirror files`);
