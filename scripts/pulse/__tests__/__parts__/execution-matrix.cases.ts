import { expect, it } from 'vitest';
import { buildMatrix } from './execution-matrix.helpers';
import { generatedAt } from './execution-matrix.fixtures';

it('adds uncovered structural nodes so parser-discovered code cannot escape scope', () => {
  const matrix = buildMatrix({
    structuralGraph: {
      generatedAt,
      summary: {
        totalNodes: 1,
        totalEdges: 0,
        roleCounts: {
          interface: 1,
          orchestration: 0,
          persistence: 0,
          side_effect: 0,
          simulation: 0,
        },
        interfaceChains: 0,
        completeChains: 0,
        partialChains: 0,
        simulatedChains: 0,
      },
      nodes: [
        {
          id: 'ui:uncovered',
          kind: 'ui_element',
          role: 'interface',
          truthMode: 'inferred',
          adapter: 'test',
          label: 'Uncovered button',
          file: 'frontend/uncovered.tsx',
          line: 1,
          userFacing: true,
          runtimeCritical: true,
          protectedByGovernance: false,
          metadata: {},
        },
      ],
      edges: [],
    },
  });
  expect(matrix.paths.some((path) => path.source === 'structural_node')).toBe(true);
  expect(matrix.paths.find((path) => path.source === 'structural_node')?.status).toBe(
    'inferred_only',
  );
});

it('adds uncovered scope files so repo inventory cannot escape matrix classification', () => {
  const matrix = buildMatrix({
    scopeState: {
      generatedAt,
      rootDir: '/repo',
      summary: {
        totalFiles: 1,
        totalLines: 10,
        runtimeCriticalFiles: 0,
        userFacingFiles: 0,
        humanRequiredFiles: 0,
        surfaceCounts: {
          frontend: 0,
          'frontend-admin': 0,
          backend: 0,
          worker: 0,
          prisma: 0,
          e2e: 0,
          scripts: 1,
          docs: 0,
          infra: 0,
          governance: 0,
          'root-config': 0,
          artifacts: 0,
          misc: 0,
        },
        kindCounts: {
          source: 1,
          spec: 0,
          migration: 0,
          config: 0,
          document: 0,
          artifact: 0,
        },
        unmappedModuleCandidates: [],
        inventoryCoverage: 100,
        classificationCoverage: 100,
        structuralGraphCoverage: 0,
        testCoverage: 0,
        scenarioCoverage: 0,
        runtimeEvidenceCoverage: 0,
        productionProofCoverage: 0,
        orphanFiles: [],
        unknownFiles: [],
      },
      parity: {
        status: 'pass',
        mode: 'repo_inventory_with_codacy_spotcheck',
        confidence: 'high',
        reason: 'test',
        inventoryFiles: 1,
        codacyObservedFiles: 0,
        codacyObservedFilesCovered: 0,
        missingCodacyFiles: [],
      },
      codacy: {
        snapshotAvailable: true,
        sourcePath: 'PULSE_CODACY_STATE.json',
        syncedAt: generatedAt,
        ageMinutes: 0,
        stale: false,
        loc: 10,
        totalIssues: 0,
        severityCounts: { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
        toolCounts: {},
        topFiles: [],
        highPriorityBatch: [],
        observedFiles: [],
      },
      files: [
        {
          path: 'scripts/pulse/new-parser.ts',
          extension: '.ts',
          lineCount: 10,
          surface: 'scripts',
          kind: 'source',
          runtimeCritical: false,
          userFacing: false,
          ownerLane: 'platform',
          executionMode: 'ai_safe',
          protectedByGovernance: false,
          codacyTracked: false,
          moduleCandidate: 'pulse',
          observedCodacyIssueCount: 0,
          highSeverityIssueCount: 0,
          highestObservedSeverity: null,
          structuralHints: ['orchestration'],
        },
      ],
      moduleAggregates: [],
      excludedFiles: [],
      scopeSource: 'repo_filesystem',
      manifestBoundary: false,
      manifestRole: 'semantic_overlay',
    },
  });
  expect(matrix.paths.some((path) => path.source === 'scope_file')).toBe(true);
  expect(matrix.paths.find((path) => path.source === 'scope_file')?.filePaths).toContain(
    'scripts/pulse/new-parser.ts',
  );
  expect(matrix.paths.find((path) => path.source === 'scope_file')?.status).toBe('not_executable');
  expect(matrix.paths.find((path) => path.source === 'scope_file')?.breakpoint?.reason).toContain(
    'inventory fallback',
  );
});
