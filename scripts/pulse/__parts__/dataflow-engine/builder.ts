import * as path from 'path';
import { safeJoin } from '../../lib/safe-path';
import { readTextFile, writeTextFile, ensureDir } from '../../safe-fs';
import type {
  DataflowState,
  DataflowStateMutation,
  EntityLifecycle,
} from '../../types.dataflow-engine';
import { parsePrismaSchema, createFieldUsageEvidence } from './constants-and-parsers';
import type { ModelOperations } from './constants-and-parsers';
import {
  parseModelFields,
  parseModelFieldEvidence,
  parseEnums,
  classifyFinancialFieldEvidence,
  detectPIIFieldEvidence,
  collectUnclassifiedSchemaSignals,
  buildRelationInboundCounts,
  discoverTenantAnchorModels,
  hasWorkspaceIsolation,
  discoverAuditModels,
  discoverMutableStateFields,
  hasVersionTable,
  modelHasAuditWriteEvidence,
} from './schema-parsing';
import { discoverSourceFiles, buildUsageGraph, mergeArtifactUsageEvidence } from './usage-graph';
import { extractStatusTransitions, getStatusFieldEnums } from './state-machine';
import { scanBackendOperations } from './backend-scanner';
import { findModelInUI } from './ui-scanner';

export function buildDataflowState(rootDir: string): DataflowState {
  const schemaPath = safeJoin(rootDir, 'backend', 'prisma', 'schema.prisma');
  const schemaContent = readTextFile(schemaPath);
  const modelNames = parsePrismaSchema(schemaPath);
  const modelFields = parseModelFields(schemaContent);
  const modelFieldEvidence = parseModelFieldEvidence(schemaContent);
  const relationInboundCounts = buildRelationInboundCounts(modelFieldEvidence);
  const tenantAnchorModels = discoverTenantAnchorModels(relationInboundCounts);
  const enums = parseEnums(schemaContent);
  const sourceFiles = discoverSourceFiles(rootDir);
  const modelByPrismaProperty = new Map<string, string>();
  for (const modelName of modelNames) {
    modelByPrismaProperty.set(modelName, modelName);
    modelByPrismaProperty.set(modelName.charAt(0).toLowerCase() + modelName.slice(1), modelName);
  }
  const usageGraph = buildUsageGraph(sourceFiles, modelByPrismaProperty, modelFieldEvidence);
  mergeArtifactUsageEvidence(rootDir, usageGraph.usageByModel);
  const auditModelNames = discoverAuditModels(modelFieldEvidence, usageGraph.usageByModel);

  const entities: EntityLifecycle[] = [];
  const mutations: DataflowStateMutation[] = [];
  const gaps: DataflowState['gaps'] = [];
  const rawOps = scanBackendOperations(
    sourceFiles,
    modelNames,
    auditModelNames,
    modelFieldEvidence,
  ) as Map<string, ModelOperations & { _auditLogFiles: string[] }>;
  const operationsByModel = new Map<string, ModelOperations>();

  let fullyMappedModels = 0;
  let partiallyMappedModels = 0;
  let unmappedModels = 0;

  for (const modelName of modelNames) {
    const raw = rawOps.get(modelName);
    const explicitAuditLogFiles = raw?._auditLogFiles ?? [];
    const operations: ModelOperations = raw
      ? {
          model: raw.model,
          createdBy: raw.createdBy,
          readBy: raw.readBy,
          updatedBy: raw.updatedBy,
          deletedBy: raw.deletedBy,
          hasWorkspaceIsolation: raw.hasWorkspaceIsolation,
          hasMutableState: raw.hasMutableState,
          hasVersionHistory: raw.hasVersionHistory,
          fieldUsage: usageGraph.usageByModel.get(modelName) ?? raw.fieldUsage,
        }
      : {
          model: modelName,
          createdBy: [],
          readBy: [],
          updatedBy: [],
          deletedBy: [],
          hasWorkspaceIsolation: false,
          hasMutableState: false,
          hasVersionHistory: false,
          fieldUsage: usageGraph.usageByModel.get(modelName) ?? createFieldUsageEvidence(),
        };
    operationsByModel.set(modelName, operations);

    const fieldEvidence = modelFieldEvidence.get(modelName) ?? [];
    const fields = modelFields.get(modelName) ?? [];
    const usage = operations.fieldUsage;
    const financialEvidence = classifyFinancialFieldEvidence(fieldEvidence, usage);
    const financial = financialEvidence.financial;
    const piiEvidence = detectPIIFieldEvidence(fieldEvidence, usage);
    const piiFields = piiEvidence.piiFields;
    const rawSignals = collectUnclassifiedSchemaSignals(fieldEvidence, usage);
    const shownInUI = findModelInUI(sourceFiles, modelName);
    const hasWorkspace = hasWorkspaceIsolation(fieldEvidence, relationInboundCounts);
    const mutableStateFields = discoverMutableStateFields(fieldEvidence, enums);
    const hasMutableState = mutableStateFields.length > 0;
    const hasVersion = hasVersionTable(modelName, modelFieldEvidence);

    const hasAnyOps =
      operations.createdBy.length > 0 ||
      operations.readBy.length > 0 ||
      operations.updatedBy.length > 0 ||
      operations.deletedBy.length > 0;

    if (!hasAnyOps) {
      unmappedModels++;
      if (financial) {
        gaps.push({
          model: modelName,
          missing: `Financial model "${modelName}" has no observed Prisma operations in backend source`,
          severity: 'critical',
        });
      }
    } else {
      const hasAllOps =
        operations.createdBy.length > 0 &&
        operations.readBy.length > 0 &&
        (operations.updatedBy.length > 0 || operations.deletedBy.length > 0);
      if (hasAllOps) {
        fullyMappedModels++;
      } else {
        partiallyMappedModels++;
      }
    }

    if (!hasWorkspace && !tenantAnchorModels.has(modelName)) {
      const severity = financial ? ('critical' as const) : ('high' as const);
      gaps.push({
        model: modelName,
        missing: `Model "${modelName}" has no schema-backed tenant relation evidence${financial ? ' for a financial-like model' : ''}; weak field-name sensors are not treated as final isolation proof`,
        severity,
      });
    }

    if (hasMutableState && !hasVersion) {
      const severity = financial ? 'critical' : 'medium';
      gaps.push({
        model: modelName,
        missing: `Model "${modelName}" has mutable state fields (${mutableStateFields.join(', ')}) without a version/history table`,
        severity,
      });
    }

    if (financial && explicitAuditLogFiles.length === 0) {
      gaps.push({
        model: modelName,
        missing: `Financial-like model "${modelName}" has no schema-derived audit-write evidence in observed service usage`,
        severity: 'high',
      });
    }

    if (
      financial &&
      piiFields.length > 0 &&
      !modelHasAuditWriteEvidence(explicitAuditLogFiles, fieldEvidence)
    ) {
      gaps.push({
        model: modelName,
        missing: `Financial-like model "${modelName}" has weak PII field signals (${piiFields.join(', ')}) but no timestamp or schema-derived audit-write evidence`,
        severity: 'critical',
      });
    }

    const statusFieldEnums = getStatusFieldEnums(modelName, fields, schemaContent, enums);
    const transitions = extractStatusTransitions(sourceFiles, modelName, mutableStateFields);
    const stateMachine: EntityLifecycle['stateMachine'] = [];

    for (const [field, details] of statusFieldEnums) {
      const fieldTransitions = transitions.get(field) ?? [];
      const observedStatuses = new Set(fieldTransitions.map((t) => t.to));

      const missingTransitions: string[] = [];
      for (const member of details.members) {
        if (!observedStatuses.has(member)) {
          missingTransitions.push(member);
        }
      }

      stateMachine.push({
        field,
        enumName: details.enumName,
        observedTransitions: fieldTransitions.map((t) => ({
          from: t.from,
          to: t.to,
          sourceFile: t.sourceFile,
        })),
        totalEnumMembers: details.members.length,
        missingEnumMembers: missingTransitions.length > 0 ? missingTransitions : undefined,
      });
    }

    const entity: EntityLifecycle = {
      model: modelName,
      createdBy: operations.createdBy,
      readBy: operations.readBy,
      updatedBy: operations.updatedBy,
      deletedBy: operations.deletedBy,
      shownInUI,
      critical: financial,
      financial,
      hasAuditTrail: modelHasAuditWriteEvidence(explicitAuditLogFiles, fieldEvidence),
      piiFields,
      hasWorkspaceIsolation: hasWorkspace,
      hasMutableState,
      hasVersionHistory: hasVersion,
      stateMachine: stateMachine.length > 0 ? stateMachine : undefined,
      rawSignals,
    };

    entities.push(entity);

    for (const op of operations.createdBy) {
      mutations.push({
        sourceNodeId: `${op.source}/${modelName}`,
        targetModel: modelName,
        operation: 'create',
        fields: Array.from(usage.writtenFields),
        conditions: null,
        sideEffects: [],
      });
    }
    for (const op of operations.updatedBy) {
      mutations.push({
        sourceNodeId: `${op.source}/${modelName}`,
        targetModel: modelName,
        operation: 'update',
        fields: Array.from(usage.writtenFields),
        conditions: null,
        sideEffects: [],
      });
    }
    for (const op of operations.deletedBy) {
      mutations.push({
        sourceNodeId: `${op.source}/${modelName}`,
        targetModel: modelName,
        operation: 'delete',
        fields: [],
        conditions: null,
        sideEffects: [],
      });
    }
  }

  const financialModels = entities.filter((e) => e.financial).length;
  const modelsWithAuditTrail = entities.filter((e) => e.hasAuditTrail).length;
  const modelsWithPII = entities.filter((e) => e.piiFields.length > 0).length;
  const modelsWithWorkspaceIsolation = entities.filter((e) => e.hasWorkspaceIsolation).length;
  const modelsMissingWorkspaceIsolation = entities.filter((e) => !e.hasWorkspaceIsolation).length;
  const modelsWithMutableState = entities.filter((e) => e.hasMutableState).length;
  const modelsMissingHistory = entities.filter(
    (e) => e.hasMutableState && !e.hasVersionHistory,
  ).length;

  const state: DataflowState = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalModels: entities.length,
      financialModels,
      modelsWithAuditTrail,
      modelsWithPII,
      fullyMappedModels,
      partiallyMappedModels,
      unmappedModels,
      modelsWithWorkspaceIsolation,
      modelsMissingWorkspaceIsolation,
      modelsWithMutableState,
      modelsMissingHistory,
    },
    entities,
    mutations,
    gaps,
  };

  const outDir = safeJoin(rootDir, '.pulse', 'current');
  ensureDir(outDir, { recursive: true });
  const outPath = safeJoin(outDir, 'PULSE_DATAFLOW_STATE.json');
  writeTextFile(outPath, JSON.stringify(state, null, 2));

  return state;
}

if (typeof require !== 'undefined' && require.main === module) {
  const args = process.argv.slice(2);
  let rootDir = '';
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--root' || args[i] === '--rootDir') && args[i + 1]) {
      rootDir = path.resolve(args[i + 1]);
      break;
    }
  }
  if (!rootDir) {
    rootDir = path.resolve(__dirname, '..', '..');
  }
  console.log(`[dataflow-engine] Scanning from ${rootDir}...`);
  const state = buildDataflowState(rootDir);
  console.log(
    `[dataflow-engine] DataflowState written to .pulse/current/PULSE_DATAFLOW_STATE.json`,
  );
  console.log(
    `[dataflow-engine] ${state.summary.totalModels} models | ` +
      `${state.summary.financialModels} financial | ` +
      `${state.summary.fullyMappedModels} fully mapped | ` +
      `${state.summary.partiallyMappedModels} partially mapped | ` +
      `${state.summary.unmappedModels} unmapped`,
  );
  console.log(
    `[dataflow-engine] Workspace isolation: ${state.summary.modelsWithWorkspaceIsolation}/${state.summary.totalModels} models | ` +
      `${state.summary.modelsMissingWorkspaceIsolation} missing workspace isolation`,
  );
  console.log(
    `[dataflow-engine] Mutable state: ${state.summary.modelsWithMutableState} models | ` +
      `${state.summary.modelsMissingHistory} missing version/history tracking`,
  );
  if (state.gaps.length > 0) {
    console.log(
      `[dataflow-engine] ${state.gaps.length} gap(s) detected:` +
        state.gaps.map((g) => `\n  [${g.severity}] ${g.model}: ${g.missing}`).join(''),
    );
  }
}
