// PULSE Wave 5 — Production Replay Adapter types

/** Supported replay data source. */
export type ReplaySource = 'sentry_replay' | 'datadog_replay' | 'openreplay' | 'custom';

/** Lifecycle status for a captured replay session. */
export type ReplayStatus = 'captured' | 'converted' | 'test_failed' | 'test_passed' | 'archived';

/** Discrete event captured during a real user session. */
export interface ReplayEvent {
  /** Event type. */
  type: 'click' | 'input' | 'navigation' | 'api_call' | 'error';
  /** ISO-8601 timestamp when the event occurred. */
  timestamp: string;
  /** Arbitrary event detail payload. */
  detail: Record<string, unknown>;
}

/** Single replay session captured from the production monitoring tool. */
export interface ReplaySession {
  /** Unique session identifier from the monitoring source. */
  sessionId: string;
  /** Source system that produced this replay. */
  source: ReplaySource;
  /** Authenticated user ID, or null when anonymous. */
  userId: string | null;
  /** ISO-8601 session start timestamp. */
  startTime: string;
  /** ISO-8601 session end timestamp. */
  endTime: string;
  /** Elapsed session duration in milliseconds. */
  durationMs: number;
  /** Starting URL for this session. */
  url: string;
  /** Ordered list of events captured during the session. */
  events: ReplayEvent[];
  /** Errors observed during this session. */
  errors: Array<{ message: string; timestamp: string }>;
  /** Current lifecycle status. */
  status: ReplayStatus;
  /** Scenario ID generated after conversion, or null when not yet converted. */
  convertedScenarioId: string | null;
}

/** Persisted replay state linking production sessions to test scenarios. */
export interface ReplayState {
  /** ISO-8601 timestamp when this state was generated. */
  generatedAt: string;
  /** Aggregate counts across all replay sessions. */
  summary: {
    /** Total replay sessions ingested. */
    totalSessions: number;
    /** Sessions that were converted to scenarios. */
    convertedSessions: number;
    /** Sessions promoted to permanent regression scenarios. */
    permanentScenarios: number;
    /** Sessions that contained at least one error event. */
    sessionsWithErrors: number;
  };
  /** All ingested replay sessions. */
  sessions: ReplaySession[];
  /** Sessions promoted to permanent scenarios with rationale. */
  permanentScenarios: Array<{
    /** Replay session ID that produced this permanent scenario. */
    replaySessionId: string;
    /** Generated permanent scenario ID. */
    scenarioId: string;
    /** Human-readable reason for permanent promotion. */
    reason: string;
  }>;
}
