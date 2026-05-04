function detectPIIFieldEvidence(
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

function hasTemporalAuditEvidence(field: PrismaFieldEvidence): boolean {
  return (
    field.type === 'DateTime' &&
    (/@default\s*\(\s*now\s*\(\s*\)\s*\)/.test(field.attributes) ||
      /@updatedAt\b/.test(field.attributes) ||
      /\?/.test(field.attributes))
  );
}

function hasBuiltInAuditTrail(fields: PrismaFieldEvidence[]): boolean {
  const temporalEvidenceCount = fields.filter((field) => hasTemporalAuditEvidence(field)).length;
  return temporalEvidenceCount >= 2;
}

function buildRelationInboundCounts(
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

function modelHasTenantRelationEvidence(
  fields: PrismaFieldEvidence[],
  relationInboundCounts: Map<string, number>,
): boolean {
  return fields.some((field) => {
    if (field.relationFields.length === 0 || field.relationReferences.length === 0) return false;
    const inboundCount = relationInboundCounts.get(field.type) ?? 0;
    return inboundCount >= 2;
  });
}

function discoverTenantAnchorModels(relationInboundCounts: Map<string, number>): Set<string> {
  const anchors = new Set<string>();
  for (const [modelName, inboundCount] of relationInboundCounts) {
    if (inboundCount >= 2) {
      anchors.add(modelName);
    }
  }
  return anchors;
}

function hasWorkspaceIsolation(
  fields: PrismaFieldEvidence[],
  relationInboundCounts: Map<string, number>,
): boolean {
  return modelHasTenantRelationEvidence(fields, relationInboundCounts);
}

function discoverAuditModels(
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

function modelHasAuditWriteEvidence(
  explicitAuditFiles: string[],
  fields: PrismaFieldEvidence[],
): boolean {
  return hasBuiltInAuditTrail(fields) || explicitAuditFiles.length > 0;
}

function discoverMutableStateFields(
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

function hasVersionTable(
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

function collectFieldUsageFromContext(
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

function buildUsageGraph(
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
    operationRegex.lastIndex = 0;
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
        Math.max(0, match.index - 600),
        Math.min(sourceFile.content.length, match.index + 1200),
      );
      collectFieldUsageFromContext(context, fields, usage, bucketName, sourceFile.relativePath);
    }
  }

  return { usageByModel };
}

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

function mergeArtifactUsageEvidence(
  rootDir: string,
  usageByModel: Map<string, FieldUsageEvidence>,
): void {
  const artifactPaths = [
    safeJoin(rootDir, '.pulse', 'current', 'PULSE_DATAFLOW_STATE.json'),
    safeJoin(rootDir, 'PULSE_DATAFLOW_STATE.json'),
  ];

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

// ── State machine extraction ──

interface StatusTransition {
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
function extractStatusTransitions(
  sourceFiles: SourceFileSnapshot[],
  modelName: string,
  statusFields: string[],
): Map<string, StatusTransition[]> {
  const transitions = new Map<string, StatusTransition[]>();
  if (statusFields.length === 0) return transitions;

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
function getStatusFieldEnums(
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

interface ModelOperations {
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

function scanBackendOperations(
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

// ── Frontend UI scanning ──

function findModelInUI(sourceFiles: SourceFileSnapshot[], modelName: string): string[] {
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
    if (financial && explicitAuditLogFiles.length === 0) {
      gaps.push({
        model: modelName,
        missing: `Financial-like model "${modelName}" has no schema-derived audit-write evidence in observed service usage`,
        severity: 'high',
      });
    }

    // ── Gap: PII fields on financial model without audit trail ──
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

/**
 * Entry point when invoked as a script:
 *   npx ts-node scripts/pulse/dataflow-engine.ts [--root /path/to/repo]
 */
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
