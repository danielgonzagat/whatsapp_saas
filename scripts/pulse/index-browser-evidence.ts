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
  const shouldRunBrowserStress = effectiveEnvironment === 'total' && !profileSelection;
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
        timeoutMs: 120_000,
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
            detail: 'Browser certification phase timed out before the crawler completed.',
            checkedAt: new Date().toISOString(),
          },
          summary: 'Browser certification timed out before the crawler completed.',
          stressResult: null,
          error: 'browser phase timeout',
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
        ? 'Profile-scoped certification uses actor/browser scenarios instead of the full browser crawler.'
        : undefined,
    });
  }

  return browserEvidence;
}
