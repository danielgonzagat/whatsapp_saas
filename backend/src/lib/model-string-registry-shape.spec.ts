import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

describe('ops/model-string-registry.json shape', () => {
  it('has a top-level allowedFiles array of strings', () => {
    const fp = resolvePath(__dirname, '../../../ops/model-string-registry.json');
    const raw = readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw) as { allowedFiles: unknown };
    expect(Array.isArray(parsed.allowedFiles)).toBe(true);
    const allowedFiles = parsed.allowedFiles as unknown[];
    for (const entry of allowedFiles) {
      expect(typeof entry).toBe('string');
    }
  });

  it('allowedFiles entries are unique', () => {
    const fp = resolvePath(__dirname, '../../../ops/model-string-registry.json');
    const raw = readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw) as { allowedFiles: string[] };
    const unique = new Set(parsed.allowedFiles);
    expect(unique.size).toBe(parsed.allowedFiles.length);
  });
});
