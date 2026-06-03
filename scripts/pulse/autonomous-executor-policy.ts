export interface SandboxExecutionResult {
  status: 'passed' | 'failed' | 'blocked';
  startedAt: string;
  finishedAt: string;
  runId: string;
  summary: string;
}
