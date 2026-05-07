#!/usr/bin/env node
import { Project, SyntaxKind } from 'ts-morph';

const project = new Project({
  tsConfigFilePath: 'backend/tsconfig.json',
  skipAddingFilesFromTsConfig: false,
});

const files = project.getSourceFiles().filter((f) => {
  const p = f.getFilePath();
  return (
    p.includes('backend/src') &&
    !p.includes('node_modules') &&
    !p.includes('.spec.') &&
    !p.includes('.test.') &&
    !p.includes('__tests__') &&
    !p.includes('.fixtures.')
  );
});

console.log(`Processing ${files.length} files...`);
let count = 0;

for (const sourceFile of files) {
  // Fix: catch (e) → catch (e: unknown)
  for (const clause of sourceFile.getDescendantsOfKind(SyntaxKind.CatchClause)) {
    const decl = clause.getVariableDeclaration();
    if (decl && !decl.getTypeNode()) {
      try {
        decl.setType('unknown');
        count++;
      } catch (e) {}
    }
  }
}

await project.save();
console.log(`Fixed ${count} catch blocks with unknown type`);
