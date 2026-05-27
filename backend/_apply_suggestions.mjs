import { ESLint } from 'eslint';
import { readFileSync, writeFileSync } from 'fs';

const eslint = new ESLint({
  fix: false,
  overrideConfigFile: true,
});

const files = process.argv.slice(2);
const targetFiles = files.length > 0 ? files : ['src/**/*.ts'];

const results = await eslint.lintFiles(targetFiles);

let totalFixes = 0;
const fixedFiles = new Set();

for (const r of results) {
  let modified = false;
  let source = r.source || readFileSync(r.filePath, 'utf-8');

  // Sort suggestions by range descending so we can apply from end to start
  const allSuggestions = [];
  for (const m of r.messages) {
    if (m.suggestions) {
      for (const s of m.suggestions) {
        if (s.fix) {
          allSuggestions.push(s.fix);
        }
      }
    }
  }

  if (allSuggestions.length === 0) continue;

  // Sort by position descending
  allSuggestions.sort((a, b) => b.range[0] - a.range[0]);

  for (const fix of allSuggestions) {
    const before = source.substring(0, fix.range[0]);
    const after = source.substring(fix.range[1]);
    source = before + fix.text + after;
    totalFixes++;
    modified = true;
  }

  if (modified) {
    writeFileSync(r.filePath, source, 'utf-8');
    fixedFiles.add(r.filePath);
    console.log(`Fixed: ${r.filePath} (${allSuggestions.length} suggestions)`);
  }
}

console.log(`\nTotal suggestions applied: ${totalFixes} across ${fixedFiles.size} files`);
