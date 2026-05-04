import { readTextFile } from '../../safe-fs';
import type { DataflowRawSignal } from '../../types.dataflow-engine';
import { MODEL_REGEX, extractModelBlock, parseBracketList } from './constants-and-parsers';
import type { PrismaFieldEvidence, FieldUsageEvidence } from './constants-and-parsers';

export function parseModelFieldEvidence(schemaContent: string): Map<string, PrismaFieldEvidence[]> {
  const result = new Map<string, PrismaFieldEvidence[]>();
  let match: RegExpExecArray | null;
  MODEL_REGEX.lastIndex = 0;
  while ((match = MODEL_REGEX.exec(schemaContent)) !== null) {
    const modelName = match[1];
    const openBraceIdx = schemaContent.indexOf('{', match.index);
    if (openBraceIdx === -1) continue;

    const block = extractModelBlock(schemaContent, openBraceIdx);

    const fields: PrismaFieldEvidence[] = [];
    const lines = block.text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
      const fieldMatch = trimmed.match(/^(\w+)\s+([A-Za-z_]\w*)(.*)$/);
      if (fieldMatch) {
        const attributes = fieldMatch[3] ?? '';
        fields.push({
          name: fieldMatch[1],
          type: fieldMatch[2].replace(/[?[\]]/g, ''),
          attributes,
          relationFields: parseBracketList(attributes, 'fields'),
          relationReferences: parseBracketList(attributes, 'references'),
        });
      }
    }

    result.set(modelName, fields);
  }
  return result;
}

export function parseModelFields(schemaContent: string): Map<string, string[]> {
  const evidence = parseModelFieldEvidence(schemaContent);
  const result = new Map<string, string[]>();
  for (const [modelName, fields] of evidence) {
    result.set(
      modelName,
      fields.map((field) => field.name),
    );
  }
  return result;
}

export function parseEnums(schemaContent: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = enumRegex.exec(schemaContent)) !== null) {
    const name = match[1];
    const body = match[2];
    const members = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//'))
      .map((l) => l.replace(/\s.*$/, ''))
      .filter(Boolean);
    result.set(name, members);
  }
  return result;
}

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
          usage.sourceFiles.size === 0 ||
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
    relationFields: [],
    relationReferences: [],
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
  return temporalEvidenceCount >= 2;
}

export function buildRelationInboundCounts(
  fieldEvidenceByModel: Map<string, PrismaFieldEvidence[]>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [modelName] of fieldEvidenceByModel) {
    counts.set(modelName, 0);
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
    if (field.relationFields.length === 0 || field.relationReferences.length === 0) return false;
    const inboundCount = relationInboundCounts.get(field.type) ?? 0;
    return inboundCount >= 2;
  });
}

export function discoverTenantAnchorModels(
  relationInboundCounts: Map<string, number>,
): Set<string> {
  const anchors = new Set<string>();
  for (const [modelName, inboundCount] of relationInboundCounts) {
    if (inboundCount >= 2) {
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
        field.relationFields.length === 0 &&
        field.relationReferences.length === 0,
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
  return hasBuiltInAuditTrail(fields) || explicitAuditFiles.length > 0;
}

export function discoverMutableStateFields(
  fields: PrismaFieldEvidence[],
  enums: Map<string, string[]>,
): string[] {
  return fields
    .filter((field) => {
      const members = enums.get(field.type);
      return members !== undefined && members.length > 1;
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
      (field) => field.relationFields.length === 0 && !hasTemporalAuditEvidence(field),
    );
    if (referencesModel && capturesMutationState) {
      return true;
    }
  }
  return false;
}
