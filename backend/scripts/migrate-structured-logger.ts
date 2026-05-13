import { readFileSync, writeFileSync, existsSync } from 'fs';
import { globSync } from 'glob';
import { resolve, dirname, relative, join } from 'path';

const backendRoot = resolve(__dirname, '..');

const criticalDomains = [
  'src/checkout/',
  'src/billing/',
  'src/kloel/',
  'src/brain/',
  'src/autopilot/',
  'src/wallet/',
  'src/payments/',
  'src/whatsapp/',
  'src/auth/',
];

function allServiceFiles(): string[] {
  const files: string[] = [];
  for (const domain of criticalDomains) {
    const pattern = join(domain, '**', '*.ts');
    const found = globSync(pattern, { cwd: backendRoot, absolute: true });
    for (const f of found) {
      if (f.includes('.spec.') || f.includes('.fixtures.') || f.includes('.dto.')) continue;
      if (!f.endsWith('.service.ts') && !f.endsWith('.processor.ts') && !f.endsWith('.helpers.ts') && !f.endsWith('.engine.ts')) continue;
      files.push(f);
    }
  }
  return [...new Set(files)];
}

function needsMigration(file: string): boolean {
  const content = readFileSync(file, 'utf8');
  if (content.includes('StructuredLogger')) return false;
  if (content.includes("from '../logging/structured-logger'")) return false;
  if (content.includes("from './logging/structured-logger'")) return false;
  if (content.includes("from '../../logging/structured-logger'")) return false;
  if (content.includes("from '../../../logging/structured-logger'")) return false;
  if (content.includes("from '../../../../logging/structured-logger'")) return false;
  return content.includes("import {") && content.includes('Logger') && content.includes("@nestjs/common");
}

function computeRelativePath(file: string): string {
  const fileDir = dirname(file);
  const rel = relative(fileDir, join(backendRoot, 'src', 'logging', 'structured-logger'));
  return rel.startsWith('.') ? rel : './' + rel;
}

function migrateFile(file: string): boolean {
  let content = readFileSync(file, 'utf8');

  // Already has StructuredLogger?
  if (content.includes('StructuredLogger')) return false;

  // Find the line that imports Logger from @nestjs/common
  // Pattern: import { ..., Logger, ... } from '@nestjs/common';
  const lines = content.split('\n');
  let modified = false;
  const importPath = computeRelativePath(file);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^import\s*\{[^}]*Logger[^}]*\}\s*from\s*['"]@nestjs\/common['"];?\s*$/.test(line)) {
      // Remove Logger from the import list
      const newLine = line
        .replace(/(,\s*)?Logger(,\s*)?/g, (match) => {
          // If Logger was the only import
          const withoutLogger = line.replace(/Logger\s*,?\s*/g, '').replace(/{\s*,/, '{').replace(/,\s*}/, '}');
          // Check if any other imports remain
          const hasOther = /\{([^}]+)\}/.exec(withoutLogger);
          if (hasOther && hasOther[1].trim()) {
            return '';
          }
          return '';
        })
        .replace(/{\s*,/, '{')
        .replace(/,\s*}/, '}');

      // If no imports left, remove the whole line
      const finalLine = line.replace(/Logger\s*,?\s*/g, '')
        .replace(/{\s*,/, '{')
        .replace(/,\s*}/, '}')
        .replace(/import\s*\{\s*\}\s*from\s*['"]@nestjs\/common['"];?\s*/, '');

      if (finalLine.trim() === '') {
        lines[i] = '';
      } else if (finalLine !== line) {
        lines[i] = finalLine;
      }
      modified = true;
    }
  }

  // Replace `new Logger(ClassName.name)` with `StructuredLogger.from(ClassName.name)`
  if (content.includes('new Logger(')) {
    content = lines.join('\n');
    content = content.replace(
      /new Logger\((\w+)\.name\)/g,
      'StructuredLogger.from($1.name)',
    );
    content = content.replace(
      /new Logger\('([^']+)'\)/g,
      "StructuredLogger.from('$1')",
    );
    content = content.replace(
      /const (\w+Logger) = new Logger\('([^']+)'\)/g,
      "const $1 = StructuredLogger.from('$2')",
    );
    modified = true;
  }

  if (!modified) return false;

  // Add StructuredLogger import after @nestjs/* imports
  const finalLines = content.split('\n');
  let insertIdx = 0;
  let foundNestImport = false;
  for (let i = 0; i < finalLines.length; i++) {
    if (finalLines[i].includes('@nestjs/')) {
      insertIdx = i + 1;
      foundNestImport = true;
    } else if (foundNestImport && finalLines[i].startsWith('import ')) {
      insertIdx = i;
      break;
    }
  }
  if (!foundNestImport) insertIdx = 0;

  finalLines.splice(
    insertIdx,
    0,
    `import { StructuredLogger } from '${importPath.replace(/\.ts$/, '')}';`,
  );

  // Clean up empty lines
  content = finalLines.filter(l => l !== '' || true).join('\n');
  // Remove double blank lines
  content = content.replace(/\n{3,}/g, '\n\n');

  writeFileSync(file, content);
  return true;
}

const files = allServiceFiles();
console.log(`Found ${files.length} candidate files in critical domains.\n`);

let migrated = 0;
let skipped = 0;

for (const file of files) {
  if (!existsSync(file)) continue;
  if (needsMigration(file)) {
    if (migrateFile(file)) {
      migrated++;
      if (migrated <= 60) console.log(`  OK  ${relative(backendRoot, file)}`);
    } else {
      skipped++;
    }
  }
}

console.log(`\nMigrated: ${migrated}, Skipped: ${skipped}`);
