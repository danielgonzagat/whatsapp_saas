/**
 * Part 2: Main consistency check function.
 */

import * as path from 'path';
import type { ArtifactDivergence, ConsistencyResult, LoadedArtifact } from '../../types';
import { deepGet, MAX_GENERATED_AT_DRIFT_MS } from '../../loaders';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/catalog-arithmetic';
import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel/token-evidence';
import {
  collectProofDebtSignals,
  firstExecutableUnit,
  getDirectiveUnitArray,
  getUnitProductFiles,
  isProductPrioritizedUnit,
  uniqueSources,
} from './part1_helpers';

export function checkConsistency(artifacts: LoadedArtifact[]): ConsistencyResult {
  if (artifacts.length === 0) {
    return { pass: true, divergences: [], missingArtifacts: [] };
  }

  const divergences: ArtifactDivergence[] = [];

  function gatherValues(
    fieldDotPath: string,
    aliasMap?: Record<string, string>,
  ): Array<{ filePath: string; value: unknown }> {
    return artifacts
      .map((a) => {
        let value = deepGet(a.data, fieldDotPath);
        if (value === undefined && aliasMap) {
          const alias = aliasMap[a.filePath] ?? aliasMap['*'];
          if (alias) value = deepGet(a.data, alias);
        }
        return { filePath: a.filePath, value };
      })
      .filter((x) => x.value !== undefined);
  }

  function addDivergenceIfNeeded(
    field: string,
    entries: Array<{ filePath: string; value: unknown }>,
  ): void {
    if (entries.length < deriveUnitValue() + deriveUnitValue()) return;
    const unique = new Set(entries.map((e) => JSON.stringify(e.value)));
    if (unique.size > deriveUnitValue()) {
      const values: Record<string, unknown> = {};
      for (const e of entries) values[e.filePath] = e.value;
      divergences.push({ field, values, sources: entries.map((e) => e.filePath) });
    }
  }

  const af = discoverAllObservedArtifactFilenames();
  const CERT_STATUS_ARTIFACTS = new Set([af.certificate, af.convergencePlan]);

  function gatherCertValues(fieldDotPath: string): Array<{ filePath: string; value: unknown }> {
    return artifacts
      .filter((a) => {
        for (const allowed of CERT_STATUS_ARTIFACTS) {
          if (
            a.filePath === allowed ||
            a.filePath.endsWith('/' + allowed) ||
            a.filePath.endsWith(allowed.replace('/', path.sep))
          )
            return true;
        }
        return false;
      })
      .map((a) => ({ filePath: a.filePath, value: deepGet(a.data, fieldDotPath) }))
      .filter((x) => x.value !== undefined);
  }

  addDivergenceIfNeeded('status', gatherCertValues('status'));
  addDivergenceIfNeeded('humanReplacementStatus', gatherCertValues('humanReplacementStatus'));
  addDivergenceIfNeeded('blockingTier', gatherCertValues('blockingTier'));

  const globalScalarFields = ['authorityMode', 'advisoryOnly', 'automationEligible', 'score'];
  for (const field of globalScalarFields) {
    addDivergenceIfNeeded(field, gatherValues(field));
  }

  {
    const entries: Array<{ filePath: string; value: unknown }> = [];
    for (const a of artifacts) {
      const rootVal = deepGet(a.data, 'productionAutonomyVerdict');
      const answerVal = deepGet(a.data, 'productionAutonomyAnswer');
      const verdictsVal = deepGet(a.data, 'verdicts.productionAutonomy');
      const val = rootVal ?? answerVal ?? verdictsVal;
      if (val !== undefined) entries.push({ filePath: a.filePath, value: val });
    }
    addDivergenceIfNeeded('productionAutonomyVerdict', entries);
  }

  {
    const entries: Array<{ filePath: string; value: unknown }> = [];
    for (const a of artifacts) {
      const rootVal = deepGet(a.data, 'zeroPromptProductionGuidanceVerdict');
      const answerVal = deepGet(a.data, 'zeroPromptProductionGuidanceAnswer');
      const verdictsVal = deepGet(a.data, 'verdicts.zeroPromptProductionGuidance');
      const val = rootVal ?? answerVal ?? verdictsVal;
      if (val !== undefined) entries.push({ filePath: a.filePath, value: val });
    }
    addDivergenceIfNeeded('zeroPromptProductionGuidanceVerdict', entries);
  }

  {
    const entries: Array<{ filePath: string; value: unknown }> = [];
    for (const a of artifacts) {
      const rootVal = deepGet(a.data, 'canDeclareComplete');
      const verdictsVal = deepGet(a.data, 'verdicts.canDeclareComplete');
      const val = rootVal ?? verdictsVal;
      if (val !== undefined) entries.push({ filePath: a.filePath, value: val });
    }
    addDivergenceIfNeeded('canDeclareComplete', entries);
  }

  addDivergenceIfNeeded('cycleProof.proven', gatherValues('cycleProof.proven'));
  addDivergenceIfNeeded('dynamicBlockingReasons', gatherValues('dynamicBlockingReasons'));
  addDivergenceIfNeeded('nextWork.queue', gatherValues('nextWork.queue'));

  {
    const cli = artifacts.find((artifact) =>
      artifact.filePath.endsWith(discoverAllObservedArtifactFilenames().cliDirective),
    );
    const proofDebtSignals = collectProofDebtSignals(artifacts);
    if (cli && proofDebtSignals.length > 0) {
      const prioritizedUnit = firstExecutableUnit(
        getDirectiveUnitArray(cli, 'nextExecutableUnits'),
      );
      if (prioritizedUnit && isProductPrioritizedUnit(prioritizedUnit)) {
        const sources = uniqueSources([cli.filePath, ...proofDebtSignals.map((s) => s.source)]);
        const values: Record<string, unknown> = {};
        for (const source of sources) {
          values[source] =
            source === cli.filePath
              ? {
                  authorityMode: deepGet(cli.data, 'authorityMode'),
                  canWorkNow: deepGet(cli.data, 'autonomyReadiness.canWorkNow'),
                  prioritizedUnitId: prioritizedUnit.id,
                  prioritizedUnitTitle: prioritizedUnit.title,
                  prioritizedUnitKind: prioritizedUnit.kind,
                  prioritizedUnitSource: prioritizedUnit.source,
                  productFiles: getUnitProductFiles(prioritizedUnit),
                  proofDebtSignals,
                }
              : proofDebtSignals.filter((s) => s.source === source);
        }
        divergences.push({ field: 'nextExecutableUnits.proofDebtDrift', values, sources });
      }
    }
  }

  const counterFields = [
    'codacyHighCount',
    'parityGapCount',
    'phantomCount',
    'missingAdaptersCount',
    'staleAdaptersCount',
    'invalidAdaptersCount',
  ];
  for (const field of counterFields) {
    addDivergenceIfNeeded(field, gatherValues(field));
  }

  function addTimestampDivergenceIfNeeded(field: string): void {
    const entries = gatherValues(field).filter((e) => typeof e.value === 'string') as Array<{
      filePath: string;
      value: string;
    }>;
    const two = deriveUnitValue() + deriveUnitValue();
    if (entries.length >= two) {
      const timestamps = entries.map((e) => new Date(e.value).getTime()).filter((t) => !isNaN(t));
      if (timestamps.length >= two) {
        const minTs = Math.min(...timestamps);
        const maxTs = Math.max(...timestamps);
        if (maxTs - minTs > MAX_GENERATED_AT_DRIFT_MS) {
          const values: Record<string, unknown> = {};
          for (const e of entries) values[e.filePath] = e.value;
          divergences.push({ field, values, sources: entries.map((e) => e.filePath) });
        }
      }
    }
  }

  addTimestampDivergenceIfNeeded('generatedAt');
  addTimestampDivergenceIfNeeded('timestamp');

  {
    const activeEntries = artifacts
      .filter((a) => {
        const preserved = deepGet(a.data, 'preservedFromPreviousRun');
        const hasOriginalRunId = deepGet(a.data, 'originalRunId') !== undefined;
        return preserved !== true && !hasOriginalRunId;
      })
      .map((a) => ({ filePath: a.filePath, value: deepGet(a.data, 'runId') }))
      .filter((e) => typeof e.value === 'string');

    if (activeEntries.length >= deriveUnitValue() + deriveUnitValue()) {
      const uniqueRunIds = new Set(activeEntries.map((e) => e.value));
      if (uniqueRunIds.size > deriveUnitValue()) {
        const values: Record<string, unknown> = {};
        for (const e of activeEntries) values[e.filePath] = e.value;
        divergences.push({ field: 'runId', values, sources: activeEntries.map((e) => e.filePath) });
      }
    }
  }

  return { pass: divergences.length === deriveZeroValue(), divergences, missingArtifacts: [] };
}
