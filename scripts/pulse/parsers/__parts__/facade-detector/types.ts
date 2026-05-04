import type { FacadeEntry } from '../../../types';

export interface FunctionRange {
  startLine: number;
  endLine: number;
  body: string;
  node: import('typescript').Node;
}

export interface FacadeDiagnosticInput {
  detector: string;
  kind: FacadeEntry['type'];
  severity: FacadeEntry['severity'];
  file: string;
  line: number;
  summary: string;
  detail: string;
  evidence: string;
  surface: string;
  runtimeImpact?: number;
}
