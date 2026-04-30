import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PULSE_COMMAND_GRAPH_ARTIFACT,
  buildPulseCommandGraphArtifact,
  writePulseCommandGraphArtifact,
} from '../command-graph-artifact';

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

describe('command graph artifact writer', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-command-graph-'));
    writeJson(path.join(rootDir, 'package.json'), {
      scripts: {
        build: 'vite build',
        test: 'vitest run',
        lint: 'eslint .',
        pulse: 'node scripts/pulse/run.js --guidance',
        dev: 'vite dev',
      },
    });
    fs.writeFileSync(path.join(rootDir, 'package-lock.json'), '{}\n', 'utf8');
    fs.writeFileSync(
      path.join(rootDir, 'Dockerfile'),
      'ARG API_TOKEN\nRUN DATABASE_URL=${DATABASE_URL:-postgres://secret@localhost/db} npm run test\n',
      'utf8',
    );
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('builds a canonical artifact from repo files without fixed product domains', () => {
    const artifact = buildPulseCommandGraphArtifact(rootDir);

    expect(artifact.artifactName).toBe(PULSE_COMMAND_GRAPH_ARTIFACT);
    expect(artifact.artifactPath).toBe('.pulse/current/PULSE_COMMAND_GRAPH.json');
    expect(artifact.commands).toEqual(
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
          purpose: 'pulse',
          command: 'npm run pulse',
          sourcePath: 'package.json',
          scriptName: 'pulse',
        }),
      ]),
    );
    expect(artifact.proofExecutionCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ purpose: 'install', command: 'npm ci' }),
        expect.objectContaining({ purpose: 'build' }),
        expect.objectContaining({ purpose: 'test' }),
        expect.objectContaining({ purpose: 'lint' }),
        expect.objectContaining({ purpose: 'pulse' }),
      ]),
    );
    expect(artifact.proofExecutionCommands).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ purpose: 'dev' })]),
    );
    expect(artifact.summary.proofExecutionCommandCount).toBe(
      artifact.proofExecutionCommands.length,
    );
  });

  it('writes .pulse/current/PULSE_COMMAND_GRAPH.json with env names only', () => {
    const artifact = writePulseCommandGraphArtifact(rootDir);
    const artifactPath = path.join(rootDir, '.pulse', 'current', PULSE_COMMAND_GRAPH_ARTIFACT);
    const saved = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as typeof artifact;
    const serialized = JSON.stringify(saved);

    expect(saved).toEqual(artifact);
    expect(saved.redaction).toEqual({
      envValues: 'redacted',
      environmentVariables: 'names-only',
    });
    expect(saved.environmentVariables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'API_TOKEN',
          sourcePath: 'Dockerfile',
          required: true,
          secretLike: true,
        }),
        expect.objectContaining({
          name: 'DATABASE_URL',
          sourcePath: 'Dockerfile',
        }),
      ]),
    );
    expect(serialized).toContain('DATABASE_URL=<redacted> npm run test');
    expect(serialized).not.toContain('postgres://secret@localhost/db');
  });

  it('is attached to the canonical PULSE full-scan orchestration surface', () => {
    const daemonSource = fs.readFileSync(
      path.join(process.cwd(), 'scripts', 'pulse', 'daemon.ts'),
      'utf8',
    );

    expect(daemonSource).toContain('import { writePulseCommandGraphArtifact }');
    expect(daemonSource).toContain("safeRun('command-graph'");
    expect(daemonSource).toContain('writePulseCommandGraphArtifact(config.rootDir)');
  });
});
