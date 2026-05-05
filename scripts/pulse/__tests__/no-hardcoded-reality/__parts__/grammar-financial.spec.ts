import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { auditPulseNoHardcodedReality } from '../../no-hardcoded-reality-audit';
import { classifyFinancialModel } from '../../dataflow-engine';
import { classifyEndpointRisk as classifyPropertyEndpointRisk } from '../../property-tester';
import { classifySurface, classifyModuleCandidate } from '../../scope-state.classify';
import { detectNewFile } from '../../scope-engine';
import { classifyWatchChange } from '../../watch-classifier';
import { discoverPlugins } from '../../plugin-system';
import { deriveZeroValue, deriveUnitValue } from '../../dynamic-reality-kernel';

import { countPulseSourceFiles, currentPulseCoreAudit, endpointProbe } from './helpers.spec';

describe('PULSE no-hardcoded-reality contracts', () => {
  it('still records structural grammar literals as hardcode surface', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-branch-grammar-'));
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'grammar-branches.ts'),
      [
        'export function parseSyntaxToken(input: { token: string }) {',
        '  switch (input.token) {',
        "    case 'identifier':",
        "      return 'name';",
        "    case 'literal':",
        "      return 'value';",
        '    default:',
        "      return 'unknown';",
        '  }',
        '}',
      ].join('\n'),
    );

    const findings = auditPulseNoHardcodedReality(rootDir).findings;
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'hardcoded_literal_surface_risk',
          samples: ['identifier'],
        }),
      ]),
    );
    expect(findings.some((finding) => finding.kind === 'hardcoded_decision_enum_risk')).toBe(false);
  });

  it('reports core PULSE hardcoded reality decision collection backlog', () => {
    const result = currentPulseCoreAudit;

    expect(result.scannedFiles).toBeGreaterThan(deriveZeroValue());
    expect(result.scannedFiles).toBe(countPulseSourceFiles(process.cwd()));
    expect(result.summary.totalFindings).toBeGreaterThan(deriveZeroValue());
    expect(result.summary.byKind.hardcoded_literal_surface_risk).toBeGreaterThan(deriveZeroValue());
  });

  it('treats cert constants regex groups as Break.type kernel grammar, not decision authority', () => {
    const result = currentPulseCoreAudit;
    const certConstantFindings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/cert-constants.ts',
    );

    expect(certConstantFindings.length).toBeGreaterThan(deriveZeroValue());
    expect(certConstantFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'hardcoded_const_declaration_risk',
          samples: ['SECURITY_BREAK_TYPE_KERNEL_GRAMMAR'],
        }),
        expect.objectContaining({
          kind: 'hardcoded_const_declaration_risk',
          samples: ['CHECKER_GAP_TYPES'],
        }),
      ]),
    );
  });

  it('does not seed built-in product domain packs from the core', () => {
    const plugins = discoverPlugins(path.join(process.cwd(), '__pulse_no_plugins__'));

    expect(plugins).toEqual([]);
  });

  it('classifies scope surfaces from discovered package and tsconfig signals', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-dynamic-surfaces-'));
    const nextDir = path.join(rootDir, 'customer-ui');
    const nestDir = path.join(rootDir, 'api-core');
    const pulseDir = path.join(rootDir, 'tooling/pulse');
    fs.mkdirSync(path.join(nextDir, 'src/app'), { recursive: true });
    fs.mkdirSync(path.join(nestDir, 'src'), { recursive: true });
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(nextDir, 'package.json'),
      JSON.stringify({ name: 'customer-ui', dependencies: { next: '1.0.0' } }),
    );
    fs.writeFileSync(
      path.join(nestDir, 'package.json'),
      JSON.stringify({ name: 'api-core', dependencies: { '@nestjs/core': '1.0.0' } }),
    );
    fs.writeFileSync(path.join(pulseDir, 'tsconfig.json'), JSON.stringify({ include: ['*.ts'] }));
    fs.writeFileSync(path.join(pulseDir, 'scanner.ts'), 'export const scanner = true;');

    expect(classifySurface('customer-ui/src/app/page.tsx', false, rootDir)).toBe('frontend');
    expect(classifySurface('api-core/src/controller.ts', false, rootDir)).toBe('backend');
    expect(classifySurface('tooling/pulse/scanner.ts', false, rootDir)).toBe('scripts');
    expect(classifyModuleCandidate('customer-ui/src/app/orders/page.tsx', rootDir)).toBe('orders');
  });

  it('classifies watched files from discovered workspace shape', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-dynamic-watch-'));
    const appDir = path.join(rootDir, 'ui-shell');
    fs.mkdirSync(path.join(appDir, 'src/app'), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, 'package.json'),
      JSON.stringify({ name: 'ui-shell', dependencies: { next: '1.0.0' } }),
    );
    const watchedFile = path.join(appDir, 'src/app/page.tsx');
    fs.writeFileSync(watchedFile, 'export default function Page() { return null; }');

    expect(
      classifyWatchChange(watchedFile, {
        rootDir,
        schemaPath: path.join(rootDir, 'db/schema.prisma'),
      } as PulseConfig),
    ).toBe('frontend');
  });

  it('does not classify a model as financial from name alone', () => {
    expect(classifyFinancialModel('Payment', ['id', 'createdAt', 'updatedAt'])).toBe(false);
  });

  it('does not classify money-like state from field names without schema/type evidence', () => {
    expect(classifyFinancialModel('Xpto', ['id', 'amountCents', 'currency', 'status'])).toBe(false);
  });

  it('classifies API risk from contract shape instead of product path words', () => {
    expect(
      classifyEndpointRisk(
        endpointProbe({ path: '/checkout', filePath: 'backend/src/payment.ts' }),
      ),
    ).toBe('low');

    expect(
      classifyEndpointRisk(
        endpointProbe({
          method: 'POST',
          path: '/xpto',
          filePath: 'backend/src/opaque/controller.ts',
          requiresAuth: false,
          requestSchema: { dtoType: 'CreateOpaqueDto', source: 'inferred' },
        }),
      ),
    ).toBe('critical');
  });

  it('classifies property fuzz endpoint risk from request shape instead of product words', () => {
    expect(
      classifyPropertyEndpointRisk({ method: 'GET', path: '/payment', filePath: 'opaque.ts' }),
    ).toBe('low');
    expect(
      classifyPropertyEndpointRisk({ method: 'DELETE', path: '/xpto/:id', filePath: 'opaque.ts' }),
    ).toBe('high');
  });
});
