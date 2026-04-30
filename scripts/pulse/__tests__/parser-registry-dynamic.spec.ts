import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { discoverParserContracts, loadParserInventory } from '../parser-registry';
import { loadPluginRegistry } from '../plugin-system';
import type { PulseConfig } from '../types';

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-parser-registry-'));
}

function write(rootDir: string, relativePath: string, content: string): void {
  const target = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function makeConfig(rootDir: string): PulseConfig {
  return {
    rootDir,
    backendDir: path.join(rootDir, 'backend', 'src'),
    frontendDir: path.join(rootDir, 'frontend', 'src'),
    workerDir: path.join(rootDir, 'worker'),
    schemaPath: path.join(rootDir, 'backend', 'prisma', 'schema.prisma'),
    globalPrefix: '',
  };
}

describe('dynamic parser registry contracts', () => {
  it('prefers declared parser metadata over check-name conventions and records operational evidence shape', () => {
    const rootDir = makeRoot();
    write(
      rootDir,
      'scripts/pulse/parsers/opaque-checker.ts',
      [
        'export const parserMetadata = {',
        "  pluginId: 'opaque-parser',",
        "  parserExport: 'runOpaqueEvidence',",
        "  inputs: ['pulse-config', 'filesystem'],",
        "  outputs: ['breaks', 'parser-inventory'],",
        "  evidenceKind: 'static-contract',",
        '  confidence: 0.93,',
        '};',
        'export function checkLegacyOpaque(config: unknown) { return []; }',
        'export function runOpaqueEvidence(config: unknown) { return []; }',
      ].join('\n'),
    );

    const [contract] = discoverParserContracts(rootDir) as Array<
      ReturnType<typeof discoverParserContracts>[number] & {
        confidence: number | null;
        declaredExport: string | null;
        discoveryAuthority: string;
        evidenceKind: string | null;
        inputs: string[];
        legacyCompatibility: boolean;
        outputs: string[];
        pluginId: string | null;
      }
    >;

    expect(contract).toEqual(
      expect.objectContaining({
        name: 'opaque-checker',
        kind: 'active_parser',
        parserExports: ['runOpaqueEvidence'],
        declaredExport: 'parserMetadata',
        discoveryAuthority: 'declared_metadata',
        legacyCompatibility: false,
        pluginId: 'opaque-parser',
        inputs: ['pulse-config', 'filesystem'],
        outputs: ['breaks', 'parser-inventory'],
        evidenceKind: 'static-contract',
        confidence: 0.93,
        proof: expect.stringContaining('declared parser metadata'),
      }),
    );
    expect(contract.proof).not.toContain('checkLegacyOpaque');
  });

  it('loads parser object exports with declared fn instead of relying on check prefixes', () => {
    const rootDir = makeRoot();
    write(
      rootDir,
      'scripts/pulse/parsers/object-parser.ts',
      [
        'function runObjectParser(config: unknown) { return []; }',
        'export const objectParser = {',
        "  kind: 'parser',",
        '  fn: runObjectParser,',
        "  inputs: ['pulse-config'],",
        "  outputs: ['breaks'],",
        "  evidenceKind: 'runtime-plugin',",
        '  confidence: 0.82,',
        '};',
      ].join('\n'),
    );

    const inventory = loadParserInventory(makeConfig(rootDir));
    const [contract] = inventory.contracts as Array<
      ReturnType<typeof discoverParserContracts>[number] & {
        discoveryAuthority: string;
        evidenceKind: string | null;
        inputs: string[];
        outputs: string[];
      }
    >;

    expect(contract).toEqual(
      expect.objectContaining({
        parserExports: ['objectParser'],
        discoveryAuthority: 'declared_export',
        inputs: ['pulse-config'],
        outputs: ['breaks'],
        evidenceKind: 'runtime-plugin',
      }),
    );
    expect(inventory.discoveredChecks).toEqual(['object-parser']);
    expect(inventory.loadedChecks).toHaveLength(1);
    expect(
      inventory.loadedChecks[0] as (typeof inventory.loadedChecks)[number] & {
        confidence: number | null;
        evidenceKind: string | null;
        inputs: string[];
        outputs: string[];
      },
    ).toEqual(
      expect.objectContaining({
        name: 'object-parser',
        file: 'scripts/pulse/parsers/object-parser.ts',
        inputs: ['pulse-config'],
        outputs: ['breaks'],
        evidenceKind: 'runtime-plugin',
        confidence: 0.82,
      }),
    );
  });

  it('classifies executable parsers by exported check contract and helpers by absence of that contract', () => {
    const rootDir = makeRoot();
    write(
      rootDir,
      'scripts/pulse/parsers/opaque-checker.ts',
      'export function checkOpaque(config: unknown) { return []; }',
    );
    write(
      rootDir,
      'scripts/pulse/parsers/structural-evidence.ts',
      'export function parsePrismaModels(schema: string) { return []; }',
    );

    const contracts = discoverParserContracts(rootDir);

    expect(contracts).toContainEqual(
      expect.objectContaining({
        name: 'opaque-checker',
        kind: 'active_parser',
        parserExports: ['checkOpaque'],
        discoveryAuthority: 'legacy_weak_check_export',
        legacyCompatibility: true,
        confidence: 0.35,
      }),
    );
    expect(contracts).toContainEqual(
      expect.objectContaining({
        name: 'structural-evidence',
        kind: 'helper',
        parserExports: [],
      }),
    );
  });

  it('does not load helper modules as active parsers or report them unavailable', () => {
    const rootDir = makeRoot();
    write(
      rootDir,
      'scripts/pulse/parsers/helper-runtime.ts',
      'export function buildRuntimeEvidence() { return { ok: true }; }',
    );

    const inventory = loadParserInventory(makeConfig(rootDir));

    expect(inventory.discoveredChecks).toEqual([]);
    expect(inventory.loadedChecks).toEqual([]);
    expect(inventory.unavailableChecks).toEqual([]);
    expect(inventory.helperFilesSkipped).toEqual(['helper-runtime']);
    expect(inventory.generatedAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    expect(inventory.contracts).toContainEqual(
      expect.objectContaining({
        name: 'helper-runtime',
        kind: 'helper',
        proof: expect.stringContaining('helper module'),
      }),
    );
  });

  it('publishes plugin discovery health and freshness proof even when no plugins exist', () => {
    const rootDir = makeRoot();

    const registry = loadPluginRegistry(rootDir);
    const artifactPath = path.join(rootDir, '.pulse', 'current', 'PULSE_PLUGIN_REGISTRY.json');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as typeof registry;

    expect(registry.health).toEqual(
      expect.objectContaining({
        status: 'missing',
        freshnessMinutes: 0,
        proof: expect.stringContaining('No plugin entrypoints found'),
      }),
    );
    expect(artifact.health).toEqual(registry.health);
  });
});
