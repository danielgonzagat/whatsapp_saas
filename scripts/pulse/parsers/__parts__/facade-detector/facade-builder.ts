import type { FacadeEntry } from '../../../types';
import { buildParserDiagnosticBreak } from '../../diagnostic-break';
import type { FacadeDiagnosticInput } from './types';

export function appendFacade(facades: FacadeEntry[], input: FacadeDiagnosticInput): void {
  const diagnostic = buildParserDiagnosticBreak({
    detector: input.detector,
    source: `facade-evidence:${input.detector}`,
    truthMode: 'confirmed_static',
    severity: input.severity,
    file: input.file,
    line: input.line,
    summary: input.summary,
    detail: `${input.detail} Evidence: ${input.evidence}`,
    surface: input.surface,
    runtimeImpact: input.runtimeImpact,
  });
  const facadeType = input.kind;
  facades.push({
    file: diagnostic.file,
    line: diagnostic.line,
    type: facadeType,
    severity: diagnostic.severity,
    description: diagnostic.description,
    evidence: diagnostic.detail ?? input.evidence,
  });
}
