import * as ts from 'typescript';
import {
  buildRelationFieldMap,
  buildTableNameMap,
  collectModelsFromIncludeSelect,
  collectModelsFromRawSql,
} from '../orphan-prisma/enhanced-detector';
import type { PrismaModel } from '../types.core';

// Build sample models
const sampleModels: PrismaModel[] = [
  {
    name: 'Product',
    accessorName: 'product',
    line: 1,
    fields: [],
    relations: [
      { fieldName: 'checkouts', targetModel: 'ProductCheckout', type: 'many', line: 2 },
      { fieldName: 'urls', targetModel: 'ProductUrl', type: 'many', line: 3 },
    ],
  },
  {
    name: 'ProductCheckout',
    accessorName: 'productCheckout',
    line: 10,
    fields: [],
    relations: [],
  },
  {
    name: 'ProductUrl',
    accessorName: 'productUrl',
    line: 20,
    fields: [],
    relations: [],
  },
];

const relationMap = buildRelationFieldMap(sampleModels);

function parseAndFindInclude(text: string): string[] {
  const src = ts.createSourceFile('test.ts', text, ts.ScriptTarget.Latest, true);
  const models: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      for (const m of collectModelsFromIncludeSelect(node, relationMap)) {
        models.push(m);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return models;
}

// Test 1: include with checkouts
console.log('Test 1 - include: { checkouts: true }');
const r1 = parseAndFindInclude(
  `this.prisma.product.findFirst({ include: { checkouts: true } })`,
);
console.log('Found:', r1);
console.assert(r1.includes('productCheckout'), 'Expected productCheckout');

// Test 2: select nested
console.log('\nTest 2 - select: { urls: true }');
const r2 = parseAndFindInclude(
  `this.prisma.product.findFirst({ select: { urls: true } })`,
);
console.log('Found:', r2);
console.assert(r2.includes('productUrl'), 'Expected productUrl');

// Test 3: include with non-relation field
console.log('\nTest 3 - include non-relation field (should be empty)');
const r3 = parseAndFindInclude(
  `this.prisma.product.findFirst({ include: { id: true } })`,
);
console.log('Found:', r3);
console.assert(r3.length === 0, 'Expected empty');

// Test 4: no include/select
console.log('\nTest 4 - no include/select (should be empty)');
const r4 = parseAndFindInclude(
  `this.prisma.product.findFirst({ where: { id: 'x' } })`,
);
console.log('Found:', r4);
console.assert(r4.length === 0, 'Expected empty');

// Test 5: transaction with include
console.log('\nTest 5 - transaction tx.product.findFirst({ include: { checkouts: true } })');
const r5 = parseAndFindInclude(
  `tx.product.findFirst({ include: { checkouts: true } })`,
);
console.log('Found:', r5);
console.assert(r5.includes('productCheckout'), 'Expected productCheckout');

// Test 6: Raw SQL detection
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
const tableMap = buildTableNameMap(schemaContent);
console.log('\nTable map:', JSON.stringify([...tableMap.entries()]));

function parseAndFindRawSql(text: string): string[] {
  const src = ts.createSourceFile('test.ts', text, ts.ScriptTarget.Latest, true);
  const models: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) || ts.isTaggedTemplateExpression(node)) {
      for (const m of collectModelsFromRawSql(node, tableMap)) {
        models.push(m);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return models;
}

console.log('\nTest 7 - $queryRaw with template literal');
const r7 = parseAndFindRawSql('await prisma.\$queryRaw\`SELECT * FROM "RAC_ProductCheckout"\`');
console.log('Found:', r7);
console.assert(r7.includes('productCheckout'), 'Expected productCheckout');

console.log('\nTest 8 - $executeRaw with string');
const r8 = parseAndFindRawSql('await prisma.\$executeRaw`DELETE FROM "RAC_ProductUrl" WHERE id = \$1`');
console.log('Found:', r8);
console.assert(r8.includes('productUrl'), 'Expected productUrl');

console.log('\nTest 9 - non-raw query (should be empty)');
const r9 = parseAndFindRawSql('await prisma.productCheckout.findFirst()');
console.log('Found:', r9);
console.assert(r9.length === 0, 'Expected empty');

console.log('\nAll tests passed!');
