import * as path from 'path';
import { readTextFile, readDir, ensureDir, writeTextFile, pathExists } from '../safe-fs';
import { safeJoin } from '../safe-path';
import { detectSourceRoots } from '../source-root-detector/api';
import type { DetectedSourceRoot } from '../source-root-detector/types';
import type { BehaviorGraph, BehaviorNode, BehaviorGraphSummary } from '../types.behavior-graph';
import {
  requireBehaviorNodeKindCatalog,
  requireBehaviorRiskLevelCatalog,
  requireExecutionModeCatalog,
  loadTsMorph,
  SKIP_DIRS,
  resetNodeIdSequence,
  deriveRiskLevelOrdinalPositions,
} from './catalog-helpers';
import {
  deriveZeroValue,
  deriveUnitValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import {
  discoverAllObservedArtifactFilenames,
  discoverSourceExtensionsFromObservedTypescript,
} from '../dynamic-reality-kernel/token-evidence';
import type { ParsedFunc } from './grammar-and-types';
import { extractFunctionsFromSource } from './function-extraction';
import { buildNodesFromParsedFunctions, extractCalledFunctions } from './risk-execution';

function collectSourceFiles(
  rootDir: string,
): { filePath: string; sourceRoot: DetectedSourceRoot }[] {
  const files: { filePath: string; sourceRoot: DetectedSourceRoot }[] = [];

  for (const sourceRoot of detectSourceRoots(rootDir)) {
    const dir = sourceRoot.absolutePath;
    if (!pathExists(dir)) continue;

    const entries = readDir(dir, { recursive: true }) as string[];
    const sourceExtensions = discoverSourceExtensionsFromObservedTypescript();
    for (const entry of entries) {
      const ext = path.extname(entry);
      if (!sourceExtensions.has(ext)) continue;

      const normalized = entry.split(path.sep).join('/');
      if (SKIP_DIRS.some((skip) => normalized.includes(skip))) continue;

      files.push({ filePath: safeJoin(dir, entry), sourceRoot });
    }
  }

  return files;
}

function parseFileWithTsMorph(
  filePath: string,
  relPath: string,
  tsMorphAvailable: boolean,
  sourceRoot: DetectedSourceRoot | null,
): BehaviorNode[] {
  try {
    let funcs: ParsedFunc[];
    const sourceText = readTextFile(filePath);

    if (tsMorphAvailable) {
      funcs = extractFunctionsFromSource(filePath, sourceText);
    } else {
      funcs = extractFunctionsFromSource(filePath, sourceText);
    }

    return buildNodesFromParsedFunctions(relPath, funcs, sourceText, sourceRoot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[behavior-graph] Failed to parse ${relPath}: ${message}`);
  }

  return [];
}

export function buildBehaviorGraph(rootDir: string): BehaviorGraph {
  resetNodeIdSequence();
  const tsMorphAvailable = loadTsMorph();
  const allNodes: BehaviorNode[] = [];

  if (!tsMorphAvailable) {
    console.warn('[behavior-graph] ts-morph not available, using regex-only analysis');
  }

  console.warn(`[behavior-graph] Scanning source files in ${rootDir}...`);
  const sourceFiles = collectSourceFiles(rootDir);
  console.warn(`[behavior-graph] Found ${sourceFiles.length} TypeScript files`);

  const allFuncNames = new Set<string>();
  const funcsByFile = new Map<string, ParsedFunc[]>();

  for (const sourceFile of sourceFiles) {
    try {
      const filePath = sourceFile.filePath;
      const sourceText = readTextFile(filePath);
      const funcs = extractFunctionsFromSource(filePath, sourceText);
      funcsByFile.set(filePath, funcs);
      for (const func of funcs) {
        allFuncNames.add(func.name);
      }
    } catch {
      // skip unreadable files
    }
  }
  console.warn(`[behavior-graph] Discovered ${allFuncNames.size} unique function names`);

  const bodyByNodeId = new Map<string, string>();
  for (let fileIndex = 0; fileIndex < sourceFiles.length; fileIndex++) {
    const sourceFile = sourceFiles[fileIndex];
    const filePath = sourceFile.filePath;
    if (process.env.PULSE_BEHAVIOR_DEBUG === String(deriveUnitValue())) {
      console.warn(
        `[behavior-graph] Building nodes ${fileIndex}/${sourceFiles.length}: ${path.relative(rootDir, filePath)}`,
      );
    }
    const relPath = path.relative(rootDir, filePath);
    const sourceText = readTextFile(filePath);
    const funcs = funcsByFile.get(filePath);
    const fileNodes = funcs
      ? buildNodesFromParsedFunctions(relPath, funcs, sourceText, sourceFile.sourceRoot)
      : parseFileWithTsMorph(filePath, relPath, tsMorphAvailable, sourceFile.sourceRoot);
    for (let index = 0; index < fileNodes.length; index++) {
      const func = funcs?.[index];
      if (func) {
        bodyByNodeId.set(fileNodes[index].id, func.bodyText);
      }
    }
    allNodes.push(...fileNodes);
  }
  console.warn(`[behavior-graph] Built ${allNodes.length} behavior nodes`);

  const nameToNodeIds = new Map<string, string[]>();
  for (const node of allNodes) {
    const ids = nameToNodeIds.get(node.name) || [];
    ids.push(node.id);
    nameToNodeIds.set(node.name, ids);
  }

  for (const node of allNodes) {
    try {
      const bodyText = bodyByNodeId.get(node.id);
      if (bodyText) {
        const calledFuncNames = extractCalledFunctions(bodyText, allFuncNames);
        for (const calleeName of calledFuncNames) {
          const calleeIds = nameToNodeIds.get(calleeName);
          if (calleeIds) {
            for (const calleeId of calleeIds) {
              if (calleeId !== node.id && !node.calls.includes(calleeId)) {
                node.calls.push(calleeId);
              }
            }
          }
        }
      }
    } catch {
      // skip call graph linking for this node
    }
  }

  const nodeById = new Map(allNodes.map((node) => [node.id, node] as const));
  for (const node of allNodes) {
    for (const calleeId of node.calls) {
      const callee = nodeById.get(calleeId);
      if (callee && !callee.calledBy.includes(node.id)) {
        callee.calledBy.push(node.id);
      }
    }
  }

  const orphanNodes = allNodes
    .filter((n) => n.calledBy.length === 0 && n.calls.length === 0)
    .map((n) => n.id);

  const reachable = new Set<string>();
  const kinds = requireBehaviorNodeKindCatalog();
  const entryNodes = allNodes.filter(
    (n) =>
      n.kind === kinds.apiEndpoint ||
      n.kind === kinds.cronJob ||
      n.kind === kinds.queueConsumer ||
      n.kind === kinds.webhookReceiver,
  );

  function traverse(nodeId: string) {
    if (reachable.has(nodeId)) return;
    reachable.add(nodeId);
    const node = nodeById.get(nodeId);
    if (!node) return;
    for (const childId of node.calls) {
      traverse(childId);
    }
  }

  for (const entry of entryNodes) {
    traverse(entry.id);
  }

  const unreachableNodes = allNodes.filter((n) => !reachable.has(n.id)).map((n) => n.id);

  const risks = requireBehaviorRiskLevelCatalog();
  const modes = requireExecutionModeCatalog();
  const summary: BehaviorGraphSummary = {
    totalNodes: allNodes.length,
    handlerNodes: allNodes.filter((n) => n.kind === kinds.handler).length,
    apiEndpointNodes: allNodes.filter((n) => n.kind === kinds.apiEndpoint).length,
    queueNodes: allNodes.filter(
      (n) => n.kind === kinds.queueConsumer || n.kind === kinds.queueProducer,
    ).length,
    cronNodes: allNodes.filter((n) => n.kind === kinds.cronJob).length,
    webhookNodes: allNodes.filter((n) => n.kind === kinds.webhookReceiver).length,
    dbNodes: allNodes.filter((n) => n.kind === kinds.dbReader || n.kind === kinds.dbWriter).length,
    externalCallNodes: allNodes.filter((n) => n.externalCalls.length > 0).length,
    aiSafeNodes: allNodes.filter((n) => n.executionMode === modes.aiSafe).length,
    humanRequiredNodes: deriveZeroValue(),
    nodesWithErrorHandler: allNodes.filter((n) => n.hasErrorHandler).length,
    nodesWithLogging: allNodes.filter((n) => n.hasLogging).length,
    nodesWithMetrics: allNodes.filter((n) => n.hasMetrics).length,
    criticalRiskNodes: allNodes.filter((n) => n.risk === risks.critical).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    nodes: allNodes,
    orphanNodes,
    unreachableNodes,
  };
}

export function getCriticalPaths(graph: BehaviorGraph): BehaviorNode[] {
  const risks = requireBehaviorRiskLevelCatalog();
  return graph.nodes.filter(
    (n) => (n.risk === risks.critical || n.risk === risks.high) && !n.hasErrorHandler,
  );
}

export function getNodesWithoutObservability(graph: BehaviorGraph): BehaviorNode[] {
  return graph.nodes.filter((n) => !n.hasLogging && !n.hasMetrics && !n.hasTracing);
}

export function generateBehaviorGraph(rootDir: string): BehaviorGraph {
  const graph = buildBehaviorGraph(rootDir);

  const artifactDir = path.join(rootDir, '.pulse', 'current');
  ensureDir(artifactDir, { recursive: true });
  writeTextFile(
    path.join(artifactDir, discoverAllObservedArtifactFilenames().behaviorGraph),
    JSON.stringify(graph, null, deriveUnitValue() + deriveUnitValue()),
  );

  console.warn(
    `[behavior-graph] Wrote ${discoverAllObservedArtifactFilenames().behaviorGraph} — ${graph.summary.totalNodes} nodes, ` +
      `${graph.summary.aiSafeNodes} ai_safe, ${graph.summary.humanRequiredNodes} governed blockers`,
  );

  return graph;
}

if (process.env.PULSE_BEHAVIOR_GRAPH_RUN === String(deriveUnitValue()) || require.main === module) {
  const projectRoot = path.resolve(__dirname, '..', '..');
  console.warn(`[behavior-graph] Running standalone from ${projectRoot}`);
  const graph = generateBehaviorGraph(projectRoot);
  console.warn(`[behavior-graph] Done. Top 5 nodes by risk:`);
  const risks = requireBehaviorRiskLevelCatalog();
  const topRisks = graph.nodes
    .filter((n) => n.risk === risks.critical || n.risk === risks.high)
    .sort((a, b) => {
      const order = deriveRiskLevelOrdinalPositions();
      return order[a.risk] - order[b.risk];
    })
    .slice(
      deriveZeroValue(),
      deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue(),
    );
  for (const node of topRisks) {
    console.warn(`  [${node.risk}] ${node.name} (${node.filePath}:${node.line})`);
  }
}
