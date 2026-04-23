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
 * BREAK TYPES:
 *   COST_LLM_NO_LIMIT(high)       — LLM calls without per-workspace token budget
 *   COST_STORAGE_NO_LIMIT(medium) — file uploads without storage quota check
 *   COST_NO_TRACKING(high)        — LLM usage not tracked per workspace
 */
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

const LLM_CALL_RE =
  /openai\.|anthropic\.|llm\.|completions\.create|chat\.completions|generateText|streamText/i;
const LLM_LIMIT_RE = /tokenBudget|tokenLimit|maxTokensPerWorkspace|llmBudget|costLimit|usageLimit/i;
const USAGE_TRACKING_RE = /usageLog|trackUsage|llmUsage|tokenUsed|tokensConsumed|recordUsage/i;
const STORAGE_QUOTA_RE = /storageQuota|storageLimitBytes|maxStorageBytes|storageUsed/i;
const FILE_UPLOAD_RE = /multer|@UploadedFile|FileInterceptor|S3|putObject|upload/i;
const WORKSPACE_THROTTLE_RE =
  /ThrottlerGuard|WorkspaceThrottle|throttle.*workspace|workspace.*throttle/i;

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

    if (LLM_CALL_RE.test(content)) {
      hasLLMCalls = true;

      // CHECK 1: LLM limit enforced before call
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (LLM_CALL_RE.test(line)) {
          // Look for limit check in preceding 15 lines
          const context = lines.slice(Math.max(0, i - 15), i).join('\n');
          if (!LLM_LIMIT_RE.test(context) && !USAGE_TRACKING_RE.test(context)) {
            const relFile = path.relative(config.rootDir, file);
            breaks.push({
              type: 'COST_LLM_NO_LIMIT',
              severity: 'high',
              file: relFile,
              line: i + 1,
              description:
                'LLM API call without per-workspace token budget check — runaway costs possible',
              detail: `${line.trim().slice(0, 120)} — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling`,
            });
          }
        }
      }
    }

    if (LLM_LIMIT_RE.test(content)) {
      hasLLMLimit = true;
    }
    if (USAGE_TRACKING_RE.test(content)) {
      hasUsageTracking = true;
    }
    if (FILE_UPLOAD_RE.test(content)) {
      hasFileUploads = true;
    }
    if (STORAGE_QUOTA_RE.test(content)) {
      hasStorageQuota = true;
    }
    if (WORKSPACE_THROTTLE_RE.test(content)) {
      hasWorkspaceThrottle = true;
    }
    if (/costAlert|budgetAlert|limitReached.*notify|approachingLimit/i.test(content)) {
      hasCostAlerting = true;
    }
  }

  // CHECK 5: LLM usage tracking
  if (hasLLMCalls && !hasUsageTracking) {
    breaks.push({
      type: 'COST_NO_TRACKING',
      severity: 'high',
      file: 'backend/src/',
      line: 0,
      description:
        'LLM API calls made without recording token usage per workspace — cannot bill or limit costs',
      detail:
        'After each LLM call, record: workspaceId, model, promptTokens, completionTokens, totalTokens, cost, timestamp',
    });
  }

  // CHECK 1: LLM limit enforcement
  if (hasLLMCalls && !hasLLMLimit) {
    breaks.push({
      type: 'COST_LLM_NO_LIMIT',
      severity: 'high',
      file: 'backend/src/',
      line: 0,
      description:
        'No per-workspace LLM token budget enforcement found — one workspace can exhaust entire monthly budget',
      detail:
        'Add workspace.llmTokensRemaining check before LLM calls; set plan-based limits in workspace settings',
    });
  }

  // CHECK 2: Storage quota
  if (hasFileUploads && !hasStorageQuota) {
    breaks.push({
      type: 'COST_STORAGE_NO_LIMIT',
      severity: 'medium',
      file: 'backend/src/',
      line: 0,
      description: 'File uploads accepted without per-workspace storage quota check',
      detail:
        'Track bytes stored per workspace; reject uploads when quota exceeded; set plan-based limits (e.g., 1GB free)',
    });
  }

  // CHECK 4: Per-workspace API throttling
  if (!hasWorkspaceThrottle) {
    breaks.push({
      type: 'COST_LLM_NO_LIMIT',
      severity: 'high',
      file: 'backend/src/',
      line: 0,
      description:
        'No per-workspace API rate limiting — one workspace can monopolize resources and affect all others',
      detail:
        'Add workspace-scoped throttling alongside IP throttling; check NestJS Throttler workspace guard',
    });
  }

  // CHECK 6: Cost alerting
  if (hasLLMCalls && !hasCostAlerting) {
    breaks.push({
      type: 'COST_NO_TRACKING',
      severity: 'high',
      file: 'backend/src/',
      line: 0,
      description:
        'No cost alerting for LLM usage — workspace owner not notified when approaching monthly limit',
      detail:
        'Trigger notification at 80% and 95% of monthly LLM budget; send email/WhatsApp alert to workspace owner',
    });
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
      breaks.push({
        type: 'COST_LLM_NO_LIMIT',
        severity: 'high',
        file: 'backend/src/',
        line: 0,
        description:
          'LLM limit check may not enforce a hard stop — warning without rejection still allows overspend',
        detail:
          'Ensure limit check throws ForbiddenException or 429 when limit exceeded, not just logs a warning',
      });
    }
  }

  // CHECK: WhatsApp message rate limit per workspace
  const whatsappFiles = backendFiles.filter((f) => /whatsapp|autopilot/i.test(f));
  for (const file of whatsappFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    const relFile = path.relative(config.rootDir, file);

    if (
      /sendMessage|send.*message/i.test(content) &&
      !/messageLimit|dailyLimit|rateLimit|messagesPerDay/i.test(content)
    ) {
      breaks.push({
        type: 'COST_LLM_NO_LIMIT',
        severity: 'high',
        file: relFile,
        line: 0,
        description:
          'WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages',
        detail:
          'Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)',
      });
    }
  }

  // TODO: Implement when infrastructure available
  // - Query actual LLM spend from OpenAI/Anthropic billing API
  // - Compare spend vs. configured limits to verify correctness
  // - Alert if a workspace has exceeded limit but is still being served

  return breaks;
}
