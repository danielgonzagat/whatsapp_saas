import { deriveUnitValue, deriveZeroValue } from '../../dynamic-reality-kernel';
import type { DataflowRawSignal } from '../../types.dataflow-engine';
import type {
  PrismaFieldEvidence,
  FieldUsageEvidence,
  SourceFileSnapshot,
  ModelUsageGraph,
} from './schema-parsers';
import { createFieldUsageEvidence, PRISMA_CLIENT_PREFIX } from './schema-parsers';

export function isNumericMoneyStorage(field: PrismaFieldEvidence): boolean {
  if (/@id\b|@unique\b/i.test(field.attributes)) return false;
  return field.type === 'Decimal' || field.type === 'BigInt';
}

export function hasSchemaSensitivityEvidence(field: PrismaFieldEvidence): boolean {
  return /@sensitive\b|@pii\b/i.test(field.attributes);
}

export function hasFieldUsageEvidence(
  field: PrismaFieldEvidence,
  usage: FieldUsageEvidence | undefined,
): boolean {
  return (
    usage?.mentionedFields.has(field.name) === true || usage?.writtenFields.has(field.name) === true
  );
}

export function hasSupportedDataClassifierEvidence(
  field: PrismaFieldEvidence,
  usage: FieldUsageEvidence | undefined,
): boolean {
  return (
    isNumericMoneyStorage(field) ||
    hasSchemaSensitivityEvidence(field) ||
    hasFieldUsageEvidence(field, usage)
  );
}

export function collectUnclassifiedSchemaSignals(
  fields: PrismaFieldEvidence[],
  usage: FieldUsageEvidence | undefined,
): DataflowRawSignal[] {
  return fields
    .filter(
      (field) =>
        !isNumericMoneyStorage(field) &&
        !hasSchemaSensitivityEvidence(field) &&
        usage !== undefined,
    )
    .map((field) => ({
      detector: 'unclassified-schema-field',
      field: field.name,
      truthMode: 'weak_signal',
      evidenceKind: 'schema',
      evidence:
        `Field "${field.name}" is schema-visible but lacks classifier proof; ` +
        'promotion requires schema sensitivity metadata, explicit monetary storage type, or observed source/runtime usage evidence',
    }));
}

export function classifyFinancialFieldEvidence(
  fields: PrismaFieldEvidence[],
  usage: FieldUsageEvidence | undefined,
): {
  financial: boolean;
} {
  return {
    financial: fields.some(
      (field) =>
        isNumericMoneyStorage(field) &&
        (usage === undefined ||
          usage.sourceFiles.size === deriveZeroValue() ||
          usage.writtenFields.has(field.name) ||
          usage.predicateFields.has(field.name) ||
          usage.projectedFields.has(field.name)),
    ),
  };
}

export function classifyFinancialModel(_modelName: string, fields: string[] = []): boolean {
  const fieldEvidence = fields.map((field) => ({
    name: field,
    type: 'Unknown',
    attributes: '',
    relationFields: [] as string[],
    relationReferences: [] as string[],
  }));
  return classifyFinancialFieldEvidence(fieldEvidence, undefined).financial;
}

export function detectPIIFieldEvidence(
  fields: PrismaFieldEvidence[],
  usage: FieldUsageEvidence | undefined,
): {
  piiFields: string[];
} {
  const piiFields: string[] = [];

  for (const field of fields) {
    if (hasSchemaSensitivityEvidence(field) && hasSupportedDataClassifierEvidence(field, usage)) {
      piiFields.push(field.name);
    }
  }

  return { piiFields };
}

export function detectPIIFields(_modelName: string, fields: string[]): string[] {
  return fields.filter((field) => /@sensitive\b|@pii\b/i.test(field));
}

export function hasTemporalAuditEvidence(field: PrismaFieldEvidence): boolean {
  return (
    field.type === 'DateTime' &&
    (/@default\s*\(\s*now\s*\(\s*\)\s*\)/.test(field.attributes) ||
      /@updatedAt\b/.test(field.attributes) ||
      /\?/.test(field.attributes))
  );
}

export function hasBuiltInAuditTrail(fields: PrismaFieldEvidence[]): boolean {
  const temporalEvidenceCount = fields.filter((field) => hasTemporalAuditEvidence(field)).length;
  return temporalEvidenceCount >= deriveUnitValue() + deriveUnitValue();
}

export function buildRelationInboundCounts(
  fieldEvidenceByModel: Map<string, PrismaFieldEvidence[]>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [modelName] of fieldEvidenceByModel) {
    counts.set(modelName, deriveZeroValue());
  }
  for (const fields of fieldEvidenceByModel.values()) {
    for (const field of fields) {
      if (!counts.has(field.type)) continue;
      counts.set(field.type, (counts.get(field.type) ?? 0) + 1);
    }
  }
  return counts;
}

export function modelHasTenantRelationEvidence(
  fields: PrismaFieldEvidence[],
  relationInboundCounts: Map<string, number>,
): boolean {
  return fields.some((field) => {
    if (
      field.relationFields.length === deriveZeroValue() ||
      field.relationReferences.length === deriveZeroValue()
    )
      return false;
    const inboundCount = relationInboundCounts.get(field.type) ?? deriveZeroValue();
    return inboundCount >= deriveUnitValue() + deriveUnitValue();
  });
}

export function discoverTenantAnchorModels(
  relationInboundCounts: Map<string, number>,
): Set<string> {
  const anchors = new Set<string>();
  for (const [modelName, inboundCount] of relationInboundCounts) {
    if (inboundCount >= deriveUnitValue() + deriveUnitValue()) {
      anchors.add(modelName);
    }
  }
  return anchors;
}

export function hasWorkspaceIsolation(
  fields: PrismaFieldEvidence[],
  relationInboundCounts: Map<string, number>,
): boolean {
  return modelHasTenantRelationEvidence(fields, relationInboundCounts);
}

export function discoverAuditModels(
  fieldEvidenceByModel: Map<string, PrismaFieldEvidence[]>,
  usageByModel: Map<string, FieldUsageEvidence>,
): Set<string> {
  const auditModels = new Set<string>();
  for (const [modelName, fields] of fieldEvidenceByModel) {
    const hasTimestamp = fields.some((field) => hasTemporalAuditEvidence(field));
    const descriptiveScalarFields = fields.filter(
      (field) =>
        field.name !== 'id' &&
        !hasTemporalAuditEvidence(field) &&
        field.relationFields.length === deriveZeroValue() &&
        field.relationReferences.length === deriveZeroValue(),
    );
    const usage = usageByModel.get(modelName);
    const hasObservedDurableFields =
      usage !== undefined &&
      descriptiveScalarFields.some(
        (field) => usage.writtenFields.has(field.name) || usage.mentionedFields.has(field.name),
      );
    if (hasTimestamp && hasObservedDurableFields) {
      auditModels.add(modelName);
    }
  }
  return auditModels;
}

export function modelHasAuditWriteEvidence(
  explicitAuditFiles: string[],
  fields: PrismaFieldEvidence[],
): boolean {
  return hasBuiltInAuditTrail(fields) || explicitAuditFiles.length > deriveZeroValue();
}

export function discoverMutableStateFields(
  fields: PrismaFieldEvidence[],
  enums: Map<string, string[]>,
): string[] {
  return fields
    .filter((field) => {
      const members = enums.get(field.type);
      return members !== undefined && members.length > deriveUnitValue();
    })
    .map((field) => field.name);
}

export function hasVersionTable(
  modelName: string,
  fieldEvidenceByModel: Map<string, PrismaFieldEvidence[]>,
): boolean {
  for (const [candidateName, fields] of fieldEvidenceByModel) {
    if (candidateName === modelName) continue;
    const referencesModel = fields.some((field) => field.type === modelName);
    const capturesMutationState = fields.some(
      (field) =>
        field.relationFields.length === deriveZeroValue() && !hasTemporalAuditEvidence(field),
    );
    if (referencesModel && capturesMutationState) {
      return true;
    }
  }
  return false;
}

export function collectCreatedModelBindings(
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

export function contextMentionsCreatedBinding(
  context: string,
  bindings: Set<string> | undefined,
): boolean {
  if (!bindings || bindings.size === deriveZeroValue()) return false;
  for (const binding of bindings) {
    if (new RegExp(`\\b${binding}\\b`).test(context)) {
      return true;
    }
  }
  return false;
}

export function collectFieldUsageFromContext(
  context: string,
  fields: PrismaFieldEvidence[],
  usage: FieldUsageEvidence,
  bucketName: 'createdBy' | 'readBy' | 'updatedBy' | 'deletedBy',
  relativePath: string,
): void {
  for (const field of fields) {
    const fieldPattern = new RegExp(`\\b${field.name}\\b`);
    if (!fieldPattern.test(context)) continue;
    usage.mentionedFields.add(field.name);
    usage.sourceFiles.add(relativePath);
    if (bucketName === 'createdBy' || bucketName === 'updatedBy') {
      usage.writtenFields.add(field.name);
    } else if (/\bwhere\s*:/.test(context)) {
      usage.predicateFields.add(field.name);
    } else if (/\bselect\s*:|\binclude\s*:/.test(context)) {
      usage.projectedFields.add(field.name);
    }
  }
}

export function buildUsageGraph(
  sourceFiles: SourceFileSnapshot[],
  modelByPrismaProperty: Map<string, string>,
  fieldEvidenceByModel: Map<string, PrismaFieldEvidence[]>,
): ModelUsageGraph {
  const usageByModel = new Map<string, FieldUsageEvidence>();
  for (const modelName of fieldEvidenceByModel.keys()) {
    usageByModel.set(modelName, createFieldUsageEvidence());
  }

  const operationRegex = new RegExp(
    `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.(create|upsert|findUnique|findMany|findFirst|findFirstOrThrow|count|aggregate|groupBy|update|updateMany|delete|deleteMany)\\(`,
    'g',
  );

  for (const sourceFile of sourceFiles) {
    operationRegex.lastIndex = deriveZeroValue();
    let match: RegExpExecArray | null;
    while ((match = operationRegex.exec(sourceFile.content)) !== null) {
      const modelName = modelByPrismaProperty.get(match[1]);
      if (!modelName) continue;
      const fields = fieldEvidenceByModel.get(modelName) ?? [];
      const usage = usageByModel.get(modelName);
      if (!usage) continue;
      const operation = match[2];
      const bucketName =
        operation === 'create' || operation === 'upsert'
          ? 'createdBy'
          : operation === 'update' || operation === 'updateMany'
            ? 'updatedBy'
            : operation === 'delete' || operation === 'deleteMany'
              ? 'deletedBy'
              : 'readBy';
      const context = sourceFile.content.slice(
        Math.max(deriveZeroValue(), match.index - 600),
        Math.min(sourceFile.content.length, match.index + 1200),
      );
      collectFieldUsageFromContext(context, fields, usage, bucketName, sourceFile.relativePath);
    }
  }

  return { usageByModel };
}
