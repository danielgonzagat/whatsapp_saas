import { extname, dirname, basename } from 'node:path';
import { isTestFile } from './classification.mjs';

export function buildTestSet(manifestFiles) {
  const testSet = new Set();
  for (const [relMirror, entry] of Object.entries(manifestFiles)) {
    const source = entry.source;
    if (!source) continue;
    if (isTestFile(source, entry.machine_kinds)) {
      testSet.add(source);
      const base = source.replace(/\.(spec|test)\.[cm]?[jt]sx?$/, '').replace(/\/__tests__\//, '/');
      testSet.add(base);
    }
  }
  return testSet;
}

export function hasTest(relPath, testSet, manifestFiles) {
  if (testSet.has(relPath)) return true;
  const ext = extname(relPath);
  const withoutExt = ext ? relPath.slice(0, -ext.length) : relPath;
  const candidates = [
    `${withoutExt}.spec${ext}`,
    `${withoutExt}.test${ext}`,
    `${dirname(relPath)}/__tests__/${basename(withoutExt)}.spec${ext}`,
    `${dirname(relPath)}/__tests__/${basename(withoutExt)}.test${ext}`,
  ];
  for (const c of candidates) {
    const mirrorRel = c.replace(/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/, '.md');
    if (manifestFiles[mirrorRel]) return true;
  }
  const stem = basename(withoutExt).replace(
    /\.(controller|service|module|dto|route|page|component)$/i,
    '',
  );
  return [...testSet].some((testSource) => testSource.includes(stem) && stem.length > 3);
}
