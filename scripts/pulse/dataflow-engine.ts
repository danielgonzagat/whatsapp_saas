import * as path from 'path';
import { safeJoin } from './lib/safe-path';
import { readTextFile, writeTextFile, pathExists, readDir, ensureDir } from './safe-fs';
import type {
  DataflowRawSignal,
  DataflowCoverageStatus,
  DataflowState,
  DataflowStateMutation,
  EntityLifecycle,
} from './types.dataflow-engine';

const MODEL_REGEX = /model\s+(\w+)\s*\{/g;

// ── Prisma operation regexes (matches both `prisma.` and `tx.` prefixes) ──
const PRISMA_CLIENT_PREFIX = String.raw`(?:\b|\.)`;
const CREATE_REGEX = new RegExp(
  `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.(create|upsert)\\(`,
  'g',
);
const READ_REGEX = new RegExp(
  `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.(findUnique|findMany|findFirst|findFirstOrThrow|count|aggregate|groupBy)\\(`,
  'g',
);
const UPDATE_REGEX = new RegExp(
  `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.(update|updateMany)\\(`,
  'g',
);
const DELETE_REGEX = new RegExp(
  `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.(delete|deleteMany)\\(`,
  'g',
);

const MODEL_CREATE_REGEX = new RegExp(
  `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.create\\(`,
  'g',
);
const TRANSACTION_REGEX = /(?:\b|\.)prisma\.\$transaction\(|\btx\.\w+\./;

function classifySourceRole(_filePath: string, content: string): string {
  const decoratorNames = Array.from(content.matchAll(/@([A-Z]\w*)\s*\(/g), (match) => match[1]);
  const className = content.match(/\bclass\s+([A-Z]\w*)\b/)?.[1];
  const implementedContract = content.match(/\bimplements\s+([A-Z]\w*)\b/)?.[1];
  const importedConstruct = content.match(/\bimport\s+\{([^}]+)\}\s+from\b/)?.[1];

  if (decoratorNames.length > 0 && className) {
    return `source_construct:decorated_class:${decoratorNames.join('+')}:${className}`;
  }
  if (implementedContract && className) {
    return `source_construct:interface:${implementedContract}:${className}`;
  }
  if (importedConstruct) {
    const firstConstruct = importedConstruct
      .split(',')
      .map((entry) => entry.trim())
      .find(Boolean);
    if (firstConstruct) {
      return `source_construct:import:${firstConstruct}`;
    }
  }
  return 'source_construct:unknown';
}

export function parsePrismaSchema(schemaPath: string): string[] {
  const content = readTextFile(schemaPath);
  const models: string[] = [];
  let match: RegExpExecArray | null;
  MODEL_REGEX.lastIndex = 0;
  while ((match = MODEL_REGEX.exec(content)) !== null) {
    models.push(match[1]);
  }
  return models;
}

function extractModelBlock(
  content: string,
  modelBodyStart: number,
): { text: string; endIndex: number } {
  let depth = 1;
  let pos = modelBodyStart;
  const startPos = modelBodyStart + 1;

  while (depth > 0 && pos < content.length) {
    pos++;
    const char = content[pos];
    if (char === '(') {
      // scan for matching `)` accounting for `"..."` strings inside parens
      let innerPos = pos + 1;
      while (innerPos < content.length && content[innerPos] !== ')') {
        if (content[innerPos] === '"') {
          innerPos = content.indexOf('"', innerPos + 1);
          if (innerPos === -1) break;
        }
        innerPos++;
      }
      if (content[innerPos] === ')') {
        pos = innerPos;
        continue;
      }
    }
    if (char === '"') {
      // scan for matching `"` accounting for escaped `\"`
      let innerPos = pos + 1;
      while (innerPos < content.length) {
        if (content[innerPos] === '\\') {
          innerPos++; // skip escaped char
        } else if (content[innerPos] === '"') {
          pos = innerPos;
          break;
        }
        innerPos++;
      }
      continue;
    }
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
    }
  }

  return {
    text: content.slice(startPos, pos),
    endIndex: pos,
  };
}

interface PrismaFieldEvidence {
  name: string;
  type: string;
  attributes: string;
  relationFields: string[];
  relationReferences: string[];
}

function parseBracketList(attributes: string, key: 'fields' | 'references'): string[] {
  const match = new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`).exec(attributes);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

function parseModelFieldEvidence(schemaContent: string): Map<string, PrismaFieldEvidence[]> {
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

function parseModelFields(schemaContent: string): Map<string, string[]> {
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

/**
 * Parses Prisma enums from the schema, returning a map of enum name → members.
 */
function parseEnums(schemaContent: string): Map<string, string[]> {
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

function isNumericMoneyStorage(field: PrismaFieldEvidence): boolean {
  if (/@id\b|@unique\b/i.test(field.attributes)) return false;
  return field.type === 'Decimal' || field.type === 'BigInt';
}

function hasSchemaSensitivityEvidence(field: PrismaFieldEvidence): boolean {
  return /@sensitive\b|@pii\b/i.test(field.attributes);
}

function hasSupportedDataClassifierEvidence(field: PrismaFieldEvidence): boolean {
  return isNumericMoneyStorage(field) || hasSchemaSensitivityEvidence(field);
}

function collectUnclassifiedSchemaSignals(fields: PrismaFieldEvidence[]): DataflowRawSignal[] {
  return fields
    .filter((field) => !hasSupportedDataClassifierEvidence(field))
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

function classifyFinancialFieldEvidence(fields: PrismaFieldEvidence[]): {
  financial: boolean;
} {
  return {
    financial: fields.some((field) => isNumericMoneyStorage(field)),
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
  return classifyFinancialFieldEvidence(fieldEvidence).financial;
}

function detectPIIFieldEvidence(fields: PrismaFieldEvidence[]): {
  piiFields: string[];
} {
  const piiFields: string[] = [];

  for (const field of fields) {
    if (hasSchemaSensitivityEvidence(field)) {
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
    if (hasTimestamp && descriptiveScalarFields.length >= 2) {
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
  rootDir: string,
  modelName: string,
  statusFields: string[],
): Map<string, StatusTransition[]> {
  const transitions = new Map<string, StatusTransition[]>();
  if (statusFields.length === 0) return transitions;

  for (const field of statusFields) {
    transitions.set(field, []);
  }

  const backendDir = safeJoin(rootDir, 'backend', 'src');
  if (!pathExists(backendDir)) return transitions;

  function scanDir(dir: string): void {
    const entries = readDir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        scanDir(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        try {
          const content = readTextFile(fullPath);
          if (!content.toLowerCase().includes(modelName.toLowerCase())) return;
          const relativePath = path.relative(rootDir, fullPath);

          for (const field of statusFields) {
            const patterns = [
              new RegExp(`data:\\s*\\{[^}]*?${field}\\s*:\\s*['\"]?(\\w+)['\"]?`, 'g'),
              new RegExp(`${field}\\s*:\\s*['\"]?(\\w+)['\"]?`, 'g'),
            ];
            for (const pat of patterns) {
              let m: RegExpExecArray | null;
              while ((m = pat.exec(content)) !== null) {
                const to = m[1];
                const existing = transitions.get(field) ?? [];
                if (!existing.some((t) => t.to === to && t.sourceFile === relativePath)) {
                  existing.push({
                    from: null,
                    to,
                    operation: 'update',
                    sourceFile: relativePath,
                  });
                  transitions.set(field, existing);
                }
              }
            }
          }
        } catch {
          // skip unreadable
        }
      }
    }
  }

  scanDir(backendDir);
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
  return (
    scanBackendOperations(rootDir, [modelName]).get(modelName) ?? {
      model: modelName,
      createdBy: [],
      readBy: [],
      updatedBy: [],
      deletedBy: [],
    }
  );
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
}

function scanBackendOperations(
  rootDir: string,
  modelNames: string[],
  auditModelNames: Set<string> = new Set(),
): Map<string, ModelOperations> {
  const backendDir = safeJoin(rootDir, 'backend', 'src');
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
    });
  }

  // Track files that contain auditLog.create for each model
  const auditLogFilesByModel = new Map<string, Set<string>>();

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

  function scanFiles(dir: string): void {
    if (!pathExists(dir)) return;
    const entries = readDir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        scanFiles(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        try {
          const content = readTextFile(fullPath);
          const relativePath = path.relative(rootDir, fullPath);
          const role = classifySourceRole(fullPath, content);
          const source = role;
          const createdBindingsByModel = collectCreatedModelBindings(
            content,
            modelByPrismaProperty,
          );

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
                const files = auditLogFilesByModel.get(modelName) ?? new Set();
                files.add(relativePath);
                auditLogFilesByModel.set(modelName, files);
              }
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  scanFiles(backendDir);

  // Merge auditLog detection into gap analysis (returned alongside operations)
  (operationsByModel as Map<string, ModelOperations & { _auditLogFiles: string[] }>).forEach(
    (ops, model) => {
      (ops as ModelOperations & { _auditLogFiles: string[] })._auditLogFiles = [
        ...(auditLogFilesByModel.get(model) ?? []),
      ];
    },
  );

  return operationsByModel;
}

// ── Frontend UI scanning ──

function findModelInUI(rootDir: string, modelName: string): string[] {
  const frontendDir = safeJoin(rootDir, 'frontend', 'src');
  if (!pathExists(frontendDir)) return [];

  const pagesDir = safeJoin(frontendDir, 'pages');
  const componentsDir = safeJoin(frontendDir, 'components');
  const routes: string[] = [];
  const lowerModel = modelName.toLowerCase();

  function routeFromUiFile(relativePath: string): string {
    const extension = path.extname(relativePath);
    const withoutExtension = extension ? relativePath.slice(0, -extension.length) : relativePath;
    const pageRelative = withoutExtension.startsWith('pages/')
      ? `/${withoutExtension.slice('pages/'.length)}`
      : withoutExtension;
    const withoutIndex = pageRelative.endsWith('/index')
      ? pageRelative.slice(0, -'/index'.length) || '/'
      : pageRelative;

    return withoutIndex
      .split('/')
      .map((segment) => {
        if (segment.startsWith('[[...') && segment.endsWith(']]')) {
          return `:${segment.slice('[[...'.length, -']]'.length)}*`;
        }
        if (segment.startsWith('[...') && segment.endsWith(']')) {
          return `:${segment.slice('[...'.length, -']'.length)}*`;
        }
        if (segment.startsWith('[') && segment.endsWith(']')) {
          return `:${segment.slice('['.length, -']'.length)}`;
        }
        return segment;
      })
      .join('/');
  }

  function scanDir(dir: string): void {
    if (!pathExists(dir)) return;
    const entries = readDir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && /\.(tsx|jsx|ts|js)$/.test(entry.name)) {
        try {
          const content = readTextFile(fullPath);
          const relativePath = path.relative(frontendDir, fullPath);

          if (content.includes(modelName) || content.toLowerCase().includes(lowerModel)) {
            const route = routeFromUiFile(relativePath);
            if (!routes.includes(route)) {
              routes.push(route);
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  scanDir(pagesDir);
  scanDir(componentsDir);
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
  const auditModelNames = discoverAuditModels(modelFieldEvidence);
  const enums = parseEnums(schemaContent);

  const entities: EntityLifecycle[] = [];
  const mutations: DataflowStateMutation[] = [];
  const gaps: DataflowState['gaps'] = [];
  const rawOps = scanBackendOperations(rootDir, modelNames, auditModelNames) as Map<
    string,
    ModelOperations & { _auditLogFiles: string[] }
  >;
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
        };
    operationsByModel.set(modelName, operations);

    const fieldEvidence = modelFieldEvidence.get(modelName) ?? [];
    const fields = modelFields.get(modelName) ?? [];
    const financialEvidence = classifyFinancialFieldEvidence(fieldEvidence);
    const financial = financialEvidence.financial;
    const piiEvidence = detectPIIFieldEvidence(fieldEvidence);
    const piiFields = piiEvidence.piiFields;
    const rawSignals = collectUnclassifiedSchemaSignals(fieldEvidence);
    const shownInUI = findModelInUI(rootDir, modelName);
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
    const transitions = extractStatusTransitions(rootDir, modelName, mutableStateFields);
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
        fields: fields.slice(0, 20),
        conditions: null,
        sideEffects: [],
      });
    }
    for (const op of operations.updatedBy) {
      mutations.push({
        sourceNodeId: `${op.source}/${modelName}`,
        targetModel: modelName,
        operation: 'update',
        fields: fields.slice(0, 20),
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
