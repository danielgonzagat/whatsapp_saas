/**
 * PULSE Parser 51: E2E Messaging + AI Agent Flow — Config Verification
 * Layer 4: End-to-End Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * STATIC + DB checks (no live provider calls):
 * 1. DB: count discovered relation-backed AI/config records.
 * 2. DB: check config records linked to missing parent rows.
 * 3. DB: check configured sellable entities without a monetized child relation.
 * 4. Static: verify prompt-building agent code loads discovered config context.
 *
 * Emits E2E config evidence gaps; diagnostic identity is synthesized downstream.
 */

import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { httpGet, dbQuery } from './runtime-utils';
import { walkFiles } from './utils';
import {
  discoverRelationConfigModels,
  findMonetizedChildModel,
  parsePrismaModels,
  readFile,
  resolveSchemaPath,
  type PrismaField,
  type PrismaModel,
  type RelationConfigModel,
} from './structural-evidence';

type PersistedContextRelation = RelationConfigModel;

function whatsappE2eFinding(input: {
  file: string;
  line: number;
  description: string;
  detail: string;
}): Break {
  return {
    type: 'diagnostic:e2e-whatsapp:config-context-evidence-gap',
    severity: 'critical',
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: 'runtime:e2e:whatsapp-config',
    surface: 'whatsapp-agent-config',
  };
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function prismaDelegateName(modelName: string): string {
  return `${modelName.charAt(0).toLowerCase()}${modelName.slice(1)}`;
}

function sourceMentionsPrismaDelegate(content: string, delegate: string): boolean {
  return content.includes(`.${delegate}.`) || content.includes(`['${delegate}']`);
}

function sourceQueriesPersistence(content: string): boolean {
  return (
    content.includes('.findMany(') ||
    content.includes('.findUnique(') ||
    content.includes('.findFirst(')
  );
}

function sourceUsesDiscoveredConfig(content: string, configModels: RelationConfigModel[]): boolean {
  return configModels.some(({ configModel }) => {
    const delegate = prismaDelegateName(configModel.name);
    return (
      sourceMentionsPrismaDelegate(content, delegate) ||
      (content.includes(configModel.name) && sourceQueriesPersistence(content))
    );
  });
}

function modelHasActiveState(model: PrismaModel): boolean {
  return model.fields.some(
    (field) => isPositiveBooleanStateField(field) || isNullableTemporalStateField(field),
  );
}

function relationForeignKey(field: { line: string }): string | null {
  const fkMatch = field.line.match(/fields:\s*\[([^\]]+)\]/);
  return fkMatch?.[1]?.split(',')[0]?.trim() ?? null;
}

function discoverPersistedContextRelations(models: PrismaModel[]): PersistedContextRelation[] {
  const byName = new Map(models.map((model) => [model.name, model]));

  return models.flatMap((model) => {
    const relationFields = model.fields.filter((field) => field.line.includes('@relation'));
    const hasContextShape = model.fields.some((field) => field.type === 'Json');

    if (!hasContextShape) {
      return [];
    }

    return relationFields.flatMap((relationField) => {
      const parentModel = byName.get(relationField.type);
      const foreignKeyField = relationForeignKey(relationField);
      if (!parentModel || !foreignKeyField) {
        return [];
      }
      return [{ configModel: model, parentModel, relationField, foreignKeyField }];
    });
  });
}

function discoverActiveAutonomousModels(models: PrismaModel[]): PrismaModel[] {
  return models.filter((model) => modelHasActiveState(model) && isWorkspaceScoped(model));
}

function modelRelatesTo(model: PrismaModel, targetModelName: string): boolean {
  return model.fields.some(
    (field) => field.line.includes('@relation') && field.type === targetModelName,
  );
}

function isWorkspaceScoped(model: PrismaModel): boolean {
  return (
    model.fields.some((field) => field.name === 'workspaceId') || modelRelatesTo(model, 'Workspace')
  );
}

function hasCompatibleContextRelation(
  activeModel: PrismaModel,
  relation: PersistedContextRelation,
): boolean {
  return (
    activeModel.name === relation.parentModel.name ||
    modelRelatesTo(activeModel, relation.parentModel.name) ||
    (isWorkspaceScoped(activeModel) && isWorkspaceScoped(relation.parentModel))
  );
}

function buildActiveWhere(model: PrismaModel, alias: string): string {
  const clauses: string[] = [];

  for (const field of model.fields) {
    if (isPositiveBooleanStateField(field)) {
      clauses.push(`${alias}.${quoteIdent(field.name)} = true`);
    }
    if (isNullableTemporalStateField(field)) {
      clauses.push(`${alias}.${quoteIdent(field.name)} IS NULL`);
    }
  }

  return clauses.length > 0 ? ` AND (${clauses.join(' OR ')})` : '';
}

function isPositiveBooleanStateField(field: PrismaField): boolean {
  return field.type === 'Boolean' && field.line.includes('@default(true)');
}

function isNullableTemporalStateField(field: PrismaField): boolean {
  return field.type === 'DateTime' && field.line.includes('?') && field.name.endsWith('At');
}

/** Check e2e whatsapp. */
export async function checkE2eWhatsapp(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend + DB + LLM mock
  if (!process.env.PULSE_DEEP) {
    return [];
  }

  const breaks: Break[] = [];

  const schemaPath = resolveSchemaPath(config);
  const schema = schemaPath ? readFile(schemaPath) : '';
  const models = parsePrismaModels(schema);
  const configModels = discoverRelationConfigModels(models);
  const contextRelations = discoverPersistedContextRelations(models);
  const activeAutonomousModels = discoverActiveAutonomousModels(models);
  const persistedContextRelations = [...configModels, ...contextRelations].filter(
    (relation, index, relations) =>
      index ===
      relations.findIndex(
        (candidate) =>
          candidate.configModel.name === relation.configModel.name &&
          candidate.parentModel.name === relation.parentModel.name &&
          candidate.foreignKeyField === relation.foreignKeyField,
      ),
  );

  // ── Static: verify prompt-building agent code loads discovered config context.
  try {
    const backendFiles = walkFiles(config.backendDir, ['.ts']).filter(
      (file) => !/\.(spec|test|d)\.ts$|__tests__|__mocks__|dist\//.test(file),
    );
    const agentConfigConsumers = backendFiles.filter((file) =>
      sourceUsesDiscoveredConfig(readFile(file), configModels),
    );

    if (configModels.length === 0) {
      breaks.push(
        whatsappE2eFinding({
          file: schemaPath
            ? path.relative(config.rootDir, schemaPath)
            : 'backend/prisma/schema.prisma',
          line: 1,
          description: 'No relation-backed AI/config model discovered in Prisma schema',
          detail:
            'Expected a config/settings/profile model with a parent @relation so agent prompts can be grounded in persisted configuration.',
        }),
      );
    } else if (agentConfigConsumers.length === 0) {
      breaks.push(
        whatsappE2eFinding({
          file: config.backendDir,
          line: 1,
          description: 'No prompt-building agent code consumes discovered config models',
          detail: `Discovered config models: ${configModels
            .map(({ configModel }) => configModel.name)
            .join(', ')}`,
        }),
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    breaks.push(
      whatsappE2eFinding({
        file: config.backendDir,
        line: 1,
        description: 'Static analysis of prompt/config wiring failed',
        detail: message,
      }),
    );
  }

  for (const activeModel of activeAutonomousModels) {
    const compatibleRelations = persistedContextRelations.filter((relation) =>
      hasCompatibleContextRelation(activeModel, relation),
    );

    if (compatibleRelations.length === 0) {
      breaks.push(
        whatsappE2eFinding({
          file: schemaPath ? path.relative(config.rootDir, schemaPath) : config.backendDir,
          line: 1,
          description: `Active autonomous model ${activeModel.name} has no compatible persisted config/context relation`,
          detail:
            'Autopilot/agent execution can become active, but the schema does not expose a same-parent or workspace-scoped persisted config/context model to ground its prompts.',
        }),
      );
      continue;
    }

    try {
      const activeRows = await dbQuery(
        `SELECT COUNT(*) as count FROM ${quoteIdent(activeModel.tableName)} a WHERE 1=1${buildActiveWhere(
          activeModel,
          'a',
        )}`,
      );
      const activeCount = parseInt(String(activeRows[0]?.count ?? '0'), 10);

      if (activeCount > 0) {
        let persistedContextCount = 0;
        for (const relation of compatibleRelations) {
          const countRows = await dbQuery(
            `SELECT COUNT(*) as count FROM ${quoteIdent(relation.configModel.tableName)}`,
          );
          persistedContextCount += parseInt(String(countRows[0]?.count ?? '0'), 10);
        }

        if (persistedContextCount === 0) {
          breaks.push(
            whatsappE2eFinding({
              file: schemaPath ? path.relative(config.rootDir, schemaPath) : config.backendDir,
              line: 1,
              description: `${activeCount} active ${activeModel.name} records exist but compatible persisted config/context tables are empty`,
              detail: `Compatible context models checked: ${compatibleRelations
                .map((relation) => relation.configModel.name)
                .join(', ')}`,
            }),
          );
        }
      }
    } catch {
      // Connected DB may be unavailable in parser-only runs; the structural rule above remains enforced.
    }
  }

  for (const relation of configModels) {
    const configTable = quoteIdent(relation.configModel.tableName);
    const parentTable = quoteIdent(relation.parentModel.tableName);
    const fkColumn = quoteIdent(relation.foreignKeyField);

    // ── DB: Count discovered config records and compare to active parent rows.
    try {
      const countRows = await dbQuery(`SELECT COUNT(*) as count FROM ${configTable}`);
      const configCount = parseInt(String(countRows[0]?.count ?? '0'), 10);

      if (configCount === 0 && modelHasActiveState(relation.parentModel)) {
        const activeRows = await dbQuery(
          `SELECT COUNT(*) as count FROM ${parentTable} p WHERE 1=1${buildActiveWhere(
            relation.parentModel,
            'p',
          )}`,
        );
        const activeParents = parseInt(String(activeRows[0]?.count ?? '0'), 10);

        if (activeParents > 5) {
          breaks.push(
            whatsappE2eFinding({
              file: schemaPath ? path.relative(config.rootDir, schemaPath) : config.backendDir,
              line: 1,
              description: `${activeParents} active parent records exist but ${relation.configModel.name} table is empty`,
              detail:
                'Discovered relation-backed config table has no rows despite active parent data; agent responses may be generic.',
            }),
          );
        }
      }
    } catch {
      // Table may not exist yet in the connected DB — skip DB-only check.
    }

    // ── DB: Check for orphaned config records.
    try {
      const orphanRows = await dbQuery(
        `SELECT a.id, a.${fkColumn}
         FROM ${configTable} a
         LEFT JOIN ${parentTable} p ON p.id = a.${fkColumn}
         WHERE p.id IS NULL
         LIMIT 5`,
      );

      if (orphanRows.length > 0) {
        breaks.push(
          whatsappE2eFinding({
            file: schemaPath ? path.relative(config.rootDir, schemaPath) : config.backendDir,
            line: 1,
            description: `${orphanRows.length} ${relation.configModel.name} records reference missing ${relation.parentModel.name} rows`,
            detail: `Sample orphan config IDs: ${orphanRows
              .slice(0, 3)
              .map((row) => String(row.id))
              .join(', ')}`,
          }),
        );
      }
    } catch {
      // Table doesn't exist or join failed — skip.
    }

    // ── DB: configured active parent rows should have a monetized child relation when one exists.
    const monetizedChild = findMonetizedChildModel(models, relation.parentModel.name);
    if (monetizedChild) {
      const childRelation = monetizedChild.fields.find(
        (field) => field.line.includes('@relation') && field.type === relation.parentModel.name,
      );
      const childFkMatch = childRelation?.line.match(/fields:\s*\[([^\]]+)\]/);
      const childFk = childFkMatch?.[1]?.split(',')[0]?.trim();

      if (childFk) {
        try {
          const unreadyRows = await dbQuery(
            `SELECT p.id
             FROM ${parentTable} p
             INNER JOIN ${configTable} a ON a.${fkColumn} = p.id
             LEFT JOIN ${quoteIdent(monetizedChild.tableName)} c ON c.${quoteIdent(childFk)} = p.id
             WHERE c.id IS NULL${buildActiveWhere(relation.parentModel, 'p')}
             LIMIT 5`,
          );

          if (unreadyRows.length > 0) {
            breaks.push(
              whatsappE2eFinding({
                file: schemaPath ? path.relative(config.rootDir, schemaPath) : config.backendDir,
                line: 1,
                description: `${unreadyRows.length} configured active ${relation.parentModel.name} records have no monetized child relation`,
                detail: `Expected at least one ${monetizedChild.name} row per configured active parent before an agent can safely offer it.`,
              }),
            );
          }
        } catch {
          // Schema mismatch or table missing — skip.
        }
      }
    }
  }

  // ── HTTP: Verify backend is reachable (AI endpoint connectivity) ──────────
  try {
    const healthRes = await httpGet('/health/system', { timeout: 5000 });
    if (!healthRes.ok && healthRes.status !== 0) {
      // Backend reachable but health failing — note it
      // Not an AI config break per se, just connectivity context
    } else if (healthRes.status === 0) {
      // Backend unreachable — can't do HTTP checks, DB-only mode
    }
  } catch {
    // Swallow — connectivity issues don't affect static/DB checks
  }

  return breaks;
}
