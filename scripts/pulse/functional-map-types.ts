// PULSE — Functional Map Types
// Traces every page → element → handler → API → backend → service → Prisma

import type {
  UIElement,
  APICall,
  BackendRoute,
  PrismaModel,
  ServiceTrace,
  ProxyRoute,
  FacadeEntry,
} from './types';
import type { HookRegistry } from './parsers/hook-registry';

// ===== Classification =====
export type InteractionStatus = 'FUNCIONA' | 'FACHADA' | 'QUEBRADO' | 'INCOMPLETO' | 'AUSENTE';

// ===== Single interaction chain =====
export interface InteractionChain {
  // Source page
  pageRoute: string;
  pageFile: string;
  componentFile: string;

  // UI Element
  elementType: string;
  elementLabel: string;
  elementLine: number;
  handler: string | null;
  handlerType: string;

  // Chain links (null = not found)
  apiCall: {
    endpoint: string;
    method: string;
    file: string;
    line: number;
  } | null;

  proxyRoute: {
    frontendPath: string;
    backendPath: string;
  } | null;

  backendRoute: {
    fullPath: string;
    httpMethod: string;
    methodName: string;
    file: string;
    guards: string[];
  } | null;

  serviceMethod: {
    serviceName: string;
    methodName: string;
    file: string;
  } | null;

  prismaModels: string[];

  // Classification
  status: InteractionStatus;
  statusReason: string;
  facadeEvidence: string[];
}

// ===== Data source (useSWR/GET for display) =====
export interface DataSource {
  hook: string;
  endpoint: string;
  file: string;
  line: number;
  hasBackendRoute: boolean;
}

// ===== Per-page map =====
export interface PageFunctionalMap {
  route: string;
  pageFile: string;
  group: string;
  isRedirect: boolean;
  redirectTarget: string | null;
  componentFiles: string[];
  interactions: InteractionChain[];
  dataSources: DataSource[];
  counts: Record<InteractionStatus, number>;
  totalInteractions: number;
}

// ===== Top-level result =====
export interface FunctionalMapResult {
  pages: PageFunctionalMap[];
  summary: {
    totalPages: number;
    totalInteractions: number;
    redirectPages: number;
    byStatus: Record<InteractionStatus, number>;
    byGroup: Record<string, Record<InteractionStatus, number>>;
    functionalScore: number;
  };
  timestamp: string;
}

// ===== Page entry from discovery =====
export interface PageEntry {
  pageFile: string; // absolute path
  relFile: string; // relative path
  route: string; // derived URL route
  group: string; // public | checkout | main | e2e
  isRedirect: boolean;
  redirectTarget: string | null;
}

// ===== Core parser data bundle =====
export interface CoreParserData {
  uiElements: UIElement[];
  apiCalls: APICall[];
  backendRoutes: BackendRoute[];
  prismaModels: PrismaModel[];
  serviceTraces: ServiceTrace[];
  proxyRoutes: ProxyRoute[];
  facades: FacadeEntry[];
  hookRegistry: HookRegistry;
}
