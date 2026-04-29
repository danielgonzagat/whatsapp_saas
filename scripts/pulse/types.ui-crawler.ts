export type CrawlerRole =
  | 'anonymous'
  | 'customer'
  | 'operator'
  | 'admin'
  | 'producer'
  | 'affiliate';
export type UIElementKind =
  | 'button'
  | 'link'
  | 'form'
  | 'input'
  | 'select'
  | 'modal'
  | 'menu'
  | 'nav'
  | 'tab'
  | 'toggle';
export type UICrawlerStatus =
  | 'works'
  | 'no_handler'
  | 'fake'
  | 'error'
  | 'blocked'
  | 'not_executable'
  | 'not_reached';
export type UINetworkCallKind = 'fetch' | 'xhr' | 'websocket' | 'graphql' | 'server_action';

export interface UIDiscoveredPage {
  url: string;
  title: string;
  role: CrawlerRole;
  authRequired: boolean;
  reachable: boolean;
  elements: UIDiscoveredElement[];
  networkCalls: UINetworkCall[];
  consoleErrors: string[];
  loadTimeMs: number;
}

export interface UIDiscoveredElement {
  selector: string;
  kind: UIElementKind;
  label: string;
  visible: boolean;
  enabled: boolean;
  actionable: boolean;
  handlerAttached: boolean;
  status: UICrawlerStatus;
  linkedEndpoint: string | null; // API endpoint this element calls
  linkedFilePath: string | null; // source file for handler
  errorMessage: string | null;
}

export interface UINetworkCall {
  url: string;
  method: string;
  statusCode: number | null;
  durationMs: number;
  failed: boolean;
  errorMessage: string | null;
}

export interface UICrawlerEvidence {
  generatedAt: string;
  summary: {
    totalPages: number;
    reachablePages: number;
    totalElements: number;
    actionableElements: number;
    workingElements: number;
    brokenElements: number;
    fakeElements: number;
    byRole: Record<CrawlerRole, { pages: number; elements: number }>;
  };
  pages: UIDiscoveredPage[];
  deadHandlers: Array<{
    selector: string;
    page: string;
    role: CrawlerRole;
    reason: string;
    critical: boolean;
  }>;
  formSubmissions: Array<{
    formSelector: string;
    page: string;
    role: CrawlerRole;
    status: UICrawlerStatus;
    apiCalls: UINetworkCall[];
  }>;
}
