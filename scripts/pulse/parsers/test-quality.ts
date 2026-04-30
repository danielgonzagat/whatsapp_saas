/**
 * PULSE Parser 77: Test Quality
 * Layer 11: Test Quality
 * Mode: DEEP (requires codebase scan of test files)
 *
 * CHECKS:
 * 1. Every .spec.ts / .test.ts file has at least one expect() assertion
 *    — files with only describe/it/test blocks but zero expect() are useless
 * 2. Test files with only `it.todo()` or `xit()` / `it.skip()` and no active tests
 * 3. Test files with mock pollution, brittle waiting, placeholder names, or nondeterminism
 * 4. Test files that use jest.mock() but never restore mocks (potential test pollution)
 * 5. Test files with hardcoded sleep/delays > 1000ms (slow, brittle tests)
 * 6. Test descriptions that are empty strings or generic placeholders ("test 1", "todo")
 * 7. Tests that assert on Math.random() or Date.now() directly (non-deterministic)
 *
 * REQUIRES: PULSE_DEEP=1, codebase read access
 */
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';
import { analyzeTestAssertionSemantics } from '../test-assertion-semantics';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';

function synthesizeTestQualityBreak(signal: PulseSignalEvidence): Break {
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const diagnostic = synthesizeDiagnostic(
    signalGraph,
    predicateGraph,
    calculateDynamicRisk({ predicateGraph }),
  );

  return {
    type: diagnostic.id,
    severity: 'medium',
    file: signal.location.file,
    line: signal.location.line,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface: 'test-quality',
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; predicates=${diagnostic.predicateKinds.join(',')}`,
  };
}

function buildTestQualityBreak(input: {
  detector: string;
  summary: string;
  detail: string;
  file: string;
  line?: number;
}): Break {
  return synthesizeTestQualityBreak({
    source: 'ast:test-assertion-semantics',
    detector: input.detector,
    truthMode: 'confirmed_static',
    summary: input.summary,
    detail: input.detail,
    location: {
      file: input.file,
      line: input.line ?? 0,
    },
  });
}

/** Check test quality. */
export function checkTestQuality(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const allDirs = [config.backendDir, config.frontendDir, config.workerDir];

  for (const dir of allDirs) {
    const testFiles = walkFiles(dir, ['.ts', '.tsx']).filter((f) =>
      /\.(spec|test)\.(ts|tsx)$/.test(f),
    );

    for (const file of testFiles) {
      let content: string;
      try {
        content = readTextFile(file, 'utf8');
      } catch {
        continue;
      }

      const relFile = path.relative(config.rootDir, file);
      const lines = content.split('\n');

      // CHECK 1: At least one semantic assertion
      const assertionSemantics = analyzeTestAssertionSemantics(content, relFile);
      if (!assertionSemantics.hasAssertions) {
        breaks.push(
          buildTestQualityBreak({
            detector: 'semantic-assertion-evidence',
            file: relFile,
            summary: 'Test file has no semantic assertion evidence from AST analysis',
            detail: `${relFile} has ${(content.match(/\bit\s*\(|test\s*\(/g) || []).length} test block(s), but PULSE did not find expect/assert/should/snapshot/custom assertion evidence.`,
          }),
        );
        continue; // No need to check further if no assertions at all
      }

      // CHECK 2: Files with only skipped tests
      const activeTestCount = (content.match(/\bit\s*\(|test\s*\(/g) || []).length;
      const skippedCount = (
        content.match(/\bit\.skip\s*\(|xit\s*\(|xtest\s*\(|it\.todo\s*\(/g) || []
      ).length;
      if (activeTestCount > 0 && activeTestCount === skippedCount) {
        breaks.push(
          buildTestQualityBreak({
            detector: 'active-test-evidence',
            file: relFile,
            summary: 'Test file contains skipped tests without active test evidence',
            detail: `${skippedCount} skipped test(s), 0 active tests in ${path.basename(file)}`,
          }),
        );
      }

      // CHECK 3: jest.mock() without afterEach restore
      if (
        /jest\.mock\s*\(/.test(content) &&
        !/afterEach|jest\.restoreAllMocks|jest\.clearAllMocks/i.test(content)
      ) {
        breaks.push(
          buildTestQualityBreak({
            detector: 'mock-restore-evidence',
            file: relFile,
            summary: 'Mock setup observed without restoration evidence',
            detail:
              'Add afterEach(() => jest.restoreAllMocks()) or jest.clearAllMocks() to prevent mock leakage',
          }),
        );
      }

      // CHECK 4: Hardcoded long sleeps in tests
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/setTimeout|sleep|delay/i.test(line)) {
          const match = line.match(/(\d{4,})/);
          if (match) {
            breaks.push(
              buildTestQualityBreak({
                detector: 'time-wait-evidence',
                file: relFile,
                line: i + 1,
                summary: `Hardcoded wait duration observed in test line`,
                detail: line.slice(0, 120),
              }),
            );
          }
        }
      }

      // CHECK 5: Empty or placeholder test descriptions
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const emptyDescMatch = line.match(/\bit\s*\(\s*['"]\s*['"]/);
        const todoDescMatch = line.match(
          /\bit\s*\(\s*['"](?:todo|test \d+|placeholder|xxx|fixme)['"]/i,
        );
        if (emptyDescMatch || todoDescMatch) {
          breaks.push(
            buildTestQualityBreak({
              detector: 'test-description-evidence',
              file: relFile,
              line: i + 1,
              summary: 'Test description lacks meaningful observed content',
              detail: line.trim().slice(0, 120),
            }),
          );
        }
      }

      // CHECK 6: Non-deterministic assertions on Math.random or Date.now
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/expect\s*\(\s*Math\.random|expect\s*\(\s*Date\.now/.test(line)) {
          breaks.push(
            buildTestQualityBreak({
              detector: 'nondeterministic-assertion-evidence',
              file: relFile,
              line: i + 1,
              summary: 'Test assertion reads nondeterministic runtime source directly',
              detail:
                'Mock these functions with jest.spyOn before testing; never assert on random/time values directly',
            }),
          );
        }
      }
    }
  }

  // TODO: Implement when infrastructure available
  // - Mutation testing score (stryker)
  // - Test execution time budget per suite
  // - Flaky test detection via repeated runs

  return breaks;
}
