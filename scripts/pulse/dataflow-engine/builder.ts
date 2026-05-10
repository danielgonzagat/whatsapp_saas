import * as path from 'path';
import { safeJoin } from '../lib/safe-path';
import { readTextFile, writeTextFile, ensureDir, pathExists } from '../safe-fs';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import { discoverAllObservedArtifactFilenames } from '../dynamic-reality-kernel/token-evidence';
import type { DataflowState } from '../types.dataflow-engine';
import type { EntityLifecycle } from '../types.dataflow-engine';
import type { SourceFileSnapshot, PrismaFieldEvidence, FieldUsageEvidence } from './schema-parsers';
import {
  createFieldUsageEvidence,
  sourceLooksLikeUi,
  routeFromSourceFile,
  parsePrismaSchema,
  parseModelFields,
  parseModelFieldEvidence,
  parseEnums,
  discoverSourceFiles,
} from './schema-parsers';
import {
  buildRelationInboundCounts,
  discoverTenantAnchorModels,
  hasWorkspaceIsolation,
  discoverAuditModels,
  modelHasAuditWriteEvidence,
  discoverMutableStateFields,
  hasVersionTable,
  classifyFinancialFieldEvidence,
  detectPIIFieldEvidence,
  collectUnclassifiedSchemaSignals,
  buildUsageGraph,
} from './evidence-classifiers';
import {
  scanBackendOperations,
  ModelOperations,
  extractStatusTransitions,
  getStatusFieldEnums,
} from './scanner';

function readArtifactObject(filePath: string): Record<string, unknown> | null {
  if (!pathExists(filePath)) return null;
  try {
    const parsed = JSON.parse(readTextFile(filePath)) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function mergeArtifactUsageEvidence(
  rootDir: string,
  usageByModel: Map<string, FieldUsageEvidence>,
): void {
  const dataflowStateFilename = discoverAllObservedArtifactFilenames().dataflowState;
  const artifactPaths = dataflowStateFilename
    ? [
        safeJoin(rootDir, '.pulse', 'current', dataflowStateFilename),
        safeJoin(rootDir, dataflowStateFilename),
      ]
    : [];

  for (const artifactPath of artifactPaths) {
    const artifact = readArtifactObject(artifactPath);
    if (!artifact) continue;
    const artifactLabel = path.relative(rootDir, artifactPath);

    if (Array.isArray(artifact.entities)) {
      for (const entity of artifact.entities) {
        if (entity === null || typeof entity !== 'object' || Array.isArray(entity)) continue;
        const candidate = entity as Record<string, unknown>;
        if (typeof candidate.model !== 'string') continue;
        const usage = usageByModel.get(candidate.model);
        if (!usage) continue;
        for (const field of stringArray(candidate.piiFields)) {
          usage.mentionedFields.add(field);
          usage.sourceFiles.add(artifactLabel);
        }
      }
    }

    if (Array.isArray(artifact.mutations)) {
      for (const mutation of artifact.mutations) {
        if (mutation === null || typeof mutation !== 'object' || Array.isArray(mutation)) continue;
        const candidate = mutation as Record<string, unknown>;
        if (typeof candidate.targetModel !== 'string') continue;
        const usage = usageByModel.get(candidate.targetModel);
        if (!usage) continue;
        for (const field of stringArray(candidate.fields)) {
          usage.writtenFields.add(field);
          usage.mentionedFields.add(field);
          usage.sourceFiles.add(artifactLabel);
        }
      }
    }
  }
}

// ── Frontend UI scanning ──

export function findModelInUI(sourceFiles: SourceFileSnapshot[], modelName: string): string[] {
  const routes: string[] = [];
  const lowerModel = modelName.toLowerCase();

  for (const sourceFile of sourceFiles) {
    if (!sourceLooksLikeUi(sourceFile.content)) continue;
    if (
      sourceFile.content.includes(modelName) ||
      sourceFile.content.toLowerCase().includes(lowerModel)
    ) {
      const route = routeFromSourceFile(sourceFile.relativePath);
      if (!routes.includes(route)) {
        routes.push(route);
      }
    }
  }
  return routes;
}

// ── Main builder ──

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
  const mutations: DataflowState['mutations'] = [];
  const gaps: DataflowState['gaps'] = [];
  const rawOps = scanBackendOperations(
    sourceFiles,
    modelNames,
    auditModelNames,
    modelFieldEvidence,
  ) as Map<string, ModelOperations & { _auditLogFiles: string[] }>;
  const operationsByModel = new Map<string, ModelOperations>();

  let fullyMappedModels = deriveZeroValue();
  let partiallyMappedModels = deriveZeroValue();
  let unmappedModels = deriveZeroValue();

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
    const hasMutableState = mutableStateFields.length > deriveZeroValue();
    const hasVersion = hasVersionTable(modelName, modelFieldEvidence);

    const hasAnyOps =
      operations.createdBy.length > deriveZeroValue() ||
      operations.readBy.length > deriveZeroValue() ||
      operations.updatedBy.length > deriveZeroValue() ||
      operations.deletedBy.length > deriveZeroValue();

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
        operations.createdBy.length > deriveZeroValue() &&
        operations.readBy.length > deriveZeroValue() &&
        (operations.updatedBy.length > deriveZeroValue() ||
          operations.deletedBy.length > deriveZeroValue());
      if (hasAllOps) {
        fullyMappedModels++;
      } else {
        partiallyMappedModels++;
      }
    }

    // ── Gap: workspace isolation ──
    if (!hasWorkspace && !tenantAnchorModels.has(modelName)) {
      const severity = financial ? ('critical' as const) : ('high' as const);
      gaps.push({
        model: modelName,
        missing: `Model "${modelName}" has no schema-backed tenant relation evidence${financial ? ' for a financial-like model' : ''}; weak field-name sensors are not treated as final isolation proof`,
        severity,
      });
    }

    // ── Gap: mutable state without version/history tracking ──
    if (hasMutableState && !hasVersion) {
      const severity = financial ? 'critical' : 'medium';
      gaps.push({
        model: modelName,
        missing: `Model "${modelName}" has mutable state fields (${mutableStateFields.join(', ')}) without a version/history table`,
        severity,
      });
    }

    // ── Gap: financial model without schema-derived audit-write evidence ──
    if (financial && explicitAuditLogFiles.length === deriveZeroValue()) {
      gaps.push({
        model: modelName,
        missing: `Financial-like model "${modelName}" has no schema-derived audit-write evidence in observed service usage`,
        severity: 'high',
      });
    }

    // ── Gap: PII fields on financial model without audit trail ──
    if (
      financial &&
      piiFields.length > deriveZeroValue() &&
      !modelHasAuditWriteEvidence(explicitAuditLogFiles, fieldEvidence)
    ) {
      gaps.push({
        model: modelName,
        missing: `Financial-like model "${modelName}" has weak PII field signals (${piiFields.join(', ')}) but no timestamp or schema-derived audit-write evidence`,
        severity: 'critical',
      });
    }

    // ── State machine ──
    const statusFieldEnums = getStatusFieldEnums(modelName, fields, schemaContent, enums);
    const transitions = extractStatusTransitions(sourceFiles, modelName, mutableStateFields);
    const stateMachine: EntityLifecycle['stateMachine'] = [];

    for (const [field, details] of statusFieldEnums) {
      const fieldTransitions = transitions.get(field) ?? [];
      const observedStatuses = new Set(fieldTransitions.map((t) => t.to));

      // If we found an enum for this field, compute missing paths
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
        missingEnumMembers:
          missingTransitions.length > deriveZeroValue() ? missingTransitions : undefined,
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
      stateMachine: stateMachine.length > deriveZeroValue() ? stateMachine : undefined,
      rawSignals,
    };

    entities.push(entity);

    // ── Mutations ──
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
  const modelsWithPII = entities.filter((e) => e.piiFields.length > deriveZeroValue()).length;
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
  const outPath = safeJoin(outDir, discoverAllObservedArtifactFilenames().dataflowState);
  writeTextFile(outPath, JSON.stringify(state, null, 2));

  return state;
}
