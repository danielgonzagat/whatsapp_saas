import { safeJoin } from '../../lib/safe-path';
import { readTextFile, pathExists } from '../../safe-fs';
import type { DataflowCoverageStatus, EntityLifecycle } from '../../types.dataflow-engine';
import {
  CREATE_REGEX,
  READ_REGEX,
  UPDATE_REGEX,
  DELETE_REGEX,
  MODEL_CREATE_REGEX,
  TRANSACTION_REGEX,
  classifySourceRole,
  createFieldUsageEvidence,
} from './constants-and-parsers';
import type {
  SourceFileSnapshot,
  FieldUsageEvidence,
  ModelOperations,
  PrismaFieldEvidence,
} from './constants-and-parsers';
import { parseModelFieldEvidence } from './schema-parsing';
import { discoverSourceFiles, buildUsageGraph } from './usage-graph';

function collectCreatedModelBindings(
  content: string,
  modelByPrismaProperty: Map<string, string>,
): Map<string, Set<string>> {
  const bindingsByModel = new Map<string, Set<string>>();
  const bindingRegex = new RegExp(
    String.raw`\b(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?(?:\w+\.)?(\w+)\.create\s*\(`,
    'g',
  );
  let match: RegExpExecArray | null;
  while ((match = bindingRegex.exec(content)) !== null) {
    const modelName = modelByPrismaProperty.get(match[2]);
    if (!modelName) continue;
    const bindings = bindingsByModel.get(modelName) ?? new Set<string>();
    bindings.add(match[1]);
    bindingsByModel.set(modelName, bindings);
  }
  return bindingsByModel;
}

function contextMentionsCreatedBinding(
  context: string,
  bindings: Set<string> | undefined,
): boolean {
  if (!bindings || bindings.size === 0) return false;
  for (const binding of bindings) {
    if (new RegExp(`\\b${binding}\\b`).test(context)) {
      return true;
    }
  }
  return false;
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
    const relativePath = sourceFile.relativePath;
    const source = classifySourceRole(sourceFile.absolutePath, content);
    const createdBindingsByModel = collectCreatedModelBindings(content, modelByPrismaProperty);

    const collect = (
      regex: RegExp,
      bucketName: 'createdBy' | 'readBy' | 'updatedBy' | 'deletedBy',
    ) => {
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(content)) !== null) {
        appendOperation(m[1], bucketName, source, relativePath);
      }
    };

    collect(CREATE_REGEX, 'createdBy');
    collect(READ_REGEX, 'readBy');
    collect(UPDATE_REGEX, 'updatedBy');
    collect(DELETE_REGEX, 'deletedBy');

    MODEL_CREATE_REGEX.lastIndex = 0;
    let auditMatch: RegExpExecArray | null;
    while ((auditMatch = MODEL_CREATE_REGEX.exec(content)) !== null) {
      const auditModelName = modelByPrismaProperty.get(auditMatch[1]);
      if (!auditModelName || !auditModelNames.has(auditModelName)) continue;

      const beforeCtx = content.slice(Math.max(0, auditMatch.index - 400), auditMatch.index);
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
          files.add(relativePath);
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

export function findModelOperations(
  rootDir: string,
  modelName: string,
): Omit<
  EntityLifecycle,
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
  const modelFieldEvidence =
    schemaContent.length > 0 ? parseModelFieldEvidence(schemaContent) : new Map();
  const sourceFiles = discoverSourceFiles(rootDir);
  const operations = scanBackendOperations(
    sourceFiles,
    [modelName],
    new Set(),
    modelFieldEvidence,
  ).get(modelName);
  if (!operations) {
    return {
      model: modelName,
      createdBy: [],
      readBy: [],
      updatedBy: [],
      deletedBy: [],
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
