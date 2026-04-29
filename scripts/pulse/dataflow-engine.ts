import * as path from 'path';
import { safeJoin } from './lib/safe-path';
import { readTextFile, writeTextFile, pathExists, readDir, ensureDir } from './safe-fs';
import type {
  DataflowCoverageStatus,
  DataflowState,
  DataflowStateMutation,
  EntityLifecycle,
} from './types.dataflow-engine';

const MODEL_REGEX = /model\s+(\w+)\s*\{/g;

// ── Prisma operation regexes (matches both `prisma.` and `tx.` prefixes) ──
const CREATE_REGEX = /\.(?:prisma|tx)\.(\w+)\.(create|upsert)\(/g;
const READ_REGEX =
  /\.(?:prisma|tx)\.(\w+)\.(findUnique|findMany|findFirst|findFirstOrThrow|count|aggregate|groupBy)\(/g;
const UPDATE_REGEX = /\.(?:prisma|tx)\.(\w+)\.(update|updateMany)\(/g;
const DELETE_REGEX = /\.(?:prisma|tx)\.(\w+)\.(delete|deleteMany)\(/g;

// ── AuditLog usage detection ──
const AUDITLOG_CREATE_REGEX = /\.(?:prisma|tx)\.auditLog\.create\(/g;

const PII_FIELD_PATTERNS = [
  /^email/i,
  /^name$/i,
  /^(firstName|lastName)$/i,
  /^(fullName|displayName)$/i,
  /^phone/i,
  /^cpf$/i,
  /^cnpj$/i,
  /^document/i,
  /^address$/i,
  /^birth/i,
  /^rg$/i,
  /^passport$/i,
  /^taxId$/i,
  /^socialSecurity/i,
  /^ssn$/i,
  /^avatarUrl$/i,
  /^photoUrl$/i,
  /^bio$/i,
  /^fullName$/i,
  /^razaoSocial$/i,
  /^nomeFantasia$/i,
  /^inscricao/i,
  /^cep$/i,
  /^street$/i,
  /^number$/i,
  /^complement$/i,
  /^neighborhood$/i,
  /^city$/i,
  /^state$/i,
  /^holderName$/i,
  /^holderDocument$/i,
  /^customerName$/i,
  /^customerEmail$/i,
  /^customerPhone$/i,
];

const AUDIT_FIELD_PATTERNS = [/^createdAt$/i, /^updatedAt$/i, /^deletedAt$/i];

const MONEY_LIKE_FIELD_PATTERNS = [
  /amount/i,
  /balance/i,
  /currency/i,
  /cents/i,
  /subtotal/i,
  /total/i,
  /price/i,
  /tax/i,
  /rate/i,
  /fee/i,
  /commission/i,
  /revenue/i,
  /payout/i,
  /payOut/i,
];

const MUTATION_STATE_FIELD_PATTERNS = [
  /^status$/i,
  /^state$/i,
  /^type$/i,
  /^direction$/i,
  /^kind$/i,
  /^mode$/i,
  /^role$/i,
  /^bucket$/i,
  /^gateway$/i,
  /^method$/i,
  /provider/i,
  /external/i,
  /reference/i,
  /idempotency/i,
];

const ROLE_BY_PATH_PATTERNS: [RegExp, string][] = [
  [/\/controllers?\//, 'controller'],
  [/\/services?\//, 'service'],
  [/\/workers?\//, 'worker'],
  [/\/queues?\//, 'queue_processor'],
  [/\/cron[s]?\//, 'cron_job'],
  [/\/webhooks?\//, 'webhook_handler'],
  [/\/hooks?\//, 'hook'],
  [/\/middlewares?\//, 'middleware'],
  [/\/guards?\//, 'guard'],
  [/\/resolvers?\//, 'resolver'],
  [/\/seeds?\//, 'seed'],
  [/\/scripts?\//, 'script'],
];

const STATIC_ANALYSIS_ROLE_MAP: Record<string, string> = {
  controller: 'controller',
  controllers: 'controller',
  service: 'service',
  services: 'service',
  worker: 'worker',
  workers: 'worker',
  queue_processor: 'queue_processor',
  queue: 'queue_processor',
  'queues/': 'queue_processor',
  cron: 'cron_job',
  crons: 'cron_job',
  webhook: 'webhook_handler',
  webhooks: 'webhook_handler',
};

function classifySourceRole(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  for (const [pattern, role] of ROLE_BY_PATH_PATTERNS) {
    if (pattern.test(normalized)) return role;
  }
  const basename = path.basename(filePath, path.extname(filePath));
  for (const [suffix, role] of Object.entries(STATIC_ANALYSIS_ROLE_MAP)) {
    if (basename.endsWith(`.${suffix}`) || basename.includes(`.${suffix}`)) {
      return role;
    }
  }
  return 'unknown';
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

function parseModelFields(schemaContent: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  let match: RegExpExecArray | null;
  MODEL_REGEX.lastIndex = 0;
  while ((match = MODEL_REGEX.exec(schemaContent)) !== null) {
    const modelName = match[1];
    const openBraceIdx = schemaContent.indexOf('{', match.index);
    if (openBraceIdx === -1) continue;

    const block = extractModelBlock(schemaContent, openBraceIdx);

    const fields: string[] = [];
    const lines = block.text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
      const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)/);
      if (fieldMatch) {
        fields.push(fieldMatch[1]);
      }
    }

    result.set(modelName, fields);
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

export function classifyFinancialModel(_modelName: string, fields: string[] = []): boolean {
  // 1. Field-based heuristic: >= 2 money-like fields
  const moneyLikeFields = fields.filter((field) =>
    MONEY_LIKE_FIELD_PATTERNS.some((pattern) => pattern.test(field)),
  );
  if (moneyLikeFields.length >= 2) {
    return true;
  }

  // 2. Balance + currency pattern (catches PrepaidWallet, Treasury, ConnectAccountBalance)
  const hasBalance = fields.some((f) => /\bbalance\b/i.test(f));
  const hasCurrency = fields.some((f) => /^currency$/i.test(f));
  if (hasBalance && hasCurrency) {
    return true;
  }

  return false;
}

export function detectPIIFields(_modelName: string, fields: string[]): string[] {
  return fields.filter((field) => PII_FIELD_PATTERNS.some((pattern) => pattern.test(field)));
}

function hasBuiltInAuditTrail(fields: string[]): boolean {
  return AUDIT_FIELD_PATTERNS.some((pattern) => fields.some((f) => pattern.test(f)));
}

/**
 * Checks if a model has a workspaceId field for tenant isolation.
 */
function hasWorkspaceIsolation(fields: string[]): boolean {
  return fields.some((f) => /^workspaceId$/i.test(f));
}

/**
 * Checks if a model has mutable state fields (enum status/state/type) that are
 * candidates for version/history tracking.
 */
function hasMutableStateFields(fields: string[]): boolean {
  return fields.some((f) => MUTATION_STATE_FIELD_PATTERNS.some((pattern) => pattern.test(f)));
}

/**
 * Detects whether a model likely has a version/history tracking table by
 * checking if a FlowVersion-like model exists. E.g., FlowVersion for Flow.
 */
function hasVersionTable(modelName: string, allModelNames: string[]): boolean {
  return allModelNames.some(
    (m) =>
      m !== modelName &&
      (m === `${modelName}Version` ||
        m === `${modelName}History` ||
        m === `${modelName}Audit` ||
        m === `${modelName}Log` ||
        m.startsWith(modelName)),
  );
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
    if (!MUTATION_STATE_FIELD_PATTERNS.some((p) => p.test(field))) continue;
    const findTypeInBlock = new RegExp(`^\\s*${field}\\s+(\\w+)`, 'm');
    const typeMatch = findTypeInBlock.exec(block.text);
    if (typeMatch) {
      const typeHint = typeMatch[1];
      const possibleEnumNames = [typeHint, `${typeHint}Status`, `${typeHint}State`];
      for (const enumName of possibleEnumNames) {
        if (enums.has(enumName)) {
          result.set(field, { enumName, members: enums.get(enumName)! });
          break;
        }
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
          const role = classifySourceRole(fullPath);
          const source = role;

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

          // Check for explicit AuditLog usage patterns in this file
          AUDITLOG_CREATE_REGEX.lastIndex = 0;
          let auditMatch: RegExpExecArray | null;
          while ((auditMatch = AUDITLOG_CREATE_REGEX.exec(content)) !== null) {
            // Find the resource/model being audited in nearby lines
            const beforeCtx = content.slice(Math.max(0, auditMatch.index - 300), auditMatch.index);
            for (const modelName of modelNames) {
              const lowerModel = modelName.toLowerCase();
              if (
                beforeCtx.includes(modelName) ||
                beforeCtx.includes(lowerModel) ||
                beforeCtx.includes(`'${lowerModel}'`) ||
                beforeCtx.includes(`"${lowerModel}"`) ||
                beforeCtx.includes(`resource: '${lowerModel}'`) ||
                beforeCtx.includes(`resource: "${lowerModel}"`)
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
            const route = relativePath
              .replace(/^pages\//, '/')
              .replace(/\.[jt]sx?$/, '')
              .replace(/\/index$/, '')
              .replace(/\[\.\.\.([^\]]+)\]/g, ':$1*')
              .replace(/\[([^\]]+)\]/g, ':$1');
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
  const enums = parseEnums(schemaContent);

  const entities: EntityLifecycle[] = [];
  const mutations: DataflowStateMutation[] = [];
  const gaps: DataflowState['gaps'] = [];
  const rawOps = scanBackendOperations(rootDir, modelNames) as Map<
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

    const fields = modelFields.get(modelName) ?? [];
    const financial = classifyFinancialModel(modelName, fields);
    const hasAudit = hasBuiltInAuditTrail(fields);
    const piiFields = detectPIIFields(modelName, fields);
    const shownInUI = findModelInUI(rootDir, modelName);
    const hasWorkspace = hasWorkspaceIsolation(fields);
    const mutableStateFields = fields.filter((f) =>
      MUTATION_STATE_FIELD_PATTERNS.some((p) => p.test(f)),
    );
    const hasMutableState = mutableStateFields.length > 0;
    const hasVersion = hasVersionTable(modelName, modelNames);

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
    if (!hasWorkspace && modelName !== 'Workspace') {
      const severity = financial ? ('critical' as const) : ('high' as const);
      gaps.push({
        model: modelName,
        missing: `Model "${modelName}" is missing workspaceId field — no tenant isolation${financial ? ' (FINANCIAL MODEL)' : ''}`,
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

    // ── Gap: financial model without explicit AuditLog usage ──
    if (financial && explicitAuditLogFiles.length === 0) {
      gaps.push({
        model: modelName,
        missing: `Financial model "${modelName}" has no detected auditLog.create usage in its service files`,
        severity: 'high',
      });
    }

    // ── Gap: PII fields on financial model without audit trail ──
    if (financial && piiFields.length > 0 && !hasAudit) {
      gaps.push({
        model: modelName,
        missing: `Financial model "${modelName}" with PII fields (${piiFields.join(', ')}) has no createdAt/updatedAt/deletedAt audit columns and no explicit AuditLog usage`,
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
      hasAuditTrail: hasAudit || explicitAuditLogFiles.length > 0,
      piiFields,
      hasWorkspaceIsolation: hasWorkspace,
      hasMutableState,
      hasVersionHistory: hasVersion,
      stateMachine: stateMachine.length > 0 ? stateMachine : undefined,
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
