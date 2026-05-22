export interface SessionHealth {
  workspaceId: string;
  connected: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  lastReconnectAttempt?: Date;
  upSince?: Date;
  reconnectBlockedReason?: string;
}
