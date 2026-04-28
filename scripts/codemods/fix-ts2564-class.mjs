#!/usr/bin/env node
/**
 * Fix TS2564: Add ! to class PROPERTY declarations that have decorators.
 * Only targets class-level properties (not object literals, not function params).
 */
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// Get all TS2564 errors
const out = execSync('cd backend && npx tsc --noEmit 2>&1', {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
}).toString();

// Parse: backend/src/file.ts(123,5): error TS2564: Property 'xyz' has no initializer
const fileProps = {};
for (const line of out.split('\n')) {
  const m = line.match(/^(.+?)\((\d+),\d+\): error TS2564: Property '(\w+)'/);
  if (m) {
    const [, file, _line, prop] = m;
    if (!fileProps[file]) fileProps[file] = new Set();
    fileProps[file].add(prop);
  }
}

console.log(`Files to fix: ${Object.keys(fileProps).length}`);

let fixed = 0;
for (const [file, props] of Object.entries(fileProps)) {
  let c = readFileSync(file, 'utf8');
  let changed = false;

  for (const prop of props) {
    // Only add ! if the property is a CLASS PROPERTY (indented, with colon and type)
    // Pattern: whitespace + propName + : + Type + ; (or optional ?)
    // Avoid: object literals (prop: value), function params (prop: type)

    // Strategy: find the line where the property is declared in a class context
    // Class properties have:
    // 1. Indentation (leading spaces)
    // 2. Optional decorator on line above
    // 3. propName: Type;  OR  propName?: Type;

    // Match:  spaces propName:  (not spaces propName: value — that's object literal)
    // The key difference: class props have TYPE after colon (e.g., "string", "number", DTO name)
    // Object literals have VALUE after colon (e.g., "dto.name", "new Date()")

    const re = new RegExp(`(\\s+)(${prop})\\s*:\\s*([A-Z][A-Za-z0-9<>\\[\\], |&]+)\\s*;`, 'g');

    const newC = c.replace(re, (match, ws, name, type) => {
      // Verify this is a class property (check previous line for decorator or class context)
      // For safety, DON'T add ! if the type is followed by = (already has initializer)
      if (match.includes('=')) return match;
      return `${ws}${name}!: ${type};`;
    });

    if (newC !== c) {
      c = newC;
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(file, c, 'utf8');
    console.log('Fixed:', file, '—', [...props].join(', '));
    fixed++;
  }
}

console.log(`\nFixed ${fixed} files`);
