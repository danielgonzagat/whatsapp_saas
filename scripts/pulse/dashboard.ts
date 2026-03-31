import type { PulseHealth, Break } from './types';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const BG_RED = '\x1b[41m';
const BG_GREEN = '\x1b[42m';
const BG_YELLOW = '\x1b[43m';

function healthColor(score: number): string {
  if (score >= 80) return GREEN;
  if (score >= 50) return YELLOW;
  return RED;
}

function severityColor(s: string): string {
  if (s === 'high') return RED;
  if (s === 'medium') return YELLOW;
  return DIM;
}

function severityLabel(s: string): string {
  if (s === 'high') return `${RED}CRIT${RESET}`;
  if (s === 'medium') return `${YELLOW}WARN${RESET}`;
  return `${DIM}INFO${RESET}`;
}

function healthBar(score: number, width: number = 30): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  const color = healthColor(score);
  return `${color}${'█'.repeat(filled)}${DIM}${'░'.repeat(empty)}${RESET}`;
}

function breakIcon(type: string): string {
  switch (type) {
    case 'API_NO_ROUTE': return `${RED}[API→X]${RESET}`;
    case 'ROUTE_NO_CALLER': return `${DIM}[X←API]${RESET}`;
    case 'ROUTE_EMPTY': return `${YELLOW}[BE→∅]${RESET}`;
    case 'MODEL_ORPHAN': return `${YELLOW}[DB→∅]${RESET}`;
    case 'UI_DEAD_HANDLER': return `${RED}[UI→∅]${RESET}`;
    case 'FACADE': return `${RED}[FAKE]${RESET}`;
    case 'PROXY_NO_UPSTREAM': return `${YELLOW}[PXY→X]${RESET}`;
    default: return `[???]`;
  }
}

export function renderDashboard(health: PulseHealth, opts: { verbose?: boolean; watching?: boolean } = {}): void {
  const { stats } = health;

  // Clear screen
  process.stdout.write('\x1b[2J\x1b[H');

  const w = Math.min(process.stdout.columns || 80, 100);
  const line = '─'.repeat(w);

  console.log('');
  console.log(`  ${BOLD}PULSE${RESET} ${healthBar(health.score)} ${BOLD}${healthColor(health.score)}${health.score}%${RESET}  ${DIM}|${RESET}  ${health.timestamp.slice(0, 19)}`);
  if (opts.watching) {
    console.log(`  ${DIM}Watching files · Press [r] rescan [e] export [q] quit${RESET}`);
  }
  console.log(`  ${DIM}${line}${RESET}`);
  console.log('');

  // Stats
  const pad = (n: number, w: number = 4) => String(n).padStart(w);
  console.log(`  ${CYAN}UI Elements${RESET}     ${pad(stats.uiElements)} total   ${stats.uiDeadHandlers > 0 ? RED : GREEN}${pad(stats.uiDeadHandlers)} dead handlers${RESET}`);
  console.log(`  ${CYAN}API Calls${RESET}       ${pad(stats.apiCalls)} total   ${stats.apiNoRoute > 0 ? RED : GREEN}${pad(stats.apiNoRoute)} no backend${RESET}`);
  console.log(`  ${CYAN}Backend Routes${RESET}  ${pad(stats.backendRoutes)} total   ${stats.backendEmpty > 0 ? YELLOW : GREEN}${pad(stats.backendEmpty)} empty${RESET}`);
  console.log(`  ${CYAN}Prisma Models${RESET}   ${pad(stats.prismaModels)} total   ${stats.modelOrphans > 0 ? YELLOW : GREEN}${pad(stats.modelOrphans)} orphaned${RESET}`);
  console.log(`  ${CYAN}Facades${RESET}         ${pad(stats.facades)} total   ${stats.facadesBySeverity.high > 0 ? RED : GREEN}${pad(stats.facadesBySeverity.high)} critical${RESET} ${stats.facadesBySeverity.medium > 0 ? YELLOW : GREEN}${pad(stats.facadesBySeverity.medium)} warning${RESET}`);
  console.log(`  ${CYAN}Proxy Routes${RESET}    ${pad(stats.proxyRoutes)} total   ${stats.proxyNoUpstream > 0 ? YELLOW : GREEN}${pad(stats.proxyNoUpstream)} no upstream${RESET}`);
  console.log('');

  // Breaks
  const displayBreaks = opts.verbose
    ? health.breaks
    : health.breaks.filter(b => b.severity !== 'low');

  if (displayBreaks.length === 0) {
    console.log(`  ${GREEN}${BOLD}✓ ALL CONNECTIONS HEALTHY${RESET}`);
  } else {
    console.log(`  ${DIM}── BREAKS (${displayBreaks.length}) ${'─'.repeat(Math.max(0, w - 20))}${RESET}`);
    console.log('');

    const maxDisplay = opts.verbose ? displayBreaks.length : Math.min(displayBreaks.length, 40);
    for (let i = 0; i < maxDisplay; i++) {
      const b = displayBreaks[i];
      console.log(`  ${breakIcon(b.type)} ${severityLabel(b.severity)} ${DIM}${b.file}:${b.line}${RESET}`);
      console.log(`    ${b.description}`);
      if (b.detail && opts.verbose) {
        console.log(`    ${DIM}${b.detail.slice(0, 100)}${RESET}`);
      }
    }
    if (maxDisplay < displayBreaks.length) {
      console.log(`  ${DIM}... and ${displayBreaks.length - maxDisplay} more (use --verbose)${RESET}`);
    }
  }

  console.log('');
}
