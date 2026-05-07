import { DEFAULT_WATCH_MINUTES } from './constants.mjs';
import { runOnce, printStatus, formatDuration, readLastRefresh } from './pipeline.mjs';
import { runWatch } from './watch.mjs';

function printUsage() {
  process.stderr.write(`Usage: node hud-orchestrator.mjs [--once|--watch|--status|--dry]

  --once     Run the full HUD refresh pipeline once (default).
  --watch    Poll loop: re-run --once every N minutes on file changes.
             Use --interval <minutes> to override default (${DEFAULT_WATCH_MINUTES}m).
  --status   Print a markdown summary of the last HUD refresh.
  --dry      Dry-run mode: pass --dry to each emitter step.
             Can be combined with --once.

Examples:
  node scripts/orchestration/hud-orchestrator.mjs --once
  node scripts/orchestration/hud-orchestrator.mjs --once --dry
  node scripts/orchestration/hud-orchestrator.mjs --status
  node scripts/orchestration/hud-orchestrator.mjs --watch
  node scripts/orchestration/hud-orchestrator.mjs --watch --interval 10
`);
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
  }

  if (args.includes('--status')) {
    const report = readLastRefresh();
    printStatus(report);
    return;
  }

  if (args.includes('--watch')) {
    const intervalIdx = args.indexOf('--interval');
    let minutes = DEFAULT_WATCH_MINUTES;
    if (intervalIdx !== -1 && intervalIdx + 1 < args.length) {
      minutes = Number(args[intervalIdx + 1]) || DEFAULT_WATCH_MINUTES;
    }
    runWatch(minutes);
    return;
  }

  const dry = args.includes('--dry');
  const report = runOnce(dry);

  if (dry) {
    process.stderr.write(
      `DRY RUN COMPLETE — ${report.stepsSucceeded} steps would succeed, ${report.stepsSkipped} skipped\n`,
    );
  }

  printStatus(report);

  if (report.hardFail) {
    process.exit(1);
  }
}

main();
