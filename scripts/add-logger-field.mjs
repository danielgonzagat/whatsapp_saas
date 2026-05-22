import { readFileSync, writeFileSync } from 'fs';

const FILES = readFileSync('/tmp/without_logger.txt', 'utf-8')
  .trim()
  .split('\n')
  .filter(Boolean);

let added = 0;
let skipped = 0;

for (const file of FILES) {
  let content = readFileSync(file, 'utf-8');

  // Find the class name
  const classMatch = content.match(/export\s+class\s+(\w+Service)\s/);
  if (!classMatch) {
    console.log(`SKIP (no class): ${file}`);
    skipped++;
    continue;
  }
  const className = classMatch[1];

  // Check if already has logger (double check)
  if (/private readonly logger/.test(content)) {
    console.log(`SKIP (already has): ${file}`);
    skipped++;
    continue;
  }

  // See if there is an @nestjs/common import
  const nestImportRegex = /import\s*\{([^}]*)\}\s*from\s*'@nestjs\/common'/;
  const nestMatch = content.match(nestImportRegex);

  if (nestMatch) {
    // Add Logger to existing @nestjs/common import
    const existingImports = nestMatch[1];
    if (!existingImports.includes('Logger')) {
      const newImports = existingImports.trim().endsWith(',')
        ? `${existingImports} Logger,`
        : existingImports.trim()
          ? `${existingImports}, Logger`
          : 'Logger';
      content = content.replace(nestImportRegex, `import {${newImports} } from '@nestjs/common'`);
    }
  } else {
    // Add new import after @Injectable() import line, or at top of file
    const injectableImportIdx = content.indexOf("from '@nestjs/common'");
    if (injectableImportIdx > 0) {
      const lineEnd = content.indexOf('\n', injectableImportIdx);
      content = content.slice(0, lineEnd + 1) + `import { Logger } from '@nestjs/common';\n` + content.slice(lineEnd + 1);
    } else {
      // Add at top
      content = `import { Logger } from '@nestjs/common';\n` + content;
    }
  }

  // Add the logger field right after the first field in the class
  // Find the class opening brace
  const classStartRegex = new RegExp(`export\\s+class\\s+${className}\\s*\\{[^}]*?(private|public|protected|constructor|\\n\\s*\\n)`);
  const classOpen = content.indexOf(`export class ${className} {`);
  const classOpenExt = content.indexOf(`export class ${className} extends`);
  
  let classBodyStart = -1;
  if (classOpen !== -1) {
    classBodyStart = content.indexOf('{', classOpen) + 1;
  } else if (classOpenExt !== -1) {
    classBodyStart = content.indexOf('{', classOpenExt) + 1;
  }

  if (classBodyStart === -1 || classBodyStart === 0) {
    console.log(`SKIP (no class body): ${file}`);
    skipped++;
    continue;
  }

  // Find the next non-empty, non-comment line after class opening brace
  // We insert after the opening brace line
  const loggerLine = `\n  private readonly logger = new Logger(${className}.name);\n`;
  content = content.slice(0, classBodyStart) + loggerLine + content.slice(classBodyStart);

  writeFileSync(file, content);
  console.log(`ADDED: ${file} -> ${className}`);
  added++;
}

console.log(`\nDone. Added: ${added}, Skipped: ${skipped}`);
