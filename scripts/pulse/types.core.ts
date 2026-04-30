// PULSE — Live Codebase Nervous System
// Core parser types: UI, API, backend routes, DB models, facades

// Re-export BreakType for consumers that import it from types.core
export type { BreakType } from './types.break-types';

// ===== LAYER 1: UI Elements =====
export interface UIElement {
  /** File property. */
  file: string;
  /** Line property. */
  line: number;
  /** Type property. */
  type: 'button' | 'link' | 'toggle' | 'form' | 'input' | 'select' | 'clickable';
  /** Label property. */
  label: string;
  /** Handler property. */
  handler: string | null;
  /** Handler type property. */
  handlerType: 'real' | 'dead' | 'noop' | 'navigation';
  /** Api calls property. */
  apiCalls: string[];
  /** Handler evidence observed by the UI parser before downstream classification. */
  handlerEvidence?: string[];
  /** Predicate tokens observed by the UI parser for downstream classifiers. */
  handlerPredicates?: string[];
  /** Component property. */
  component: string | null;
}

// ===== LAYER 2: API Calls =====
export interface APICall {
  /** File property. */
  file: string;
  /** Line property. */
  line: number;
  /** Endpoint property. */
  endpoint: string;
  /** Normalized path property. */
  normalizedPath: string;
  /** Method property. */
  method: string;
  /** Call pattern property. */
  callPattern: 'apiFetch' | 'useSWR' | 'fetch' | 'objectApi';
  /** Is proxy property. */
  isProxy: boolean;
  /** Proxy target property. */
  proxyTarget: string | null;
  /** Caller function property. */
  callerFunction: string | null;
}

// ===== LAYER 3: Backend Routes =====
export interface BackendRoute {
  /** File property. */
  file: string;
  /** Line property. */
  line: number;
  /** Controller path property. */
  controllerPath: string;
  /** Method path property. */
  methodPath: string;
  /** Full path property. */
  fullPath: string;
  /** Http method property. */
  httpMethod: string;
  /** Method name property. */
  methodName: string;
  /** Guards property. */
  guards: string[];
  /** Is public property. */
  isPublic: boolean;
  /** Service calls property. */
  serviceCalls: string[];
}

// ===== LAYER 4: Database Models =====
export interface PrismaModel {
  /** Name property. */
  name: string;
  /** Accessor name property. */
  accessorName: string;
  /** Line property. */
  line: number;
  /** Fields property. */
  fields: PrismaField[];
  /** Relations property. */
  relations: PrismaRelation[];
}

/** Prisma field shape. */
export interface PrismaField {
  /** Name property. */
  name: string;
  /** Type property. */
  type: string;
  /** Line property. */
  line: number;
  /** Is optional property. */
  isOptional: boolean;
  /** Is array property. */
  isArray: boolean;
  /** Is id property. */
  isId: boolean;
}

/** Prisma relation shape. */
export interface PrismaRelation {
  /** Field name property. */
  fieldName: string;
  /** Target model property. */
  targetModel: string;
  /** Type property. */
  type: 'one' | 'many';
  /** Line property. */
  line: number;
}

// ===== Service Trace =====
export interface ServiceTrace {
  /** File property. */
  file: string;
  /** Service name property. */
  serviceName: string;
  /** Method name property. */
  methodName: string;
  /** Line property. */
  line: number;
  /** Prisma models property. */
  prismaModels: string[];
  /** Service-to-service calls observed inside this method. */
  serviceCalls?: string[];
  /** Runtime or event triggers observed on this method. */
  triggers?: string[];
}

// ===== Proxy Route =====
export interface ProxyRoute {
  /** File property. */
  file: string;
  /** Line property. */
  line: number;
  /** Frontend path property. */
  frontendPath: string;
  /** Http method property. */
  httpMethod: string;
  /** Backend path property. */
  backendPath: string;
}

// ===== Facade =====
export interface FacadeEntry {
  /** File property. */
  file: string;
  /** Line property. */
  line: number;
  /** Type property. */
  type:
    | 'fake_save'
    | 'hardcoded_data'
    | 'random_data'
    | 'todo_stub'
    | 'noop_handler'
    | 'state_only_toggle'
    | 'silent_catch';
  /** Description property. */
  description: string;
  /** Severity property. */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Evidence property. */
  evidence: string;
}
