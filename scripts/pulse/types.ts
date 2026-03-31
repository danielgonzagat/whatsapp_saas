// PULSE — Live Codebase Nervous System
// Shared type definitions across all modules

// ===== LAYER 1: UI Elements =====
export interface UIElement {
  file: string;
  line: number;
  type: 'button' | 'link' | 'toggle' | 'form' | 'input' | 'select' | 'clickable';
  label: string;
  handler: string | null;
  handlerType: 'real' | 'dead' | 'noop' | 'navigation';
  apiCalls: string[];
  component: string | null;
}

// ===== LAYER 2: API Calls =====
export interface APICall {
  file: string;
  line: number;
  endpoint: string;
  normalizedPath: string;
  method: string;
  callPattern: 'apiFetch' | 'useSWR' | 'fetch' | 'objectApi';
  isProxy: boolean;
  proxyTarget: string | null;
  callerFunction: string | null;
}

// ===== LAYER 3: Backend Routes =====
export interface BackendRoute {
  file: string;
  line: number;
  controllerPath: string;
  methodPath: string;
  fullPath: string;
  httpMethod: string;
  methodName: string;
  guards: string[];
  isPublic: boolean;
  serviceCalls: string[];
}

// ===== LAYER 4: Database Models =====
export interface PrismaModel {
  name: string;
  accessorName: string;
  line: number;
  fields: PrismaField[];
  relations: PrismaRelation[];
}

export interface PrismaField {
  name: string;
  type: string;
  line: number;
  isOptional: boolean;
  isArray: boolean;
  isId: boolean;
}

export interface PrismaRelation {
  fieldName: string;
  targetModel: string;
  type: 'one' | 'many';
  line: number;
}

// ===== Service Trace =====
export interface ServiceTrace {
  file: string;
  serviceName: string;
  methodName: string;
  line: number;
  prismaModels: string[];
}

// ===== Proxy Route =====
export interface ProxyRoute {
  file: string;
  line: number;
  frontendPath: string;
  httpMethod: string;
  backendPath: string;
}

// ===== Facade =====
export interface FacadeEntry {
  file: string;
  line: number;
  type: 'fake_save' | 'hardcoded_data' | 'random_data' | 'todo_stub' | 'noop_handler' | 'state_only_toggle' | 'silent_catch';
  description: string;
  severity: 'high' | 'medium' | 'low';
  evidence: string;
}

// ===== Graph =====
export type BreakType =
  | 'API_NO_ROUTE'
  | 'ROUTE_NO_CALLER'
  | 'ROUTE_EMPTY'
  | 'MODEL_ORPHAN'
  | 'UI_DEAD_HANDLER'
  | 'FACADE'
  | 'PROXY_NO_UPSTREAM';

export interface Break {
  type: BreakType;
  severity: 'high' | 'medium' | 'low';
  file: string;
  line: number;
  description: string;
  detail: string;
}

export interface PulseHealth {
  score: number;
  totalNodes: number;
  breaks: Break[];
  stats: {
    uiElements: number;
    uiDeadHandlers: number;
    apiCalls: number;
    apiNoRoute: number;
    backendRoutes: number;
    backendEmpty: number;
    prismaModels: number;
    modelOrphans: number;
    facades: number;
    facadesBySeverity: { high: number; medium: number; low: number };
    proxyRoutes: number;
    proxyNoUpstream: number;
  };
  timestamp: string;
}

// ===== Config =====
export interface PulseConfig {
  rootDir: string;
  frontendDir: string;
  backendDir: string;
  schemaPath: string;
  globalPrefix: string;
}
