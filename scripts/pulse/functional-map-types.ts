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
  /** Page file property. */
  pageFile: string;
  /** Component file property. */
  componentFile: string;

  // UI Element
  elementType: string;
  /** Element label property. */
  elementLabel: string;
  /** Element line property. */
  elementLine: number;
  /** Handler property. */
  handler: string | null;
  /** Handler type property. */
  handlerType: string;

  // Chain links (null = not found)
  apiCall: {
    endpoint: string;
    method: string;
    file: string;
    line: number;
  } | null;

  /** Proxy route property. */
  proxyRoute: {
    frontendPath: string;
    backendPath: string;
  } | null;

  /** Backend route property. */
  backendRoute: {
    fullPath: string;
    httpMethod: string;
    methodName: string;
    file: string;
    guards: string[];
  } | null;

  /** Service method property. */
  serviceMethod: {
    serviceName: string;
    methodName: string;
    file: string;
  } | null;

  /** Prisma models property. */
  prismaModels: string[];

  // Classification
  status: InteractionStatus;
  /** Status reason property. */
  statusReason: string;
  /** Facade evidence property. */
  facadeEvidence: string[];
}

// ===== Data source (useSWR/GET for display) =====
export interface DataSource {
  /** Hook property. */
  hook: string;
  /** Endpoint property. */
  endpoint: string;
  /** File property. */
  file: string;
  /** Line property. */
  line: number;
  /** Has backend route property. */
  hasBackendRoute: boolean;
}

// ===== Per-page map =====
export interface PageFunctionalMap {
  /** Route property. */
  route: string;
  /** Page file property. */
  pageFile: string;
  /** Group property. */
  group: string;
  /** Is redirect property. */
  isRedirect: boolean;
  /** Redirect target property. */
  redirectTarget: string | null;
  /** Component files property. */
  componentFiles: string[];
  /** Interactions property. */
  interactions: InteractionChain[];
  /** Data sources property. */
  dataSources: DataSource[];
  /** Counts property. */
  counts: Record<InteractionStatus, number>;
  /** Total interactions property. */
  totalInteractions: number;
}

// ===== Top-level result =====
export interface FunctionalMapResult {
  /** Pages property. */
  pages: PageFunctionalMap[];
  /** Summary property. */
  summary: {
    totalPages: number;
    totalInteractions: number;
    redirectPages: number;
    byStatus: Record<InteractionStatus, number>;
    byGroup: Record<string, Record<InteractionStatus, number>>;
    functionalScore: number;
  };
  /** Timestamp property. */
  timestamp: string;
}

// ===== Page entry from discovery =====
export interface PageEntry {
  /** Page file property. */
  pageFile: string; // absolute path
  /** Frontend dir property. */
  frontendDir: string; // absolute source root
  /** Rel file property. */
  relFile: string; // relative path
  /** Route property. */
  route: string; // derived URL route
  /** Group property. */
  group: string; // public | checkout | main | e2e
  /** Is redirect property. */
  isRedirect: boolean;
  /** Redirect target property. */
  redirectTarget: string | null;
}

// ===== Core parser data bundle =====
export interface CoreParserData {
  /** Ui elements property. */
  uiElements: UIElement[];
  /** Api calls property. */
  apiCalls: APICall[];
  /** Backend routes property. */
  backendRoutes: BackendRoute[];
  /** Prisma models property. */
  prismaModels: PrismaModel[];
  /** Service traces property. */
  serviceTraces: ServiceTrace[];
  /** Proxy routes property. */
  proxyRoutes: ProxyRoute[];
  /** Facades property. */
  facades: FacadeEntry[];
  /** Hook registry property. */
  hookRegistry: HookRegistry;
}
