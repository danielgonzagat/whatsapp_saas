import type { AstCallEdge } from '../types.ast-graph';
import type { PulseStructuralEdge } from '../types.structural';

export interface AstGraphContext {
  edges: AstCallEdge[];
  symbols: Map<
    string,
    {
      name: string;
      kind: string;
      filePath: string;
      httpMethod?: string | null;
      routePath?: string | null;
    }
  >;
}

export interface StructuralGraphContext {
  edges: PulseStructuralEdge[];
  nodeFiles: Record<string, string>;
}
