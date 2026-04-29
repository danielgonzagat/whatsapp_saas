export type EntityOperation = 'create' | 'read' | 'update' | 'delete' | 'upsert';
export type DataflowCoverageStatus = 'observed' | 'inferred' | 'untested' | 'not_applicable';

export interface StatusTransition {
  from: string | null;
  to: string;
  sourceFile: string;
}

export interface StateMachineEntry {
  field: string;
  enumName: string;
  observedTransitions: StatusTransition[];
  totalEnumMembers: number;
  missingEnumMembers?: string[];
}

export interface EntityLifecycle {
  model: string;
  createdBy: Array<{ source: string; filePath: string; status: DataflowCoverageStatus }>;
  readBy: Array<{ source: string; filePath: string; status: DataflowCoverageStatus }>;
  updatedBy: Array<{ source: string; filePath: string; status: DataflowCoverageStatus }>;
  deletedBy: Array<{ source: string; filePath: string; status: DataflowCoverageStatus }>;
  shownInUI: string[];
  critical: boolean;
  financial: boolean;
  hasAuditTrail: boolean;
  piiFields: string[];
  hasWorkspaceIsolation: boolean;
  hasMutableState: boolean;
  hasVersionHistory: boolean;
  stateMachine?: StateMachineEntry[];
}

export interface DataflowStateMutation {
  sourceNodeId: string;
  targetModel: string;
  operation: EntityOperation;
  fields: string[];
  conditions: string | null;
  sideEffects: string[];
}

export interface DataflowState {
  generatedAt: string;
  summary: {
    totalModels: number;
    financialModels: number;
    modelsWithAuditTrail: number;
    modelsWithPII: number;
    fullyMappedModels: number;
    partiallyMappedModels: number;
    unmappedModels: number;
    modelsWithWorkspaceIsolation: number;
    modelsMissingWorkspaceIsolation: number;
    modelsWithMutableState: number;
    modelsMissingHistory: number;
  };
  entities: EntityLifecycle[];
  mutations: DataflowStateMutation[];
  gaps: Array<{ model: string; missing: string; severity: 'critical' | 'high' | 'medium' }>;
}
