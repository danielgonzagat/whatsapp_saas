/**
 * PULSE Parser 91: Cost Limit Checker
 * Layer 22: Cost Control
 * Mode: DEEP (requires codebase scan)
 *
 * CHECKS:
 * 1. LLM cost limits per workspace: verifies that calls to OpenAI/Anthropic/LLM APIs
 *    have per-workspace token budgets enforced (not unlimited)
 *    — checks for usage tracking and limit enforcement before each LLM call
 * 2. Storage cost limits: verifies file uploads have per-workspace storage quotas
 *    — total bytes stored must be checked before accepting new uploads
 * 3. WhatsApp message rate limits: verifies there's a per-workspace message cap
 *    (prevents runaway Autopilot from sending 10k messages/day)
 * 4. API rate limits per workspace: verifies throttler is scoped to workspace,
 *    not just IP (a malicious workspace can't DoS others)
 * 5. Cost tracking: verifies LLM usage is recorded per workspace
 *    (tokens in/out, model, timestamp) for billing/analytics
 * 6. Cost alerting: verifies workspace is alerted when approaching limits
 *    (e.g., at 80% of monthly LLM budget)
 * 7. Hard cost cap: verifies a hard stop exists when limit is exceeded
 *    (not just a warning email)
 *
 * REQUIRES: PULSE_DEEP=1
 * The parser emits cost-control evidence gaps, not fixed problem names.
 */
import * as path from 'path';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

const LLM_CALL_SIGNAL =
  /openai\.|anthropic\.|llm\.|completions\.create|chat\.completions|generateText|streamText/i;
const LLM_LIMIT_SIGNAL =
  /tokenBudget|tokenLimit|maxTokensPerWorkspace|llmBudget|costLimit|usageLimit/i;
const USAGE_TRACKING_SIGNAL = /usageLog|trackUsage|llmUsage|tokenUsed|tokensConsumed|recordUsage/i;
const STORAGE_QUOTA_SIGNAL = /storageQuota|storageLimitBytes|maxStorageBytes|storageUsed/i;
const FILE_UPLOAD_SIGNAL = /multer|@UploadedFile|FileInterceptor|S3|putObject|upload/i;
const WORKSPACE_THROTTLE_SIGNAL =
  /ThrottlerGuard|WorkspaceThrottle|throttle.*workspace|workspace.*throttle/i;

function costControlFinding(input: {
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  predicates: readonly string[];
}): Break {
  const signal: PulseSignalEvidence = {
    source: `grammar-kernel:cost-limit-checker;predicates=${input.predicates.join(',')}`,
    detector: 'cost-limit-checker',
    truthMode: 'weak_signal',
    summary: input.description,
    detail: input.detail,
    location: {
      file: input.file,
      line: input.line,
    },
  };
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const diagnostic = synthesizeDiagnostic(
    signalGraph,
    predicateGraph,
    calculateDynamicRisk({ predicateGraph }),
  );
  const predicateToken = input.predicates
    .map((predicate) => predicate.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('+')
    .toLowerCase();

  return {
    type: `diagnostic:cost-limit-checker:${predicateToken || diagnostic.id}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; ${input.detail}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface: 'resource-control',
  };
}

function isExecutableLlmCallLine(line: string): boolean {
  const trimmed = line.trim();
  if (!LLM_CALL_SIGNAL.test(trimmed)) {
    return false;
  }
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
    return false;
  }
  if (/\bOpenAI\.|:\s*OpenAI\.|Promise<OpenAI\.|import\s+|type\s+|interface\s+/i.test(trimmed)) {
    return false;
  }
  if (/^(?:async\s+)?(?:generateText|streamText)\s*\(/i.test(trimmed)) {
    return false;
  }
  return true;
}

/** Check cost limits. */
export function checkCostLimits(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const backendFiles = walkFiles(config.backendDir, ['.ts']);

  let hasLLMCalls = false;
  let hasLLMLimit = false;
  let hasUsageTracking = false;
  let hasFileUploads = false;
  let hasStorageQuota = false;
  let hasWorkspaceThrottle = false;
  let hasCostAlerting = false;

  for (const file of backendFiles) {
    if (/\.spec\.ts$|migration|seed/i.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    if (LLM_CALL_SIGNAL.test(content)) {
      hasLLMCalls = true;

      // CHECK 1: LLM limit enforced before call
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isExecutableLlmCallLine(line)) {
          // Look for limit check in preceding 15 lines
          const context = lines.slice(Math.max(0, i - 15), i).join('\n');
          if (!LLM_LIMIT_SIGNAL.test(context) && !USAGE_TRACKING_SIGNAL.test(context)) {
            const relFile = path.relative(config.rootDir, file);
            breaks.push(
              costControlFinding({
                severity: 'high',
                file: relFile,
                line: i + 1,
                description:
                  'LLM API call without per-workspace token budget check — runaway costs possible',
                detail: `${line.trim().slice(0, 120)} — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling`,
                predicates: ['llm_call_observed', 'workspace_token_budget_check_absent'],
              }),
            );
          }
        }
      }
    }

    if (LLM_LIMIT_SIGNAL.test(content)) {
      hasLLMLimit = true;
    }
    if (USAGE_TRACKING_SIGNAL.test(content)) {
      hasUsageTracking = true;
    }
    if (FILE_UPLOAD_SIGNAL.test(content)) {
      hasFileUploads = true;
    }
    if (STORAGE_QUOTA_SIGNAL.test(content)) {
      hasStorageQuota = true;
    }
    if (WORKSPACE_THROTTLE_SIGNAL.test(content)) {
      hasWorkspaceThrottle = true;
    }
    if (/costAlert|budgetAlert|limitReached.*notify|approachingLimit/i.test(content)) {
      hasCostAlerting = true;
    }
  }

  // CHECK 5: LLM usage tracking
  if (hasLLMCalls && !hasUsageTracking) {
    breaks.push(
      costControlFinding({
        severity: 'high',
        file: 'backend/src/',
        line: 0,
        description:
          'LLM API calls made without recording token usage per workspace — cannot bill or limit costs',
        detail:
          'After each LLM call, record: workspaceId, model, promptTokens, completionTokens, totalTokens, cost, timestamp',
        predicates: ['llm_call_observed', 'workspace_usage_tracking_absent'],
      }),
    );
  }

  // CHECK 1: LLM limit enforcement
  if (hasLLMCalls && !hasLLMLimit) {
    breaks.push(
      costControlFinding({
        severity: 'high',
        file: 'backend/src/',
        line: 0,
        description:
          'No per-workspace LLM token budget enforcement found — one workspace can exhaust entire monthly budget',
        detail:
          'Add workspace.llmTokensRemaining check before LLM calls; set plan-based limits in workspace settings',
        predicates: ['llm_call_observed', 'workspace_llm_limit_absent'],
      }),
    );
  }

  // CHECK 2: Storage quota
  if (hasFileUploads && !hasStorageQuota) {
    breaks.push(
      costControlFinding({
        severity: 'medium',
        file: 'backend/src/',
        line: 0,
        description: 'File uploads accepted without per-workspace storage quota check',
        detail:
          'Track bytes stored per workspace; reject uploads when quota exceeded; set plan-based limits (e.g., 1GB free)',
        predicates: ['file_upload_surface_observed', 'workspace_storage_quota_absent'],
      }),
    );
  }

  // CHECK 4: Per-workspace API throttling
  if (!hasWorkspaceThrottle) {
    breaks.push(
      costControlFinding({
        severity: 'high',
        file: 'backend/src/',
        line: 0,
        description:
          'No per-workspace API rate limiting — one workspace can monopolize resources and affect all others',
        detail:
          'Add workspace-scoped throttling alongside IP throttling; check NestJS Throttler workspace guard',
        predicates: ['backend_source_scanned', 'workspace_api_throttle_absent'],
      }),
    );
  }

  // CHECK 6: Cost alerting
  if (hasLLMCalls && !hasCostAlerting) {
    breaks.push(
      costControlFinding({
        severity: 'high',
        file: 'backend/src/',
        line: 0,
        description:
          'No cost alerting for LLM usage — workspace owner not notified when approaching monthly limit',
        detail:
          'Trigger notification at 80% and 95% of monthly LLM budget; send email/WhatsApp alert to workspace owner',
        predicates: ['llm_call_observed', 'workspace_cost_alerting_absent'],
      }),
    );
  }

  // CHECK 7: Hard stop at limit
  if (hasLLMCalls && hasLLMLimit) {
    // Verify it's a hard stop, not just a warning
    const allContent = backendFiles.reduce((acc, file) => {
      try {
        return acc + readTextFile(file, 'utf8');
      } catch {
        return acc;
      }
    }, '');

    if (
      !/throw.*limit.*exceeded|limitExceeded.*throw|ForbiddenException.*limit|TooManyRequests.*token/i.test(
        allContent,
      )
    ) {
      breaks.push(
        costControlFinding({
          severity: 'high',
          file: 'backend/src/',
          line: 0,
          description:
            'LLM limit check may not enforce a hard stop — warning without rejection still allows overspend',
          detail:
            'Ensure limit check throws ForbiddenException or 429 when limit exceeded, not just logs a warning',
          predicates: ['workspace_llm_limit_observed', 'hard_stop_enforcement_absent'],
        }),
      );
    }
  }

  // CHECK: WhatsApp message rate limit per workspace
  const whatsappFiles = backendFiles.filter((f) =>
    /whatsapp|autopilot/i.test(path.relative(config.rootDir, f)),
  );
  for (const file of whatsappFiles) {
    if (
      /\.(spec|test|d)\.ts$|\.dto\.ts$|controller\.ts$|provider-registry\.ts$|\.fixtures\.ts$/i.test(
        file,
      )
    ) {
      continue;
    }
    if (/\/providers\//i.test(file)) {
      continue;
    }
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    const relFile = path.relative(config.rootDir, file);

    if (
      /sendMessage|send.*message/i.test(content) &&
      !/messageLimit|dailyLimit|rateLimit|messagesPerDay|ensureDailyMessageQuota|ensureMessageRate|WhatsappSendRateGuard|rateGuard/i.test(
        content,
      )
    ) {
      breaks.push(
        costControlFinding({
          severity: 'high',
          file: relFile,
          line: 0,
          description:
            'WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages',
          detail:
            'Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)',
          predicates: ['whatsapp_send_observed', 'workspace_message_rate_limit_absent'],
        }),
      );
    }
  }

  // TODO: Implement when infrastructure available
  // - Query actual LLM spend from OpenAI/Anthropic billing API
  // - Compare spend vs. configured limits to verify correctness
  // - Alert if a workspace has exceeded limit but is still being served

  return breaks;
}
