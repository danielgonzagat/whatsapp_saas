import { flags } from '../../index-cli';
import { runPulseGatherPhase } from './main-gather';
import { runPulseCertifyPhase } from './main-certify';

export async function main() {
  const gitnexusMode = process.argv.includes('gitnexus');
  if (gitnexusMode) {
    const { gitnexusCli } = await import('../../gitnexus/cli');
    await gitnexusCli(process.argv.slice(process.argv.indexOf('gitnexus') + 1));
    return;
  }

  if (flags.autonomous) {
    const { runPulseAutonomousLoop } = await import('../../autonomy-loop');
    const autonomyState = await runPulseAutonomousLoop(process.cwd(), {
      dryRun: flags.dryRun,
      continuous: flags.continuous,
      maxIterations: flags.maxIterations,
      intervalMs: flags.intervalMs,
      parallelAgents: flags.parallelAgents,
      maxWorkerRetries: flags.maxWorkerRetries,
      riskProfile:
        flags.riskProfile === 'safe' ||
        flags.riskProfile === 'balanced' ||
        flags.riskProfile === 'dangerous'
          ? flags.riskProfile
          : null,
      plannerModel: flags.plannerModel,
      codexModel: flags.codexModel,
      disableAgentPlanner: flags.disableAgentPlanner,
      executor: flags.executor,
    });
    console.log(JSON.stringify(autonomyState, null, 2));
    process.exit(autonomyState.status === 'failed' ? 1 : 0);
  }

  const state = await runPulseGatherPhase();
  await runPulseCertifyPhase(state);
}
