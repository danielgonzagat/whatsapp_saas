import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { MindQualityService } from './mind-quality.service';
import type { QualityReport } from './mind-quality.service';
import { MindReplayService } from './mind-replay.service';
import type { ReplayScenarioInput, ReplayInput, ReplayReport } from './mind-replay.service';
import type { MindActionContext } from './mind-code-native.types';
import { MindSyntheticGeneratorService } from './mind-synthetic-generator.service';

export interface SimulateActionEntry {
  action: string;
  decisionType: string;
  context: MindActionContext;
}

export interface SimulateInput {
  workspaceId: string;
  scenario: ReplayScenarioInput;
  actions: SimulateActionEntry[];
  liftData: {
    lift: number;
    pZScore: number;
    samples: number;
    fallbackActive: boolean;
  };
}

export interface SimulateDecisionSummary {
  decisionType: string;
  chosen: string;
  baseline: string;
  matchedBaseline: boolean;
  candidateCount: number;
}

export interface SimulateReport {
  workspaceId: string;
  replay: ReplayReport;
  quality: QualityReport;
  summary: {
    totalDecisions: number;
    decisionsThatChoseBaseline: number;
    baselineMatchRate: number;
    qualityPassed: number;
    qualityFailed: number;
    overallVerdict: 'clean' | 'warning' | 'critical';
  };
  decisionDetails: SimulateDecisionSummary[];
}

@Injectable()
export class MindSimulatorService {
  private readonly logger = StructuredLogger.from(MindSimulatorService.name);

  constructor(
    private readonly replay: MindReplayService,
    private readonly quality: MindQualityService,
    private readonly synthetic: MindSyntheticGeneratorService,
  ) {}

  simulate(input: SimulateInput): SimulateReport {
    const startedAt = Date.now();

    const replayReport = this.replay.replayScenario(input.scenario);

    const actionEntries = input.actions.map((entry) => ({
      action: entry.action,
      context: entry.context,
    }));

    const qualityReport = this.quality.runAllChecks({
      workspaceId: input.workspaceId,
      records: [{ workspaceId: input.workspaceId }],
      liftData: input.liftData,
      actions: actionEntries,
    });

    const decisionsThatChoseBaseline = replayReport.baselineMatches;
    const totalDecisions = replayReport.totalDecisions;
    const qualityPassed = qualityReport.passed;
    const qualityFailed = qualityReport.failed;

    let overallVerdict: 'clean' | 'warning' | 'critical' = 'clean';
    if (qualityFailed > 0) {
      overallVerdict = 'warning';
    }
    if (qualityFailed >= 3) {
      overallVerdict = 'critical';
    }

    const decisionDetails: SimulateDecisionSummary[] = replayReport.outcomes.map((outcome) => {
      const matchingDecision = input.scenario.decisions.find(
        (d) => d.decisionType === outcome.decisionType,
      );
      return {
        decisionType: outcome.decisionType,
        chosen: outcome.chosen,
        baseline: outcome.baseline,
        matchedBaseline: outcome.chosen === outcome.baseline,
        candidateCount: matchingDecision?.candidates.length ?? 0,
      };
    });

    this.logger.log({
      operation: 'mind.simulator.simulate',
      status: 'ok',
      durationMs: Date.now() - startedAt,
      workspaceId: input.workspaceId,
      verdict: overallVerdict,
      totalDecisions,
      qualityPassed,
      qualityFailed,
    });

    return {
      workspaceId: input.workspaceId,
      replay: replayReport,
      quality: qualityReport,
      summary: {
        totalDecisions,
        decisionsThatChoseBaseline,
        baselineMatchRate: replayReport.baselineMatchRate,
        qualityPassed,
        qualityFailed,
        overallVerdict,
      },
      decisionDetails,
    };
  }

  simulateFromDecisions(
    workspaceId: string,
    decisions: ReplayInput[],
    actions: SimulateActionEntry[],
    liftData: {
      lift: number;
      pZScore: number;
      samples: number;
      fallbackActive: boolean;
    },
  ): SimulateReport {
    return this.simulate({
      workspaceId,
      scenario: { workspaceId, decisions },
      actions,
      liftData,
    });
  }

  simulateSyntheticWorkspace(workspaceId: string, seed = 42): SimulateReport {
    this.synthetic.setSeed(seed);
    const scenario = this.synthetic.generateScenario(workspaceId, seed);
    const uniqueActions = [
      ...new Set(
        scenario.decisions.flatMap((decision) => decision.candidates.map((c) => c.action)),
      ),
    ];
    const actions = this.synthetic
      .generateActionContexts(uniqueActions, seed + 500, { injectViolations: false })
      .map((entry) => ({
        action: entry.action,
        decisionType: scenario.decisions[0]?.decisionType ?? 'followup_timing',
        context: entry.context,
      }));

    return this.simulate({
      workspaceId,
      scenario,
      actions,
      liftData: {
        lift: 0.05,
        pZScore: 0.8,
        samples: 100,
        fallbackActive: false,
      },
    });
  }

  reportToMarkdown(report: SimulateReport): string {
    const lines: string[] = [];

    lines.push(`# MIND Simulation Report`);
    lines.push('');
    lines.push(`**Workspace:** \`${report.workspaceId}\``);
    lines.push(`**Verdict:** ${report.summary.overallVerdict}`);
    lines.push('');

    lines.push('## Summary');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Decisions | ${report.summary.totalDecisions} |`);
    lines.push(`| Chose Baseline | ${report.summary.decisionsThatChoseBaseline} |`);
    lines.push(`| Baseline Match Rate | ${(report.summary.baselineMatchRate * 100).toFixed(1)}% |`);
    lines.push(`| Quality Passed | ${report.summary.qualityPassed} |`);
    lines.push(`| Quality Failed | ${report.summary.qualityFailed} |`);
    lines.push('');

    lines.push('## Decisions');
    lines.push('');
    lines.push(`| Decision Type | Chosen | Baseline | Match | Candidates |`);
    lines.push(`|---------------|--------|----------|-------|------------|`);
    for (const detail of report.decisionDetails) {
      const matchIcon = detail.matchedBaseline ? 'sim' : 'nao';
      lines.push(
        `| ${detail.decisionType} | ${detail.chosen} | ${detail.baseline} | ${matchIcon} | ${detail.candidateCount} |`,
      );
    }
    lines.push('');

    if (report.quality.checks.length > 0) {
      lines.push('## Quality Checks');
      lines.push('');
      lines.push(`| Invariant | Passed | Detail |`);
      lines.push(`|-----------|--------|--------|`);
      for (const check of report.quality.checks) {
        const passIcon = check.passed ? 'sim' : 'nao';
        const truncated =
          check.detail.length > 80 ? check.detail.slice(0, 77) + '...' : check.detail;
        lines.push(`| ${check.invariant} | ${passIcon} | ${truncated} |`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  reportToJson(report: SimulateReport): string {
    return JSON.stringify(report, null, 2);
  }
}
