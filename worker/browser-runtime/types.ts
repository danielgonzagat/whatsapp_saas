export type BrowserSessionState =
  | "BOOTING"
  | "QR_PENDING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "RECOVERING"
  | "CRASHED"
  | "TAKEOVER";

export type BrowserActionType =
  | "click"
  | "double_click"
  | "move"
  | "drag"
  | "type"
  | "keypress"
  | "scroll"
  | "wait";

export interface BrowserActionInput {
  type: BrowserActionType;
  x?: number;
  y?: number;
  toX?: number;
  toY?: number;
  text?: string;
  key?: string;
  deltaY?: number;
  delayMs?: number;
}

export type ComputerUseProvider = "anthropic" | "openai" | "heuristic";

export interface BrowserObservedChat {
  id: string;
  name?: string | null;
  phone?: string | null;
  unreadCount?: number | null;
  timestamp?: number | null;
  rawText?: string | null;
}

export interface BrowserObservedMessage {
  id: string;
  body: string;
  fromMe?: boolean | null;
  timestamp?: number | null;
  chatId?: string | null;
  type?: string | null;
  hasMedia?: boolean | null;
  mediaUrl?: string | null;
  from?: string | null;
  to?: string | null;
  createdAt?: string | null;
}

export interface BrowserObservationState {
  summary?: string | null;
  sessionState?: BrowserSessionState | null;
  currentChatId?: string | null;
  visibleChats: BrowserObservedChat[];
  visibleMessages: BrowserObservedMessage[];
  lastVisibleText?: string | null;
}

export interface BrowserObservationResult {
  provider: ComputerUseProvider;
  objective?: string | null;
  summary: string;
  confidence: number;
  sessionState: BrowserSessionState;
  currentChatId?: string | null;
  visibleChats: BrowserObservedChat[];
  visibleMessages: BrowserObservedMessage[];
  recommendedActions?: BrowserActionInput[];
  rawOutput?: string | null;
  generatedAt: string;
}

export interface BrowserActionTurnResult {
  provider: ComputerUseProvider;
  objective: string;
  summary: string;
  actions: BrowserActionInput[];
  dryRun?: boolean;
  snapshot?: BrowserSessionSnapshot;
  blockedReason?: string | null;
  rawOutput?: string | null;
  generatedAt: string;
}

export type BrowserProofKind =
  | "session"
  | "action"
  | "observe"
  | "reconcile"
  | "send_text"
  | "send_media"
  | "takeover"
  | "pause";

export interface BrowserProofEntry {
  id: string;
  workspaceId: string;
  kind: BrowserProofKind;
  provider: ComputerUseProvider | "human" | "agent" | "system";
  summary: string;
  objective?: string | null;
  beforeImage?: string | null;
  afterImage?: string | null;
  action?: BrowserActionInput | BrowserActionInput[] | null;
  observation?: BrowserObservationResult | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

export interface BrowserSessionSnapshot {
  workspaceId: string;
  state: BrowserSessionState;
  provider: "whatsapp-web-agent";
  connected: boolean;
  phoneNumber?: string | null;
  pushName?: string | null;
  message?: string | null;
  lastError?: string | null;
  currentUrl?: string | null;
  title?: string | null;
  screenshotDataUrl?: string | null;
  screenshotUpdatedAt?: string | null;
  viewerAvailable: boolean;
  takeoverActive: boolean;
  agentPaused?: boolean;
  lastObservationAt?: string | null;
  lastActionAt?: string | null;
  observationSummary?: string | null;
  activeProvider?: ComputerUseProvider | null;
  proofCount?: number;
  viewport: {
    width: number;
    height: number;
  };
  updatedAt: string;
}

export interface BrowserSendTextInput {
  workspaceId: string;
  to: string;
  message: string;
  quotedMessageId?: string;
  chatId?: string;
}

export interface BrowserSendMediaInput {
  workspaceId: string;
  to: string;
  mediaType: "image" | "video" | "audio" | "document";
  mediaUrl: string;
  caption?: string;
  quotedMessageId?: string;
  chatId?: string;
}

export interface FrameMetadata {
  timestamp: string;
  sessionState: BrowserSessionState;
  whatAgentSees?: string | null;
  whatAgentDecided?: string | null;
  whatAgentDid?: BrowserActionInput[];
  result?: string | null;
  nextStep?: string | null;
  screenshotFile: string;
  live: boolean;
  agentPaused: boolean;
  takeoverActive: boolean;
  activeProvider?: ComputerUseProvider | null;
  observationSummary?: string | null;
  proofId?: string | null;
  source?: string | null;
}

export interface ActionMetadata {
  id: string;
  timestamp: string;
  workspaceId: string;
  kind: BrowserProofKind;
  provider: BrowserProofEntry["provider"];
  summary: string;
  objective?: string | null;
  result?: string | null;
  beforeFile?: string | null;
  afterFile?: string | null;
  action?: BrowserActionInput | BrowserActionInput[] | null;
  metadata?: Record<string, any> | null;
}
