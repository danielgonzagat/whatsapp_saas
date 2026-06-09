// Prisma scanner — reads backend/prisma/schema.prisma and gives a lightweight
// model+relation index. Pure regex; good enough for navigation.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function createPrismaScanner({ workspaceRoot }) {
  const schemaPath = join(workspaceRoot, 'backend', 'prisma', 'schema.prisma');

  let cache = null;

  function load() {
    if (cache) return cache;
    if (!existsSync(schemaPath)) {
      cache = { ok: false, error: 'schema.prisma not found' };
      return cache;
    }
    const text = readFileSync(schemaPath, 'utf8');
    const models = [];
    const lines = text.split(/\r?\n/);
    let current = null;
    let depth = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!current) {
        const m = line.match(/^model\s+([A-Za-z_][\w]*)\s*\{/);
        if (m) {
          current = { name: m[1], line: i + 1, fields: [], relations: [] };
          depth = 1;
        }
        continue;
      }
      depth += (line.match(/\{/g) || []).length;
      depth -= (line.match(/\}/g) || []).length;
      if (depth <= 0) {
        models.push(current);
        current = null;
        continue;
      }
      // Field/relation parse: "name Type modifiers..." (ignore @blocks-only lines).
      const stripped = line.trim();
      if (!stripped || stripped.startsWith('//') || stripped.startsWith('@@')) continue;
      const fm = stripped.match(/^([A-Za-z_][\w]*)\s+([A-Za-z_][\w?\[\]]*)/);
      if (fm) {
        const field = { name: fm[1], type: fm[2], line: i + 1, raw: stripped };
        current.fields.push(field);
        const baseType = fm[2].replace(/[\[\]?]/g, '');
        const PRIMITIVES = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes', 'Unsupported']);
        if (/^[A-Z]/.test(baseType) && !PRIMITIVES.has(baseType)) {
          current.relations.push({ field: fm[1], related: baseType, array: fm[2].includes('['), optional: fm[2].endsWith('?') });
        }
      }
    }
    cache = { ok: true, models, schemaPath };
    return cache;
  }

  function findModel(name) {
    const { ok, models } = load();
    if (!ok) return load();
    const lower = name.toLowerCase();
    const exact = models.find((m) => m.name === name);
    if (exact) return { ok: true, model: exact };
    const ci = models.find((m) => m.name.toLowerCase() === lower);
    if (ci) return { ok: true, model: ci };
    const partial = models.filter((m) => m.name.toLowerCase().includes(lower));
    return { ok: true, model: null, candidates: partial.map((m) => ({ name: m.name, line: m.line })) };
  }

  function listModels() {
    const { ok, models, error } = load();
    if (!ok) return { ok: false, error };
    return {
      ok: true,
      models: models.map((m) => ({ name: m.name, line: m.line, fieldCount: m.fields.length, relations: m.relations.map((r) => r.related) })),
      schemaPath,
    };
  }

  return { load, findModel, listModels };
}
