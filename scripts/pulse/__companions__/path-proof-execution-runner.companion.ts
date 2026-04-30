export async function executePathProofPlan(
  plan: PathProofPlan,
  options: ExecutePathProofPlanOptions = {},
): Promise<PathProofExecutionRun> {
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxTasks = options.maxTasks ?? DEFAULT_MAX_TASKS;
  const allowedCommandPrefixes = options.allowedCommandPrefixes ?? DEFAULT_ALLOWED_COMMAND_PREFIXES;
  const executor = options.executor ?? defaultExecutor;
  const results: PathProofExecutionResult[] = [];
  let attemptedTasks = 0;

  for (const task of plan.tasks) {
    if (attemptedTasks >= maxTasks) {
      results.push(
        buildSkippedResult(
          task,
          'planned_only',
          `Execution budget exhausted after ${maxTasks} attempted task(s).`,
        ),
      );
      continue;
    }

    const policy = evaluatePathProofCommandPolicy(task, allowedCommandPrefixes, cwd);
    if (!policy.allowed || !policy.parsed) {
      results.push(buildSkippedResult(task, 'execution_skipped', policy.reason));
      continue;
    }

    attemptedTasks += 1;
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    try {
      const execution = await executor({ ...policy.parsed, cwd, timeoutMs, task });
      const finishedAtMs = Date.now();
      const finishedAt = new Date(finishedAtMs).toISOString();
      const status: PathProofExecutionStatus =
        execution.exitCode === 0 ? 'observed_pass' : 'observed_fail';
      results.push({
        taskId: task.taskId,
        pathId: task.pathId,
        command: policy.parsed.displayCommand,
        status,
        executed: true,
        coverageCountsAsObserved: true,
        exitCode: execution.exitCode,
        startedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAtMs - startedAtMs),
        reason: execution.timedOut
          ? `Command timed out after ${timeoutMs}ms.`
          : `Command exited with code ${execution.exitCode ?? 'unknown'}.`,
        stdout: execution.stdout,
        stderr: execution.stderr,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const finishedAtMs = Date.now();
      const finishedAt = new Date(finishedAtMs).toISOString();
      results.push({
        taskId: task.taskId,
        pathId: task.pathId,
        command: policy.parsed.displayCommand,
        status: 'observed_fail',
        executed: true,
        coverageCountsAsObserved: true,
        exitCode: null,
        startedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAtMs - startedAtMs),
        reason: `Executor threw before producing an exit code: ${message}`,
      });
    }
  }

  const observedPass = results.filter((result) => result.status === 'observed_pass').length;
  const observedFail = results.filter((result) => result.status === 'observed_fail').length;
  const executionSkipped = results.filter((result) => result.status === 'execution_skipped').length;
  const plannedOnly = results.filter((result) => result.status === 'planned_only').length;

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    summary: {
      totalTasks: plan.tasks.length,
      attemptedTasks,
      observedPass,
      observedFail,
      executionSkipped,
      plannedOnly,
      observedTasks: observedPass + observedFail,
    },
    results,
  };
}

