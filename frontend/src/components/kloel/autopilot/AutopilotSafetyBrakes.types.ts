export interface AutopilotSmokeResultLike {
  smokeTestId: string;
  mode: 'dry-run' | 'live';
  phone: string;
  message: string;
  result?: {
    status?: string;
    stage?: string;
    error?: string;
    previewText?: string;
    mode?: 'dry-run' | 'live';
    reason?: string;
  };
  queue?: { waiting?: number; active?: number; delayed?: number; failed?: number };
}

export interface QueueStatsLike {
  waiting?: number;
  active?: number;
  delayed?: number;
  completed?: number;
  failed?: number;
  paused?: number;
}

export interface RuntimeConfigLike {
  [key: string]: unknown;
}

export interface AutopilotConfigLike {
  conversionFlowId?: string | null;
  currencyDefault?: string;
  recoveryTemplateName?: string | null;
}
