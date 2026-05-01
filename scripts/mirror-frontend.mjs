import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SRC = '/Users/danielpenin/whatsapp_saas/frontend/src';
const MIRROR = '/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo/Frontend';

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function collectSourceFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    if (e.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else {
      const ext = path.extname(e.name);
      if (['.ts', '.tsx', '.js', '.jsx', '.css', '.scss'].includes(ext)) {
        files.push(full);
      }
    }
  }
  return files;
}

function mirrorPath(sourceFile) {
  const rel = path.relative(SRC, sourceFile);
  const parts = rel.split(path.sep);
  // Replace file extension with .ts.md or similar
  const base = parts.pop();
  const mdName = base + '.md';
  return path.join(MIRROR, 'source-mirrors', ...parts, mdName);
}

function createMirror(sourceFile) {
  const content = fs.readFileSync(sourceFile, 'utf-8');
  const hash = sha256(content);
  const relPath = sourceFile.replace(SRC, 'frontend/src');

  const frontmatter = `---
tipo: espelho
status: SINCRONIZADO
source: ${relPath}
source_hash: ${hash}
---

\`\`\`${path.extname(sourceFile).replace('.', '')}
${content}
\`\`\`
`;

  const dest = mirrorPath(sourceFile);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, frontmatter);
  return dest;
}

function main() {
  const allSourceFiles = collectSourceFiles(SRC);
  console.log(`Total source files found: ${allSourceFiles.length}`);

  let created = 0;
  let skipped = 0;

  for (const sf of allSourceFiles) {
    const dest = mirrorPath(sf);
    if (fs.existsSync(dest)) {
      skipped++;
    } else {
      try {
        createMirror(sf);
        created++;
      } catch (err) {
        console.error(`Error mirroring ${sf}: ${err.message}`);
      }
    }
  }

  console.log(`\nCreated: ${created}`);
  console.log(`Skipped (already exist): ${skipped}`);
  console.log(`Total source files: ${allSourceFiles.length}`);
}

main();
