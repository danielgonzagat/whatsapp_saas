export interface PulseAutonomyState {
  iterations?: Array<{
    accepted: boolean;
    rollback?: boolean;
    recovered?: boolean;
  }>;
  startedAt?: string;
  generatedAt?: string;
  totalIterations?: number;
  acceptedIterations?: number;
  rejectedIterations?: number;
  rollbacks?: number;
  status?: string;
  cycles?: Array<{
    startedAt?: string;
    finishedAt?: string;
    phase?: string;
    result?: string;
    unitId?: string | null;
    filesChanged?: string[];
    scoreBefore?: number;
    scoreAfter?: number;
  }>;
}
