import * as path from 'path';
import type {
  BehaviorGraph,
  BehaviorGraphSummary,
  BehaviorRiskLevel,
} from '../../types.behavior-graph';
import type { BehaviorNode } from '../../types.behavior-graph';
import { readTextFile } from '../../safe-fs';
import { loadTsMorph, resetNodeIdCounter } from './patterns';
import { extractFunctionsFromSource } from './parser';
import { extractCalledFunctions } from './builder';
import { collectSourceFiles, buildNodesFromParsedFunctions, parseFileWithTsMorph } from './builder';

function buildBehaviorGraph(rootDir: string): BehaviorGraph {
  resetNodeIdCounter();
  const tsMorphAvailable = loadTsMorph();
  const allNodes: BehaviorNode[] = [];

  if (!tsMorphAvailable) {
    console.warn('[behavior-graph] ts-morph not available, using regex-only analysis');
  }

  console.warn(`[behavior-graph] Scanning source files in ${rootDir}...`);
  const sourceFiles = collectSourceFiles(rootDir);
  console.warn(`[behavior-graph] Found ${sourceFiles.length} TypeScript files`);

  // First pass: discover all function names for call-graph linking
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

  // Second pass: build full behavior nodes
  const bodyByNodeId = new Map<string, string>();
  for (let fileIndex = 0; fileIndex < sourceFiles.length; fileIndex++) {
    const sourceFile = sourceFiles[fileIndex];
    const filePath = sourceFile.filePath;
    if (process.env.PULSE_BEHAVIOR_DEBUG === '1') {
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

  // Build call graph: link calls between nodes
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

  // Populate calledBy (reverse of calls)
  const nodeById = new Map(allNodes.map((node) => [node.id, node] as const));
  for (const node of allNodes) {
    for (const calleeId of node.calls) {
      const callee = nodeById.get(calleeId);
      if (callee && !callee.calledBy.includes(node.id)) {
        callee.calledBy.push(node.id);
      }
    }
  }

  // Identify orphans and unreachable nodes
  const orphanNodes = allNodes
    .filter((n) => n.calledBy.length === 0 && n.calls.length === 0)
    .map((n) => n.id);

  const reachable = new Set<string>();
  const entryNodes = allNodes.filter(
    (n) =>
      n.kind === 'api_endpoint' ||
      n.kind === 'cron_job' ||
      n.kind === 'queue_consumer' ||
      n.kind === 'webhook_receiver',
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

  // Build summary
  const summary: BehaviorGraphSummary = {
    totalNodes: allNodes.length,
    handlerNodes: allNodes.filter((n) => n.kind === 'handler').length,
    apiEndpointNodes: allNodes.filter((n) => n.kind === 'api_endpoint').length,
    queueNodes: allNodes.filter((n) => n.kind === 'queue_consumer' || n.kind === 'queue_producer')
      .length,
    cronNodes: allNodes.filter((n) => n.kind === 'cron_job').length,
    webhookNodes: allNodes.filter((n) => n.kind === 'webhook_receiver').length,
    dbNodes: allNodes.filter((n) => n.kind === 'db_reader' || n.kind === 'db_writer').length,
    externalCallNodes: allNodes.filter((n) => n.externalCalls.length > 0).length,
    aiSafeNodes: allNodes.filter((n) => n.executionMode === 'ai_safe').length,
    humanRequiredNodes: 0,
    nodesWithErrorHandler: allNodes.filter((n) => n.hasErrorHandler).length,
    nodesWithLogging: allNodes.filter((n) => n.hasLogging).length,
    nodesWithMetrics: allNodes.filter((n) => n.hasMetrics).length,
    criticalRiskNodes: allNodes.filter((n) => n.risk === 'critical').length,
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    nodes: allNodes,
    orphanNodes,
    unreachableNodes,
  };
}

export { buildBehaviorGraph };
