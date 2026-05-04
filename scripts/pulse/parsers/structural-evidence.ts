import * as path from 'path';
import { pathExists, readTextFile } from '../safe-fs';
import { safeJoin } from '../safe-path';
import { walkFiles } from './utils';
import type { PulseConfig } from '../types';

export const PERSISTENCE_MUTATION_RE =
  /\b(?:this\.)?(?:prisma|repository|database|db)\.[A-Za-z_$][\w$]*\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;
export const OUTBOUND_CALL_RE =
  /\b(?:fetch|axios|httpService|httpClient|request)\s*(?:<[^>]*>)?\s*\(|\.(?:get|post|put|patch|delete)\s*\(/i;
export const EXTERNAL_SIDE_EFFECT_RE =
  /\b(?:send|publish|enqueue|emit|notify|alert|dispatch|charge|capture|refund|transfer|createSession|createPayment|postMessage)\w*\s*\(/i;
export const BUSINESS_STATE_RE =
  /\b(?:amount|amountCents|total|subtotal|price|priceCents|currency|balance|fee|commission|refund|charge|ledger|transaction|status|state|workspaceId|userId|accountId|customerId)\b/i;
export const TRACE_EVIDENCE_RE =
  /\b(?:x-request-id|x-correlation-id|x-trace-id|correlationId|requestId|traceId|getTraceHeaders|AsyncLocalStorage)\b/i;
export const ALERT_EVIDENCE_RE =
  /(?:\b(?:Sentry|withSentryConfig|SentryExceptionFilter|initSentry|captureException|captureMessage|datadog|dd-trace|newrelic|pagerduty|opsgenie|alertwebhook|alertOn\w+|sendOpsAlert|sendAlert|notifyOps|notifyOncall|opsAlert|criticalAlert|deadLetter|dlq|alerts?:)\b|@sentry\/)/i;
export const METRICS_EVIDENCE_RE =
  /\b(?:prometheus|prom-client|StatsD|metrics?|histogram|counter|gauge|observe|increment|recordMetric|queueDepth|errorRate|latency)\b/i;
export const STRUCTURED_LOG_EVIDENCE_RE =
  /\b(?:logger|Logger)\.\w+\s*\(\s*\{|\b(?:winston|pino)\b|\b(?:event|workspaceId|requestId|correlationId|traceId)\s*:/i;
export const QUEUE_MONITORING_EVIDENCE_RE =
  /\b(?:QueueEvents|failed|completed|stalled|drained|queueDepth|failedJob|deadLetter|dlq|queueHealth|jobCounts|getJobCounts)\b/i;

export interface SourceFileEvidence {
  file: string;
  relFile: string;
  content: string;
}

export interface PrismaField {
  name: string;
  type: string;
  line: string;
}

export interface PrismaModel {
  name: string;
  tableName: string;
  fields: PrismaField[];
}

export interface RelationConfigModel {
  configModel: PrismaModel;
  parentModel: PrismaModel;
  relationField: PrismaField;
  foreignKeyField: string;
}

export function listSourceFiles(
  config: PulseConfig,
  dir: string,
  extensions: string[] = ['.ts'],
): SourceFileEvidence[] {
  return walkFiles(dir, extensions)
    .filter((file) => !/\.(spec|test|d)\.ts$|__tests__|__mocks__|dist\//.test(file))
    .map((file) => ({
      file,
      relFile: path.relative(config.rootDir, file),
      content: readFile(file),
    }))
    .filter((entry) => entry.content.length > 0);
}

export function readFile(file: string): string {
  try {
    return readTextFile(file, 'utf8');
  } catch {
    return '';
  }
}

export function hasRuntimeCriticalSideEffect(content: string): boolean {
  return (
    PERSISTENCE_MUTATION_RE.test(content) ||
    OUTBOUND_CALL_RE.test(content) ||
    EXTERNAL_SIDE_EFFECT_RE.test(content)
  );
}

export function hasBusinessCriticalShape(content: string): boolean {
  return BUSINESS_STATE_RE.test(content) && hasRuntimeCriticalSideEffect(content);
}

export function hasAlertingEvidence(content: string): boolean {
  return ALERT_EVIDENCE_RE.test(content);
}

export function hasMetricsEvidence(content: string): boolean {
  return METRICS_EVIDENCE_RE.test(content);
}

export function hasTracingEvidence(content: string): boolean {
  return TRACE_EVIDENCE_RE.test(content);
}

export function hasStructuredLogEvidence(content: string): boolean {
  return STRUCTURED_LOG_EVIDENCE_RE.test(content);
}

export function resolveSchemaPath(config: PulseConfig): string | null {
  const candidates = [
    config.schemaPath,
    safeJoin(config.rootDir, 'backend/prisma/schema.prisma'),
    safeJoin(config.rootDir, 'prisma/schema.prisma'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function parsePrismaModels(schema: string): PrismaModel[] {
  const models: PrismaModel[] = [];
  const modelRe = /model\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\n\}/g;
  let match: RegExpExecArray | null;

  while ((match = modelRe.exec(schema)) !== null) {
    const [, name, body] = match;
    const mapMatch = body.match(/@@map\(\s*["']([^"']+)["']\s*\)/);
    const fields = body
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) => line && !line.startsWith('//') && !line.startsWith('@@') && !line.startsWith('@'),
      )
      .map((line) => {
        const [fieldName, fieldType] = line.split(/\s+/);
        if (!fieldName || !fieldType) {
          return null;
        }
        return { name: fieldName, type: fieldType.replace(/[?\[\]]/g, ''), line };
      })
      .filter((field): field is PrismaField => Boolean(field));

    models.push({ name, tableName: mapMatch?.[1] ?? name, fields });
  }

  return models;
}

export function discoverRelationConfigModels(models: PrismaModel[]): RelationConfigModel[] {
  const byName = new Map(models.map((model) => [model.name, model]));

  return models.flatMap((model) => {
    const relationFields = model.fields.filter((field) => field.line.includes('@relation'));
    const hasConfigShape =
      /(?:config|setting|profile|prompt|instruction|behavior|preference|policy|rule)/i.test(
        `${model.name} ${model.fields.map((field) => field.name).join(' ')}`,
      ) || model.fields.filter((field) => field.type === 'Json').length >= 2;

    if (!hasConfigShape) {
      return [];
    }

    return relationFields.flatMap((relationField) => {
      const parentModel = byName.get(relationField.type);
      const fkMatch = relationField.line.match(/fields:\s*\[([^\]]+)\]/);
      const foreignKeyField = fkMatch?.[1]?.split(',')[0]?.trim();
      if (!parentModel || !foreignKeyField) {
        return [];
      }
      return [{ configModel: model, parentModel, relationField, foreignKeyField }];
    });
  });
}

export function findMonetizedChildModel(
  models: PrismaModel[],
  parentModelName: string,
): PrismaModel | null {
  return (
    models.find((model) => {
      const relatesToParent = model.fields.some(
        (field) => field.line.includes('@relation') && field.type === parentModelName,
      );
      const hasMonetizedShape = model.fields.some((field) =>
        /(?:amount|price|currency|total|subtotal|fee|balance|commission)/i.test(field.name),
      );
      return relatesToParent && hasMonetizedShape;
    }) ?? null
  );
}
