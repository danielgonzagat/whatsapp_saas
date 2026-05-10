import { safeJoin } from '../../lib/safe-path';
import { readTextFile, pathExists } from '../../safe-fs';
import { deriveZeroValue } from '../../dynamic-reality-kernel/catalog-arithmetic';
import type { DataflowCoverageStatus } from '../../types.dataflow-engine';
import type { PrismaFieldEvidence, SourceFileSnapshot, FieldUsageEvidence } from './schema-parsers';
import {
  createFieldUsageEvidence,
  extractModelBlock,
  discoverSourceFiles,
  classifySourceRole,
  parseModelFieldEvidence,
  CREATE_REGEX,
  READ_REGEX,
  UPDATE_REGEX,
  DELETE_REGEX,
  MODEL_CREATE_REGEX,
  TRANSACTION_REGEX,
} from './schema-parsers';
import {
  collectCreatedModelBindings,
  contextMentionsCreatedBinding,
  collectFieldUsageFromContext,
  buildUsageGraph,
} from './evidence-classifiers';

// ── State machine extraction ──

export interface StatusTransition {
  from: string | null;
  to: string;
  operation: string;
  sourceFile: string;
}

/**
 * Scans backend source for status transition patterns like:
 *   data: { status: 'ACTIVE' }
 * where 'status' is a field that maps to a Prisma enum.
 */
export function extractStatusTransitions(
  sourceFiles: SourceFileSnapshot[],
  modelName: string,
  statusFields: string[],
): Map<string, StatusTransition[]> {
  const transitions = new Map<string, StatusTransition[]>();
  if (statusFields.length === deriveZeroValue()) return transitions;

  for (const field of statusFields) {
    transitions.set(field, []);
  }

  for (const sourceFile of sourceFiles) {
    if (!sourceFile.content.toLowerCase().includes(modelName.toLowerCase())) continue;
    for (const field of statusFields) {
      const patterns = [
        new RegExp(`data:\\s*\\{[^}]*?${field}\\s*:\\s*['"]?(\\w+)['"]?`, 'g'),
        new RegExp(`${field}\\s*:\\s*['"]?(\\w+)['"]?`, 'g'),
      ];
      for (const pat of patterns) {
        let m: RegExpExecArray | null;
        while ((m = pat.exec(sourceFile.content)) !== null) {
          const to = m[1];
          const existing = transitions.get(field) ?? [];
          if (!existing.some((t) => t.to === to && t.sourceFile === sourceFile.relativePath)) {
            existing.push({
              from: null,
              to,
              operation: 'update',
              sourceFile: sourceFile.relativePath,
            });
            transitions.set(field, existing);
          }
        }
      }
    }
  }
  return transitions;
}

/**
 * Maps Prisma field types to enum names by matching field type annotations.
 */
export function getStatusFieldEnums(
  modelName: string,
  fields: string[],
  schemaContent: string,
  enums: Map<string, string[]>,
): Map<string, { enumName: string; members: string[] }> {
  const result = new Map<string, { enumName: string; members: string[] }>();
  const blockMatch = new RegExp(`model\\s+${modelName}\\s*\\{`, 'g').exec(schemaContent);
  if (!blockMatch) return result;

  const openBraceIdx = schemaContent.indexOf('{', blockMatch.index);
  if (openBraceIdx === -1) return result;
  const block = extractModelBlock(schemaContent, openBraceIdx);

  for (const field of fields) {
    const findTypeInBlock = new RegExp(`^\\s*${field}\\s+(\\w+)`, 'm');
    const typeMatch = findTypeInBlock.exec(block.text);
    if (typeMatch) {
      const typeHint = typeMatch[1];
      const members = enums.get(typeHint);
      if (members !== undefined) {
        result.set(field, { enumName: typeHint, members });
      }
    }
  }

  return result;
}

// ── Core scanning ──

export function findModelOperations(
  rootDir: string,
  modelName: string,
): Omit<
  import('../../types.dataflow-engine').EntityLifecycle,
  | 'shownInUI'
  | 'critical'
  | 'financial'
  | 'hasAuditTrail'
  | 'piiFields'
  | 'hasWorkspaceIsolation'
  | 'hasMutableState'
  | 'hasVersionHistory'
  | 'stateMachine'
> {
  const schemaPath = safeJoin(rootDir, 'backend', 'prisma', 'schema.prisma');
  const schemaContent = pathExists(schemaPath) ? readTextFile(schemaPath) : '';
  const fieldEvidence =
    schemaContent.length > deriveZeroValue() ? parseModelFieldEvidence(schemaContent) : new Map();
  const sourceFiles = discoverSourceFiles(rootDir);
  const operations = scanBackendOperations(sourceFiles, [modelName], new Set(), fieldEvidence).get(
    modelName,
  );
  if (!operations) {
    return {
      model: modelName,
      createdBy: [] as Array<{ source: string; filePath: string; status: DataflowCoverageStatus }>,
      readBy: [] as Array<{ source: string; filePath: string; status: DataflowCoverageStatus }>,
      updatedBy: [] as Array<{ source: string; filePath: string; status: DataflowCoverageStatus }>,
      deletedBy: [] as Array<{ source: string; filePath: string; status: DataflowCoverageStatus }>,
    };
  }
  return {
    model: operations.model,
    createdBy: operations.createdBy,
    readBy: operations.readBy,
    updatedBy: operations.updatedBy,
    deletedBy: operations.deletedBy,
  };
}

export interface ModelOperations {
  model: string;
  createdBy: Array<{ source: string; filePath: string; status: DataflowCoverageStatus }>;
  readBy: Array<{ source: string; filePath: string; status: DataflowCoverageStatus }>;
  updatedBy: Array<{ source: string; filePath: string; status: DataflowCoverageStatus }>;
  deletedBy: Array<{ source: string; filePath: string; status: DataflowCoverageStatus }>;
  hasWorkspaceIsolation: boolean;
  hasMutableState: boolean;
  hasVersionHistory: boolean;
  fieldUsage: FieldUsageEvidence;
}

export function scanBackendOperations(
  sourceFiles: SourceFileSnapshot[],
  modelNames: string[],
  auditModelNames: Set<string> = new Set(),
  fieldEvidenceByModel: Map<string, PrismaFieldEvidence[]> = new Map(),
): Map<string, ModelOperations> {
  const modelByPrismaProperty = new Map<string, string>();
  const operationsByModel = new Map<string, ModelOperations>();

  for (const modelName of modelNames) {
    modelByPrismaProperty.set(modelName, modelName);
    modelByPrismaProperty.set(modelName.charAt(0).toLowerCase() + modelName.slice(1), modelName);
    operationsByModel.set(modelName, {
      model: modelName,
      createdBy: [],
      readBy: [],
      updatedBy: [],
      deletedBy: [],
      hasWorkspaceIsolation: false,
      hasMutableState: false,
      hasVersionHistory: false,
      fieldUsage: createFieldUsageEvidence(),
    });
  }

  const usageGraph = buildUsageGraph(sourceFiles, modelByPrismaProperty, fieldEvidenceByModel);
  for (const [modelName, usage] of usageGraph.usageByModel) {
    const operations = operationsByModel.get(modelName);
    if (operations) {
      operations.fieldUsage = usage;
    }
  }

  const auditEvidenceFilesByModel = new Map<string, Set<string>>();

  function appendOperation(
    matchedModel: string,
    bucketName: 'createdBy' | 'readBy' | 'updatedBy' | 'deletedBy',
    source: string,
    filePath: string,
  ): void {
    const modelName = modelByPrismaProperty.get(matchedModel);
    if (!modelName) return;
    const operations = operationsByModel.get(modelName);
    if (!operations) return;
    const existing = operations[bucketName].find((o) => o.filePath === filePath);
    if (existing) return;
    operations[bucketName].push({
      source,
      filePath,
      status: 'observed' as DataflowCoverageStatus,
    });
  }

  for (const sourceFile of sourceFiles) {
    const content = sourceFile.content;
    const source = classifySourceRole(sourceFile.absolutePath, content);
    const createdBindingsByModel = collectCreatedModelBindings(content, modelByPrismaProperty);

    const collect = (
      regex: RegExp,
      bucketName: 'createdBy' | 'readBy' | 'updatedBy' | 'deletedBy',
    ) => {
      regex.lastIndex = deriveZeroValue();
      let m: RegExpExecArray | null;
      while ((m = regex.exec(content)) !== null) {
        appendOperation(m[1], bucketName, source, sourceFile.relativePath);
      }
    };

    collect(CREATE_REGEX, 'createdBy');
    collect(READ_REGEX, 'readBy');
    collect(UPDATE_REGEX, 'updatedBy');
    collect(DELETE_REGEX, 'deletedBy');

    MODEL_CREATE_REGEX.lastIndex = deriveZeroValue();
    let auditMatch: RegExpExecArray | null;
    while ((auditMatch = MODEL_CREATE_REGEX.exec(content)) !== null) {
      const auditModelName = modelByPrismaProperty.get(auditMatch[1]);
      if (!auditModelName || !auditModelNames.has(auditModelName)) continue;

      const beforeCtx = content.slice(
        Math.max(deriveZeroValue(), auditMatch.index - 400),
        auditMatch.index,
      );
      const afterCtx = content.slice(auditMatch.index, auditMatch.index + 400);
      const context = `${beforeCtx}\n${afterCtx}`;
      const hasDurableAuditEvidence =
        TRANSACTION_REGEX.test(context) || /create\s*\(/.test(afterCtx);
      if (!hasDurableAuditEvidence) continue;

      for (const modelName of modelNames) {
        if (
          modelName !== auditModelName &&
          contextMentionsCreatedBinding(context, createdBindingsByModel.get(modelName))
        ) {
          const files = auditEvidenceFilesByModel.get(modelName) ?? new Set();
          files.add(sourceFile.relativePath);
          auditEvidenceFilesByModel.set(modelName, files);
        }
      }
    }
  }

  (operationsByModel as Map<string, ModelOperations & { _auditLogFiles: string[] }>).forEach(
    (ops, model) => {
      (ops as ModelOperations & { _auditLogFiles: string[] })._auditLogFiles = [
        ...(auditEvidenceFilesByModel.get(model) ?? []),
      ];
    },
  );

  return operationsByModel;
}
