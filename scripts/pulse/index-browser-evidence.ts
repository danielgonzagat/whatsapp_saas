import { runBrowserStressTest } from './browser-stress-tester';
import { runPhaseWithTrace, type PulseExecutionTracer } from './execution-trace';
import { compactReason, type flags as cliFlags } from './index-cli';
import type { PulseBrowserEvidence, PulseCertification } from './types';
import type { summarizeRuntimeEvidence } from './runtime-evidence';

type PulseCliFlags = typeof cliFlags;
type RuntimeEvidence = ReturnType<typeof summarizeRuntimeEvidence>;

interface BuildBrowserEvidenceInput {
  tracer: PulseExecutionTracer;
  flags: PulseCliFlags;
  humanReadableOutput: boolean;
  effectiveEnvironment: 'scan' | 'deep' | 'total';
  profileSelection: unknown;
  runtimeEvidence: RuntimeEvidence;
  certification: PulseCertification;
}

export async function buildBrowserEvidenceForIndex({
  tracer,
  flags,
  humanReadableOutput,
  effectiveEnvironment,
  profileSelection,
  runtimeEvidence,
  certification,
}: BuildBrowserEvidenceInput): Promise<PulseBrowserEvidence> {
  let browserEvidence = certification.evidenceSummary.browser;
  const isFullWorkspaceProfile =
    flags.profile === 'pulse-core-final' || flags.profile === 'full-product';
  const shouldRunBrowserStress =
    effectiveEnvironment === 'total' && (!profileSelection || isFullWorkspaceProfile);
  const browserTimeoutMs = isFullWorkspaceProfile ? 600_000 : 120_000;
  if (shouldRunBrowserStress) {
    if (humanReadableOutput) {
      console.log('  Executing browser certification...');
    }
    const browserRun = await runPhaseWithTrace(
      tracer,
      'browser-certification',
      () =>
        runBrowserStressTest({
          headed: flags.headed,
          fast: flags.fast,
          pageFilter: flags.pageFilter,
          groupFilter: flags.groupFilter,
          slowMo: flags.slowMo,
          log: true,
        }),
      {
        timeoutMs: browserTimeoutMs,
        onTimeout: () => ({
          attempted: true,
          executed: false,
          exitCode: 124,
          frontendUrl: runtimeEvidence.frontendUrl || process.env.PULSE_FRONTEND_URL || '',
          backendUrl: runtimeEvidence.backendUrl || process.env.PULSE_BACKEND_URL || '',
          screenshotDir: 'screenshots/pulse-browser-timeout',
          reportPath: null,
          artifactPath: null,
          preflight: {
            status: 'frontend_unreachable' as const,
            detail: `Browser certification timed out after ${browserTimeoutMs}ms before the crawler completed for profile=${flags.profile || 'none'}, pageFilter=${flags.pageFilter || 'none'}, groupFilter=${flags.groupFilter || 'none'}.`,
            checkedAt: new Date().toISOString(),
          },
          summary: `Browser certification timed out after ${browserTimeoutMs}ms before the crawler completed.`,
          stressResult: null,
          error: `browser phase timeout after ${browserTimeoutMs}ms`,
        }),
      },
    );
    browserEvidence = {
      ...certification.evidenceSummary.browser,
      attempted: browserRun.attempted,
      executed: browserRun.executed,
      artifactPaths: [
        ...new Set([
          ...(certification.evidenceSummary.browser.artifactPaths || []),
          ...(browserRun.artifactPath ? [browserRun.artifactPath] : []),
          ...(browserRun.reportPath ? [browserRun.reportPath] : []),
          browserRun.screenshotDir,
        ]),
      ],
      summary: compactReason(browserRun.summary),
      failureCode: browserRun.preflight.status,
      preflight: {
        status: browserRun.preflight.status,
        detail: compactReason(browserRun.preflight.detail, 280),
        checkedAt: browserRun.preflight.checkedAt,
      },
      totalPages: browserRun.stressResult?.summary.totalPages,
      totalTested: browserRun.stressResult?.summary.totalTested,
      passRate: browserRun.stressResult?.summary.passRate,
      blockingInteractions: browserRun.stressResult
        ? browserRun.stressResult.summary.byStatus.QUEBRADO +
          browserRun.stressResult.summary.byStatus.CRASH +
          browserRun.stressResult.summary.byStatus.TIMEOUT
        : undefined,
    };
  } else if (effectiveEnvironment === 'total') {
    tracer.startPhase('browser-certification', {
      profile: flags.profile || 'none',
    });
    tracer.finishPhase('browser-certification', 'skipped', {
      errorSummary: flags.profile
        ? 'Non-final profile-scoped certification uses actor/browser scenarios instead of the full browser crawler.'
        : undefined,
    });
  }

  return browserEvidence;
}
