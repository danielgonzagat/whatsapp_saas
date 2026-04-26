#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runPulseAutonomousLoop } = require('./pulse/autonomy-loop');

type RiskProfile = 'safe' | 'balanced' | 'dangerous';
type AgentType = 'claude-code' | 'hermes' | 'openhands' | 'auto';
type OrchestrationMode = 'sequential' | 'parallel';

interface AgentDefinition {
  id: string;
  label: string;
  tool: string;
  capabilities: string[];
  riskProfile: string;
  mcpServers: string[];
  isOrchestrator?: boolean;
}

interface AgentManifest {
  agents: Record<string, AgentDefinition>;
  orchestration: {
    defaultMode: OrchestrationMode;
    parallelSlots: number;
    dispatchRules: Array<{
      when: string;
      assign: string | string[];
      reviewBy?: string;
      mode: OrchestrationMode;
      maxParallel?: number;
      requireHumanApproval?: boolean;
    }>;
  };
}

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
  agent?: AgentType;
  agents?: string;
  manifest?: string;
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

function parseAgentType(value: string | null): AgentType {
  if (value === 'claude-code' || value === 'hermes' || value === 'openhands' || value === 'auto') {
    return value;
  }
  return 'auto';
}

function loadManifest(rootDir: string, manifestPath?: string): AgentManifest | null {
  const candidates = [
    manifestPath,
    path.join(rootDir, '.kilo', 'agents.json'),
    path.join(rootDir, '.claude', 'agents.json'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        return JSON.parse(fs.readFileSync(candidate, 'utf-8')) as AgentManifest;
      } catch {
        continue;
      }
    }
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
  const agent = parseAgentType(parseStringFlag(args, '--agent'));
  const agents = parseStringFlag(args, '--agents');
  const manifest = parseStringFlag(args, '--manifest');

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
    agent,
    agents: agents || undefined,
    manifest: manifest || undefined,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const flags = parseFlags(args);
  const rootDir = process.cwd();

  const manifest = loadManifest(rootDir, flags.manifest);

  const resolvedParallelAgents =
    flags.parallelAgents || manifest?.orchestration?.parallelSlots || 1;

  const agentAssignments: string[] = [];
  if (flags.agent && flags.agent !== 'auto') {
    agentAssignments.push(flags.agent);
  } else if (flags.agents) {
    agentAssignments.push(...flags.agents.split(',').map((a) => a.trim()));
  }

  const state = await runPulseAutonomousLoop(rootDir, {
    dryRun: flags.dryRun,
    continuous: flags.continuous,
    maxIterations: flags.maxIterations,
    intervalMs: flags.intervalMs,
    parallelAgents: resolvedParallelAgents,
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
        version: '2.0.0',
        generatedAt: new Date().toISOString(),
        cwd: rootDir,
        profile: flags.riskProfile || 'balanced',
        parallelAgents: resolvedParallelAgents,
        maxWorkerRetries: flags.maxWorkerRetries || 1,
        agentType: flags.agent || 'auto',
        agentAssignments: agentAssignments.length > 0 ? agentAssignments : ['auto (PULSE-routed)'],
        manifestLoaded: manifest ? true : false,
        availableAgents: manifest ? Object.keys(manifest.agents) : [],
        state,
      },
      null,
      2,
    ),
  );

  process.exit(state.status === 'failed' ? 1 : 0);
}

void main();
