/**
 * Continuous Daemon — autonomous loop orchestration engine (PLANNER MODE).
 *
 * Wave 8, Module A.
 *
 * The continuous daemon is an AUTONOMY PLANNER: it generates the plan for
 * what an autonomous loop WOULD do, without actually editing files or
 * committing changes. Each iteration picks the highest-value ai_safe unit
 * from the behavior graph, acquires a file lease, plans the test harness,
 * validates the strategy, and records the expected outcome.
 *
 * State is persisted to `.pulse/current/PULSE_AUTONOMY_STATE.json`.
 */

export { startContinuousDaemon } from './__parts__/continuous-daemon/daemon-loop';
export { stopContinuousDaemon } from './__parts__/continuous-daemon/public-api';
export { getDaemonStatus } from './__parts__/continuous-daemon/public-api';
