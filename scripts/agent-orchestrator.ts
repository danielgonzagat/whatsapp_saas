#!/usr/bin/env ts-node
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runPulseAutonomousLoop } = require('./pulse/autonomy-loop');

type RiskProfile = 'safe' | 'balanced' | 'dangerous';

interface AgentOrchestratorFlags {
  dryRun?: boolean;
  continuous?: boolean;
  maxIterations?: number | null;
  intervalMs?: number | null;
  parallelAgents?: number | null;
  maxWorkerRetries?: number | null;
  riskProfile?: RiskProfile | null;
  plannerModel?: string | null;
  codexModel?: string | null;
  disableAgentPlanner?: boolean;
}

function parseIntFlag(args: string[], name: string): number | null {
  const index = args.indexOf(name);
  if (index < 0) {
    return null;
  }

  const parsed = Number.parseInt(args[index + 1] || '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStringFlag(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0) {
    return null;
  }

  return args[index + 1] || null;
}

function parseRiskProfile(value: string | null): RiskProfile | null {
  if (value === 'safe' || value === 'balanced' || value === 'dangerous') {
    return value;
  }
  return null;
}

function parseFlags(args: string[]): AgentOrchestratorFlags {
  const dangerousRequested =
    args.includes('--dangerous') ||
    args.includes('--dangerous-total') ||
    args.includes('--full-send');
  const untilCertified = args.includes('--until-certified');
  const riskProfile = parseRiskProfile(parseStringFlag(args, '--risk-profile'));

  return {
    dryRun: args.includes('--dry-run'),
    continuous: untilCertified || args.includes('--continuous'),
    maxIterations: untilCertified ? 999 : parseIntFlag(args, '--max-iterations'),
    intervalMs: parseIntFlag(args, '--interval-ms'),
    parallelAgents: parseIntFlag(args, '--parallel-agents') || (dangerousRequested ? 4 : null),
    maxWorkerRetries: parseIntFlag(args, '--max-worker-retries') || (dangerousRequested ? 2 : null),
    riskProfile: riskProfile || (dangerousRequested ? 'dangerous' : 'balanced'),
    plannerModel: parseStringFlag(args, '--planner-model'),
    codexModel: parseStringFlag(args, '--codex-model'),
    disableAgentPlanner: args.includes('--disable-agent-planner'),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const flags = parseFlags(args);

  const state = await runPulseAutonomousLoop(process.cwd(), {
    dryRun: flags.dryRun,
    continuous: flags.continuous,
    maxIterations: flags.maxIterations,
    intervalMs: flags.intervalMs,
    parallelAgents: flags.parallelAgents,
    maxWorkerRetries: flags.maxWorkerRetries,
    riskProfile: flags.riskProfile,
    plannerModel: flags.plannerModel,
    codexModel: flags.codexModel,
    disableAgentPlanner: flags.disableAgentPlanner,
  });

  console.log(
    JSON.stringify(
      {
        orchestrator: 'codex-danger-orchestrator',
        generatedAt: new Date().toISOString(),
        cwd: process.cwd(),
        profile: flags.riskProfile || 'balanced',
        parallelAgents: flags.parallelAgents || 1,
        maxWorkerRetries: flags.maxWorkerRetries || 1,
        state,
      },
      null,
      2,
    ),
  );

  process.exit(state.status === 'failed' ? 1 : 0);
}

void main();
