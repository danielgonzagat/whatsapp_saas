/**
 * Orphan Prisma detector specs — test the enhanced detection patterns
 * and verify that real orphans are still detected.
 */
import {
  buildRelationFieldMap,
  buildTableNameMap,
  collectModelsFromIncludeSelect,
  collectModelsFromRawSql,
} from '../enhanced-detector';
import type { PrismaModel } from '../../types.core';
import * as ts from 'typescript';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeModel(name: string, relations: Array<{ fieldName: string; targetModel: string; type: 'one' | 'many' }> = []): PrismaModel {
  return {
    name,
    accessorName: name.charAt(0).toLowerCase() + name.slice(1),
    line: 1,
    fields: [{ name: 'id', type: 'String', line: 2, isOptional: false, isArray: false, isId: true }],
    relations: relations.map((r) => ({ ...r, line: 0 })),
  };
}

function parseAndFindInclude(text: string, models: PrismaModel[]): string[] {
  const relationMap = buildRelationFieldMap(models);
  const src = ts.createSourceFile('test.ts', text, ts.ScriptTarget.Latest, true);
  const result: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      for (const m of collectModelsFromIncludeSelect(node, relationMap)) {
        result.push(m);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return result;
}

function parseAndFindRawSql(text: string, schemaContent: string): string[] {
  const tableMap = buildTableNameMap(schemaContent);
  const src = ts.createSourceFile('test.ts', text, ts.ScriptTarget.Latest, true);
  const result: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) || ts.isTaggedTemplateExpression(node)) {
      for (const m of collectModelsFromRawSql(node, tableMap)) {
        result.push(m);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return result;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  PASS: ${message}`);
  }
}

// ── Pattern 1: Bracket Notation ───────────────────────────────────────────

console.log('\n═══ Pattern 1: Bracket Notation ═══');

// String literal bracket notation is already handled by expressionParts
console.log('  (string literal bracket handled by existing code)');

// ── Pattern 2: Include/Select Relations ───────────────────────────────────

console.log('\n═══ Pattern 2: Include/Select Relations ═══');

const productModels = [
  makeModel('Product', [
    { fieldName: 'checkouts', targetModel: 'ProductCheckout', type: 'many' },
    { fieldName: 'urls', targetModel: 'ProductUrl', type: 'many' },
  ]),
  makeModel('ProductCheckout'),
  makeModel('ProductUrl'),
];

const r1 = parseAndFindInclude('prisma.product.findFirst({ include: { checkouts: true } })', productModels);
assert(r1.includes('productCheckout'), 'detects model via include');

const r2 = parseAndFindInclude('prisma.product.findFirst({ select: { urls: true } })', productModels);
assert(r2.includes('productUrl'), 'detects model via select');

const r3 = parseAndFindInclude('prisma.product.findFirst({ include: { id: true } })', productModels);
assert(r3.length === 0, 'ignores non-relation fields in include');

const r4 = parseAndFindInclude('prisma.product.findFirst({ where: { id: "x" } })', productModels);
assert(r4.length === 0, 'no false positive without include/select');

const r5 = parseAndFindInclude('tx.product.findFirst({ include: { checkouts: true } })', productModels);
assert(r5.includes('productCheckout'), 'detects via transaction proxy');

// ── Pattern 3: Raw SQL ────────────────────────────────────────────────────

console.log('\n═══ Pattern 3: Raw SQL ═══');

const schemaContent = `
model ProductCheckout {
  id String @id
  @@map("RAC_ProductCheckout")
}
model ProductUrl {
  id String @id
  @@map("RAC_ProductUrl")
}
`;

const s1 = parseAndFindRawSql('prisma.$queryRaw\`SELECT * FROM "RAC_ProductCheckout"\`', schemaContent);
assert(s1.includes('productCheckout'), 'detects model via \$queryRaw tagged template');

const s2 = parseAndFindRawSql('prisma.$executeRaw\`DELETE FROM "RAC_ProductUrl"\`', schemaContent);
assert(s2.includes('productUrl'), 'detects model via \$executeRaw tagged template');

const s3 = parseAndFindRawSql('prisma.productCheckout.findFirst()', schemaContent);
assert(s3.length === 0, 'no false positive for non-raw query');

const s4 = parseAndFindRawSql('tx.$queryRawUnsafe("SELECT * FROM RAC_ProductUrl")', schemaContent);
assert(s4.includes('productUrl'), 'handles unsafe variant call expression');

// ── Smoke Test: Real Orphan Detection ──────────────────────────────────────

console.log('\n═══ Smoke Test: Real Orphan Detection ═══');

// Test that the expandUsedModelsWithRelations function is transitive
import { expandUsedModelsWithRelations } from '../../graph/graph-part1-core';

const allModels = [
  makeModel('Product', [
    { fieldName: 'checkouts', targetModel: 'ProductCheckout', type: 'many' },
  ]),
  makeModel('ProductCheckout', [
    { fieldName: 'configs', targetModel: 'CheckoutConfig', type: 'many' },
  ]),
  makeModel('CheckoutConfig'),
  makeModel('TrulyOrphan'),
];

const used = new Set<string>(['product']);
expandUsedModelsWithRelations(used, allModels);
assert(used.has('productCheckout'), 'indirectly used model detected via relation');
assert(used.has('checkoutConfig'), 'transitive relation detected');
assert(!used.has('trulyOrphan'), 'truly orphan model still reported');

console.log('\n═══ Results ═══');
const failed = process.exitCode === 1;
console.log(failed ? 'SOME TESTS FAILED' : 'ALL TESTS PASSED');
