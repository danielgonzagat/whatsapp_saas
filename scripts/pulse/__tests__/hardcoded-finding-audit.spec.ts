import { describe, expect, it } from 'vitest';

import { buildHardcodedFindingAuditArtifact } from '../hardcoded-finding-audit';

describe('hardcoded finding audit', () => {
  it('groups ALLOWED_HEX_COLORS-like allowlists by parser file', () => {
    const artifact = buildHardcodedFindingAuditArtifact([
      {
        filePath: 'scripts/pulse/parsers/visual-design-checker.ts',
        source: [
          "const ALLOWED_HEX_COLORS = ['#0A0A0C', '#E85D30', '#FFFFFF'];",
          'export function parse(): void {',
          '  return;',
          '}',
        ].join('\n'),
      },
    ]);

    expect(artifact).toMatchObject({
      artifact: 'PULSE_HARDCODED_FINDING_AUDIT',
      scannedFiles: 1,
      totalFindings: 1,
      files: [
        {
          filePath: 'scripts/pulse/parsers/visual-design-checker.ts',
          findings: [
            {
              kind: 'fixed_allowlist',
              line: 1,
              column: 7,
              symbol: 'ALLOWED_HEX_COLORS',
            },
          ],
        },
      ],
    });
    expect(artifact.files[0]?.findings[0]?.evidence).toContain('#E85D30');
  });

  it('detects structural decision regexes without product-domain assumptions', () => {
    const artifact = buildHardcodedFindingAuditArtifact([
      {
        filePath: 'scripts/pulse/parsers/route-decision.ts',
        source: [
          'const ROUTE_DECISION_RE = /\\/api\\/(alpha|beta|gamma)\\b/i;',
          'export function parseLine(line: string): boolean {',
          '  return ROUTE_DECISION_RE.test(line);',
          '}',
        ].join('\n'),
      },
    ]);

    expect(artifact.totalFindings).toBe(1);
    expect(artifact.files[0]?.findings[0]).toMatchObject({
      kind: 'decision_token_regex',
      symbol: 'ROUTE_DECISION_RE',
      line: 1,
      column: 7,
    });
    expect(artifact.files[0]?.findings[0]?.reason).toContain('final PULSE truth');
  });

  it('detects regex-only break emitters and fixed break-type mass emitters', () => {
    const artifact = buildHardcodedFindingAuditArtifact([
      {
        filePath: 'scripts/pulse/parsers/security-checker.ts',
        source: [
          'export function parse(content: string): unknown[] {',
          '  const breaks = [];',
          '  if (/password|token/i.test(content)) {',
          "    breaks.push({ type: 'HARDCODED_SECRET', severity: 'high' });",
          '  }',
          '  return breaks;',
          '}',
          "const FIXED_BREAKS = ['ROUTE_NO_AUTH', 'DTO_NO_VALIDATION', 'ENV_NO_FALLBACK'];",
        ].join('\n'),
      },
    ]);

    const kinds = artifact.files.flatMap((file) => file.findings.map((finding) => finding.kind));
    expect(kinds).toContain('regex_only_break_emitter');
    expect(kinds).toContain('fixed_break_type_mass_emitter');
  });

  it('detects direct breaks.push type strings as hardcoded final break identities', () => {
    const artifact = buildHardcodedFindingAuditArtifact([
      {
        filePath: 'scripts/pulse/parsers/final-break-checker.ts',
        source: [
          'export function parse(content: string): unknown[] {',
          '  const breaks = [];',
          "  breaks.push({ type: 'FINAL_STATIC_BREAK', evidence: content });",
          '  return breaks;',
          '}',
        ].join('\n'),
      },
    ]);

    expect(artifact.files[0]?.findings).toEqual([
      expect.objectContaining({
        kind: 'hardcoded_break_push_type_risk',
        symbol: 'FINAL_STATIC_BREAK',
        line: 3,
        column: 15,
      }),
    ]);
  });

  it('does not flag evidence objects without final break type authority', () => {
    const artifact = buildHardcodedFindingAuditArtifact([
      {
        filePath: 'scripts/pulse/parsers/evidence-only-checker.ts',
        source: [
          'export function parse(content: string): unknown[] {',
          "  const evidence = { source: 'runtime', sample: content };",
          '  const breaks = [];',
          '  breaks.push(evidence);',
          '  return breaks;',
          '}',
        ].join('\n'),
      },
    ]);

    expect(artifact.files).toEqual([]);
    expect(artifact.totalFindings).toBe(0);
  });

  it('audits parser-like PULSE sources by code evidence instead of parser path alone', () => {
    const artifact = buildHardcodedFindingAuditArtifact([
      {
        filePath: 'scripts/pulse/no-hardcoded-reality-audit.ts',
        source: [
          'export function auditHardcodedReality(): void {',
          "  const ALLOWED_PULSE_PROFILES = ['scan', 'guidance', 'production-final'];",
          '  void ALLOWED_PULSE_PROFILES;',
          '}',
        ].join('\n'),
      },
    ]);

    expect(artifact.files).toEqual([
      expect.objectContaining({
        filePath: 'scripts/pulse/no-hardcoded-reality-audit.ts',
        findings: [
          expect.objectContaining({
            kind: 'fixed_allowlist',
            symbol: 'ALLOWED_PULSE_PROFILES',
          }),
        ],
      }),
    ]);
    expect(artifact.totalFindings).toBe(1);
  });

  it('ignores PULSE sources without parser-like code evidence', () => {
    const artifact = buildHardcodedFindingAuditArtifact([
      {
        filePath: 'scripts/pulse/no-hardcoded-reality-audit.ts',
        source: "const ALLOWED_HEX_COLORS = ['#000000', '#FFFFFF'];",
      },
    ]);

    expect(artifact.files).toEqual([]);
    expect(artifact.totalFindings).toBe(0);
  });
});
