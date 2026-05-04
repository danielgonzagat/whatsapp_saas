import { SKIP_ROOT_FILES, SKIP_PREFIXES, SKIP_EXTS, SOURCE_DIR_PREFIXES } from './constants.mjs';

export function isSourceFile(relPath) {
  if (SKIP_ROOT_FILES.has(relPath)) return false;
  for (const prefix of SKIP_PREFIXES) {
    if (relPath.startsWith(prefix)) return false;
  }
  const ext = relPath.includes('.') ? '.' + relPath.split('.').pop() : '';
  if (SKIP_EXTS.has(ext)) return false;
  if (
    relPath.includes('/node_modules/') ||
    relPath.includes('/dist/') ||
    relPath.includes('/build/') ||
    relPath.includes('/coverage/') ||
    relPath.includes('/.next/') ||
    relPath.includes('/__pycache__/')
  )
    return false;
  return SOURCE_DIR_PREFIXES.some((p) => relPath.startsWith(p));
}

export function isTestFile(relPath, machineKinds) {
  if (machineKinds && machineKinds.includes('test')) return true;
  return (
    relPath.endsWith('.spec.ts') ||
    relPath.endsWith('.spec.tsx') ||
    relPath.endsWith('.test.ts') ||
    relPath.endsWith('.test.tsx') ||
    relPath.endsWith('.spec.js') ||
    relPath.endsWith('.test.js') ||
    relPath.includes('/__tests__/')
  );
}
