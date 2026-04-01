// PULSE Browser Stress Tester — Types

export type BrowserTestStatus =
  | 'FUNCIONA'       // API response OK or DOM changed as expected
  | 'QUEBRADO'       // Error, 500 response, or console crash
  | 'FACHADA'        // No API call, no DOM change — nothing happened
  | 'TIMEOUT'        // Exceeded timeout
  | 'CRASH'          // Page crashed or navigation error
  | 'NAO_TESTAVEL';  // Element not found, dangerous, or external

export interface ObservedApiCall {
  method: string;
  url: string;
  status: number;
  timeMs: number;
}

export interface ElementTestResult {
  pageRoute: string;
  elementLabel: string;
  elementType: string;
  selectorUsed: string;
  matchedFmapEntry: string | null;
  fmapStatus: string | null;
  browserStatus: BrowserTestStatus;
  reason: string;
  apiCallObserved: ObservedApiCall | null;
  domChangeDetected: boolean;
  persistenceVerified: boolean | null;
  screenshotPath: string | null;
  durationMs: number;
  consoleErrors: string[];
}

export interface PageTestResult {
  route: string;
  group: string;
  loadTimeMs: number;
  loadStatus: 'ok' | 'error' | 'timeout' | 'redirect';
  elementsFound: number;
  elementsTested: number;
  results: ElementTestResult[];
  screenshotPath: string | null;
  consoleErrors: string[];
}

export interface DiscoveredElement {
  label: string;
  type: 'button' | 'input' | 'textarea' | 'select' | 'switch' | 'checkbox' | 'file-input' | 'link' | 'tab' | 'clickable';
  selector: string;
  placeholder?: string;
  inputType?: string;
  inputName?: string;
  isDisabled: boolean;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
}

export interface StressTestConfig {
  frontendUrl: string;
  backendUrl: string;
  screenshotDir: string;
  timeoutPerElement: number;
  timeoutPerPage: number;
  skipPersistence: boolean;
  headless: boolean;
  slowMo: number;
}

export interface TestDataEntry {
  type: string;
  id: string;
  deleteEndpoint: string;
  deleteMethod: string;
}

export interface AuthCredentials {
  token: string;
  workspaceId: string;
  email: string;
}

export interface StressTestResult {
  config: StressTestConfig;
  pages: PageTestResult[];
  summary: {
    totalPages: number;
    totalElements: number;
    totalTested: number;
    byStatus: Record<BrowserTestStatus, number>;
    passRate: number;
    avgPageLoadMs: number;
    totalDurationMs: number;
    crashes: string[];
  };
  createdTestData: TestDataEntry[];
  timestamp: string;
}

export interface BrowserStressRunOptions {
  headed?: boolean;
  fast?: boolean;
  pageFilter?: string | null;
  groupFilter?: string | null;
  slowMo?: number;
  log?: boolean;
}

export interface BrowserStressRunResult {
  attempted: boolean;
  executed: boolean;
  exitCode: number;
  frontendUrl: string;
  backendUrl: string;
  screenshotDir: string;
  reportPath: string | null;
  summary: string;
  stressResult: StressTestResult | null;
  error?: string;
}
