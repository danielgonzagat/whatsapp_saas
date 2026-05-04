import type { PulseHealth, PulseCertification } from './types';
import { deriveDynamicFindingIdentity, isBlockingDynamicFinding } from './finding-identity';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

function healthColor(score: number): string {
  if (score >= 80) {
    return GREEN;
  }
  if (score >= 50) {
    return YELLOW;
  }
  return RED;
}

function severityLabel(s: string): string {
  if (s === 'critical') {
    return `${RED}${BOLD}CRIT${RESET}`;
  }
  if (s === 'high') {
    return `${RED}CRIT${RESET}`;
  }
  if (s === 'medium') {
    return `${YELLOW}WARN${RESET}`;
  }
  return `${DIM}INFO${RESET}`;
}

function healthBar(score: number, width: number = 30): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  const color = healthColor(score);
  return `${color}${'█'.repeat(filled)}${DIM}${'░'.repeat(empty)}${RESET}`;
}

function findingEventIcon(identity: ReturnType<typeof deriveDynamicFindingIdentity>): string {
  if (identity.truthMode === 'observed') {
    return `${RED}[OBS]${RESET}`;
  }
  if (identity.truthMode === 'confirmed_static') {
    return `${YELLOW}[AST]${RESET}`;
  }
  if (identity.truthMode === 'weak_signal') {
    return `${DIM}[SIG]${RESET}`;
  }
  return `${MAGENTA}[INF]${RESET}`;
}

/** Render dashboard. */
export function renderDashboard(
  health: PulseHealth,
  certification?: PulseCertification,
  opts: { verbose?: boolean; watching?: boolean } = {},
): void {
  const { stats } = health;
  const displayedScore = certification ? certification.score : health.score;
  const certificationLabel = certification
    ? `${certification.status} · ${certification.environment}`
    : 'UNCERTIFIED';

  // Clear screen
  process.stdout.write('\x1b[2J\x1b[H');

  const w = Math.min(process.stdout.columns || 80, 100);
  const line = '─'.repeat(w);

  console.log('');
  console.log(
    `  ${BOLD}PULSE${RESET} ${healthBar(displayedScore)} ${BOLD}${healthColor(displayedScore)}${displayedScore}%${RESET}  ${DIM}|${RESET}  ${health.timestamp.slice(0, 19)}`,
  );
  console.log(
    `  ${DIM}Certification: ${certificationLabel}${certification ? ` | raw ${health.score}%` : ''}${RESET}`,
  );
  if (opts.watching) {
    console.log(`  ${DIM}Watching files · Press [r] rescan [e] export [q] quit${RESET}`);
  }
  console.log(`  ${DIM}${line}${RESET}`);
  console.log('');

  // Stats — Core
  const pad = (n: number, w: number = 4) => String(n).padStart(w);
  console.log(
    `  ${CYAN}UI Elements${RESET}     ${pad(stats.uiElements)} total   ${stats.uiDeadHandlers > 0 ? RED : GREEN}${pad(stats.uiDeadHandlers)} dead handlers${RESET}`,
  );
  console.log(
    `  ${CYAN}API Calls${RESET}       ${pad(stats.apiCalls)} total   ${stats.apiNoRoute > 0 ? RED : GREEN}${pad(stats.apiNoRoute)} no backend${RESET}`,
  );
  console.log(
    `  ${CYAN}Backend Routes${RESET}  ${pad(stats.backendRoutes)} total   ${stats.backendEmpty > 0 ? YELLOW : GREEN}${pad(stats.backendEmpty)} empty${RESET}`,
  );
  console.log(
    `  ${CYAN}Prisma Models${RESET}   ${pad(stats.prismaModels)} total   ${stats.modelOrphans > 0 ? YELLOW : GREEN}${pad(stats.modelOrphans)} orphaned${RESET}`,
  );
  console.log(
    `  ${CYAN}Facades${RESET}         ${pad(stats.facades)} total   ${stats.facadesBySeverity.high > 0 ? RED : GREEN}${pad(stats.facadesBySeverity.high)} critical${RESET} ${stats.facadesBySeverity.medium > 0 ? YELLOW : GREEN}${pad(stats.facadesBySeverity.medium)} warning${RESET}`,
  );
  console.log(
    `  ${CYAN}Proxy Routes${RESET}    ${pad(stats.proxyRoutes)} total   ${stats.proxyNoUpstream > 0 ? YELLOW : GREEN}${pad(stats.proxyNoUpstream)} no upstream${RESET}`,
  );
  console.log(
    `  ${CYAN}Unavailable Checks${RESET} ${pad(stats.unavailableChecks)} total   ${stats.unavailableChecks > 0 ? RED : GREEN}${pad(stats.unavailableChecks)} unavailable${RESET}`,
  );
  console.log(
    `  ${CYAN}Unknown Surfaces${RESET}  ${pad(stats.unknownSurfaces)} total   ${stats.unknownSurfaces > 0 ? RED : GREEN}${pad(stats.unknownSurfaces)} undeclared${RESET}`,
  );

  // Stats — Extended
  if (stats.securityIssues > 0 || stats.dataSafetyIssues > 0 || stats.qualityIssues > 0) {
    console.log(`  ${DIM}${line}${RESET}`);
    console.log(
      `  ${CYAN}Security${RESET}        ${stats.securityIssues > 0 ? RED : GREEN}${pad(stats.securityIssues)} issues${RESET}`,
    );
    console.log(
      `  ${CYAN}Data Safety${RESET}     ${stats.dataSafetyIssues > 0 ? RED : GREEN}${pad(stats.dataSafetyIssues)} issues${RESET}`,
    );
    console.log(
      `  ${CYAN}Quality${RESET}         ${stats.qualityIssues > 0 ? YELLOW : GREEN}${pad(stats.qualityIssues)} issues${RESET}`,
    );
  }

  // Stats — Functional Map (when --fmap was used)
  if (stats.functionalMap) {
    const fm = stats.functionalMap;
    const fmScore = fm.functionalScore;
    const fmColor = fmScore >= 70 ? GREEN : fmScore >= 40 ? YELLOW : RED;
    console.log(`  ${DIM}${line}${RESET}`);
    console.log(
      `  ${CYAN}Functional Map${RESET}  ${pad(fm.totalInteractions)} total   ${GREEN}${pad(fm.byStatus.FUNCIONA || 0)} ok${RESET}  ${MAGENTA}${pad(fm.byStatus.FACHADA || 0)} fachada${RESET}  ${RED}${pad(fm.byStatus.QUEBRADO || 0)} quebrado${RESET}  ${fmColor}${fmScore}%${RESET}`,
    );
  }
  console.log('');

  // Breaks
  const displayBreaks = opts.verbose
    ? health.breaks
    : health.breaks.filter((b) => isBlockingDynamicFinding(b));

  if (displayBreaks.length === 0 && health.breaks.length === 0) {
    console.log(`  ${GREEN}${BOLD}✓ ALL CONNECTIONS HEALTHY${RESET}`);
  } else if (displayBreaks.length === 0) {
    console.log(
      `  ${GREEN}${BOLD}✓ No blocking finding events${RESET}  ${DIM}(${health.breaks.length} non-blocking signal(s) — use --verbose)${RESET}`,
    );
  } else {
    console.log(
      `  ${DIM}── FINDING EVENTS (${displayBreaks.length} blocking, ${health.breaks.length} total signals) ${'─'.repeat(Math.max(0, w - 70))}${RESET}`,
    );
    console.log('');

    const maxDisplay = opts.verbose ? displayBreaks.length : Math.min(displayBreaks.length, 40);
    for (let i = 0; i < maxDisplay; i++) {
      const b = displayBreaks[i];
      const identity = deriveDynamicFindingIdentity(b);
      console.log(
        `  ${findingEventIcon(identity)} ${severityLabel(b.severity)} ${DIM}${b.file}:${b.line}${RESET}`,
      );
      console.log(`    ${identity.eventName}`);
      if (b.detail && opts.verbose) {
        console.log(`    ${DIM}${b.detail.slice(0, 100)}${RESET}`);
      }
    }
    if (maxDisplay < displayBreaks.length) {
      console.log(
        `  ${DIM}... and ${displayBreaks.length - maxDisplay} more (use --verbose)${RESET}`,
      );
    }
  }

  console.log('');
}
