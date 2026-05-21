// Step runner extracted from hud-orchestrator
export function runStep(step, dry) {
  const startedAt = Date.now();
  const script = step.script;
  const name = step.name;

  if (!existsSync(script)) {
    if (step.optional) {
      return {
        step: name,
        durationMs: Date.now() - startedAt,
        exitCode: null,
        summary: 'skipped (script not found — optional)',
        softError: false,
      };
    }
    return {
      step: name,
      durationMs: Date.now() - startedAt,
      exitCode: 1,
      summary: `FATAL: required script not found: ${script}`,
      softError: false,
    };
  }

  if (step.condition && !step.condition()) {
    return {
      step: name,
      durationMs: Date.now() - startedAt,
      exitCode: null,
      summary: 'skipped (condition false — findings fresh)',
      softError: false,
    };
  }

  const args = step.args ? [...step.args] : [];
  if (dry) {args.push('--dry');}

  let result;
  try {
    result = spawnSync('node', [script, ...args], {
      timeout: STEP_TIMEOUT_MS,
      encoding: 'utf8',
      env: { ...process.env },
      stdio: 'pipe',
    });
  } catch (err) {
    return {
      step: name,
      durationMs: Date.now() - startedAt,
      exitCode: 1,
      summary: `FATAL: spawn error: ${err.message}`,
      softError: false,
    };
  }

  const exitCode = (result.status ?? result.error) ? 1 : 0;
  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();

  let summary = '';
  if (exitCode === 0) {
    summary = 'ok';
    if (stderr) {
      try {
        const parsed = JSON.parse(stderr.startsWith('{') ? stderr : '');
        summary = JSON.stringify(parsed);
      } catch {
        if (stderr.length < 120) {summary = stderr;}
        else {summary = stderr.slice(0, 120) + '...';}
      }
    }
  } else if (result.signal === 'SIGTERM' || stderr.includes('ETIMEDOUT')) {
    return {
      step: name,
      durationMs: Date.now() - startedAt,
      exitCode: 1,
      summary: `TIMEOUT after ${STEP_TIMEOUT_MS}ms`,
      softError: false,
    };
  } else {
    summary = stderr || stdout || `exit code ${exitCode}`;
    if (summary.length > 200) {summary = summary.slice(0, 200) + '...';}
  }

  return {
    step: name,
    durationMs: Date.now() - startedAt,
    exitCode,
    summary,
    softError: false,
  };
}

