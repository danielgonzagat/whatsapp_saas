// PULSE Browser Stress Tester — Types

export type BrowserTestStatus =
  | 'FUNCIONA' // API response OK or DOM changed as expected
  | 'QUEBRADO' // Error, 500 response, or console crash
  | 'FACHADA' // No API call, no DOM change — nothing happened
  | 'TIMEOUT' // Exceeded timeout
  | 'CRASH' // Page crashed or navigation error
  | 'NAO_TESTAVEL'; // Element not found, dangerous, or external

/** Observed api call shape. */
export interface ObservedApiCall {
  /** Method property. */
  method: string;
  /** Url property. */
  url: string;
  /** Status property. */
  status: number;
  /** Time ms property. */
  timeMs: number;
}

/** Element test result shape. */
export interface ElementTestResult {
  /** Page route property. */
  pageRoute: string;
  /** Element label property. */
  elementLabel: string;
  /** Element type property. */
  elementType: string;
  /** Selector used property. */
  selectorUsed: string;
  /** Matched fmap entry property. */
  matchedFmapEntry: string | null;
  /** Fmap status property. */
  fmapStatus: string | null;
  /** Browser status property. */
  browserStatus: BrowserTestStatus;
  /** Reason property. */
  reason: string;
  /** Api call observed property. */
  apiCallObserved: ObservedApiCall | null;
  /** Dom change detected property. */
  domChangeDetected: boolean;
  /** Persistence verified property. */
  persistenceVerified: boolean | null;
  /** Screenshot path property. */
  screenshotPath: string | null;
  /** Duration ms property. */
  durationMs: number;
  /** Console errors property. */
  consoleErrors: string[];
}

/** Page test result shape. */
export interface PageTestResult {
  /** Route property. */
  route: string;
  /** Group property. */
  group: string;
  /** Load time ms property. */
  loadTimeMs: number;
  /** Load status property. */
  loadStatus: 'ok' | 'error' | 'timeout' | 'redirect';
  /** Elements found property. */
  elementsFound: number;
  /** Elements tested property. */
  elementsTested: number;
  /** Results property. */
  results: ElementTestResult[];
  /** Screenshot path property. */
  screenshotPath: string | null;
  /** Console errors property. */
  consoleErrors: string[];
}

/** Discovered element shape. */
export interface DiscoveredElement {
  /** Label property. */
  label: string;
  /** Type property. */
  type:
    | 'button'
    | 'input'
    | 'textarea'
    | 'select'
    | 'switch'
    | 'checkbox'
    | 'file-input'
    | 'link'
    | 'tab'
    | 'clickable';
  /** Selector property. */
  selector: string;
  /** Placeholder property. */
  placeholder?: string;
  /** Input type property. */
  inputType?: string;
  /** Input name property. */
  inputName?: string;
  /** Is disabled property. */
  isDisabled: boolean;
  /** Bounding box property. */
  boundingBox: { x: number; y: number; width: number; height: number } | null;
}

/** Stress test config shape. */
export interface StressTestConfig {
  /** Frontend url property. */
  frontendUrl: string;
  /** Backend url property. */
  backendUrl: string;
  /** Screenshot dir property. */
  screenshotDir: string;
  /** Timeout per element property. */
  timeoutPerElement: number;
  /** Timeout per page property. */
  timeoutPerPage: number;
  /** Skip persistence property. */
  skipPersistence: boolean;
  /** Headless property. */
  headless: boolean;
  /** Slow mo property. */
  slowMo: number;
}

/** Test data entry shape. */
export interface TestDataEntry {
  /** Type property. */
  type: string;
  /** Id property. */
  id: string;
  /** Delete endpoint property. */
  deleteEndpoint: string;
  /** Delete method property. */
  deleteMethod: string;
}

/** Auth credentials shape. */
export interface AuthCredentials {
  /** Token property. */
  token: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Email property. */
  email: string;
}

/** Stress test result shape. */
export interface StressTestResult {
  /** Config property. */
  config: StressTestConfig;
  /** Pages property. */
  pages: PageTestResult[];
  /** Summary property. */
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
  /** Created test data property. */
  createdTestData: TestDataEntry[];
  /** Timestamp property. */
  timestamp: string;
}

/** Browser stress run options shape. */
export interface BrowserStressRunOptions {
  /** Headed property. */
  headed?: boolean;
  /** Fast property. */
  fast?: boolean;
  /** Page filter property. */
  pageFilter?: string | null;
  /** Group filter property. */
  groupFilter?: string | null;
  /** Slow mo property. */
  slowMo?: number;
  /** Log property. */
  log?: boolean;
}

/** Browser preflight status type. */
export type BrowserPreflightStatus =
  | 'ok'
  | 'playwright_missing'
  | 'chromium_launch_blocked'
  | 'frontend_unreachable'
  | 'backend_auth_unreachable';

/** Browser preflight result shape. */
export interface BrowserPreflightResult {
  /** Status property. */
  status: BrowserPreflightStatus;
  /** Detail property. */
  detail: string;
  /** Checked at property. */
  checkedAt: string;
}

/** Browser stress run result shape. */
export interface BrowserStressRunResult {
  /** Attempted property. */
  attempted: boolean;
  /** Executed property. */
  executed: boolean;
  /** Exit code property. */
  exitCode: number;
  /** Frontend url property. */
  frontendUrl: string;
  /** Backend url property. */
  backendUrl: string;
  /** Screenshot dir property. */
  screenshotDir: string;
  /** Report path property. */
  reportPath: string | null;
  /** Artifact path property. */
  artifactPath: string | null;
  /** Preflight property. */
  preflight: BrowserPreflightResult;
  /** Summary property. */
  summary: string;
  /** Stress result property. */
  stressResult: StressTestResult | null;
  /** Error property. */
  error?: string;
}
