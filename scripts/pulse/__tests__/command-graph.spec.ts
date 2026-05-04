import { describe, expect, it } from 'vitest';
import { buildPulseCommandGraph } from '../command-graph';

describe('buildPulseCommandGraph', () => {
  const graph = buildPulseCommandGraph(process.cwd());

  it('infers install, build, test, dev, and PULSE commands without package.json edits', () => {
    expect(graph.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          purpose: 'install',
          command: 'npm ci',
          sourcePath: 'package-lock.json',
        }),
        expect.objectContaining({
          purpose: 'build',
          command: 'npm run build',
          sourcePath: 'package.json',
          scriptName: 'build',
        }),
        expect.objectContaining({
          purpose: 'test',
          command: 'npm run test',
          sourcePath: 'package.json',
          scriptName: 'test',
        }),
        expect.objectContaining({
          purpose: 'dev',
          command: 'npm --prefix frontend run dev',
          sourcePath: 'frontend/package.json',
          scriptName: 'dev',
        }),
        expect.objectContaining({
          purpose: 'pulse',
          command: 'npm run pulse',
          sourcePath: 'package.json',
          scriptName: 'pulse',
        }),
      ]),
    );
  });

  it('catalogs env vars from static Docker/workflow sources without scanning dotenv files', () => {
    expect(graph.scannedSources.some((source) => source.includes('.env'))).toBe(false);
    expect(graph.environmentVariables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'NEXT_PUBLIC_API_URL',
          sourcePath: 'frontend/Dockerfile',
          sourceKind: 'dockerfile',
        }),
        expect.objectContaining({
          name: 'PORT',
          sourcePath: 'backend/Dockerfile',
          sourceKind: 'dockerfile',
        }),
      ]),
    );
  });

  it('keeps secret-looking variables as names only', () => {
    const secretVariables = graph.environmentVariables.filter((variable) => variable.secretLike);
    expect(secretVariables.length).toBeGreaterThan(0);
    for (const variable of secretVariables) {
      expect(variable.name).toMatch(/^[A-Z][A-Z0-9_]+$/);
      expect(variable).not.toHaveProperty('value');
    }
  });
});
