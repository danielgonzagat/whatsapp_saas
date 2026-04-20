import * as fs from 'fs';
import * as path from 'path';
import type { FacadeEntry, PulseConfig } from '../types';
import { walkFiles } from './utils';

// Context-aware discrimination: checks SURROUNDING lines, not just the file
function isAnimationContext(lines: string[], idx: number): boolean {
  // Check wide context (50 lines) for animation indicators
  const start = Math.max(0, idx - 50);
  const end = Math.min(lines.length, idx + 20);
  const context = lines.slice(start, end).join('\n');

  // Also check if the FILE itself is an animation/visual component
  const fullFile = lines.join('\n');
  const isAnimationFile =
    /\.getContext\s*\(\s*['"`]2d['"`]\s*\)|requestAnimationFrame|<canvas/i.test(fullFile) ||
    /waveform|heartbeat|loading-screen|scramble|glitch|particle|animation/i.test(fullFile);

  if (isAnimationFile) {
    return true;
  }

  return (
    /useEffect|requestAnimationFrame|canvas|ctx\.|\.getContext|animation|animate|transition|keyframe/i.test(
      context,
    ) ||
    /svg|path\s+d=|viewBox|stroke|fill|opacity|transform/i.test(context) ||
    /waveform|heartbeat|pulse|scramble|glitch|particle/i.test(context) ||
    /makeBeat|drawFrame|renderLoop|animationLoop/i.test(context) ||
    /setInterval.*(?:animation|visual|render|draw|frame)/i.test(context)
  );
}

function isIdContext(lines: string[], idx: number): boolean {
  const line = lines[idx];
  return /\.toString\(36\)|crypto|uuid|nanoid|key=|key:/i.test(line);
}

/** Detect facades. */
export function detectFacades(config: PulseConfig): FacadeEntry[] {
  const facades: FacadeEntry[] = [];
  const allDirs = [config.frontendDir, config.backendDir];

  for (const dir of allDirs) {
    const files = walkFiles(dir, ['.ts', '.tsx']);

    for (const file of files) {
      // Skip test/spec/seed/migration files
      if (/\.(test|spec|d)\.ts|seed|migration|fixture|mock\./i.test(file)) {
        continue;
      }

      try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        const relFile = path.relative(config.rootDir, file);

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();

          // Skip comments
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
            continue;
          }

          // === CRITICAL: Fake Save ===
          // Detect functions with setTimeout + setState but NO API call
          if (/setTimeout\s*\(\s*\(\)\s*=>\s*set\w+\s*\(/.test(trimmed)) {
            // Check if this is legitimate UI feedback (not fake save)
            const context5 = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
            // Clipboard feedback
            if (/clipboard|navigator\.clipboard|copyToClipboard|setCopied/i.test(context5)) {
              continue;
            }
            // UI state timers (thinking, loading indicators, toast auto-dismiss, animation triggers)
            if (
              /setIsThinking|setIsLoading|setIsProcessing|setShowToast|setNotification/i.test(
                trimmed,
              )
            ) {
              continue;
            }
            // UI visibility/animation timers (coupon modals, toasts, fade-in, mount)
            if (/setShowCouponModal|setVisible|setShow\b|setShowCheck|setMt\b/i.test(trimmed)) {
              continue;
            }
            // Timer that resets a visual indicator (not persistence)
            if (
              /setIs\w+\s*\(\s*false\s*\)/.test(trimmed) &&
              !/setSaved|setSaving|setSuccess/i.test(trimmed)
            ) {
              continue;
            }
            // Timer that clears a status/message indicator: setTimeout(() => setMsg(null), delay)
            if (
              /set\w*(?:Msg|Message|Status|Action|Error|Info|Feedback)\w*\s*\(\s*(?:null|''|"")\s*\)/.test(
                trimmed,
              )
            ) {
              continue;
            }
            // Visibility toggle: setTimeout(() => setVisible(true/false), delay) — animation
            if (
              /set(?:Visible|Show\w*|Mt|Open|Expanded|Active)\s*\(\s*(?:true|false)\s*\)/.test(
                trimmed,
              )
            ) {
              continue;
            }

            // Check if there's an API call ANYWHERE in the enclosing function
            // Walk backwards to find the function declaration (const X = async () => { or function X() {)
            let funcStart = i;
            for (let j = i; j >= Math.max(0, i - 50); j--) {
              if (
                /(?:const|let|function|async function)\s+\w+\s*(?:=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|\(\))|(?:\s*\())/.test(
                  lines[j],
                )
              ) {
                funcStart = j;
                break;
              }
            }

            // Now walk forward from funcStart to find function end
            let funcEnd = i + 3;
            let depth = 0;
            let bodyStarted = false;
            for (let j = funcStart; j < Math.min(funcStart + 60, lines.length); j++) {
              for (const ch of lines[j]) {
                if (ch === '{') {
                  depth++;
                  bodyStarted = true;
                }
                if (ch === '}') {
                  depth--;
                }
              }
              if (bodyStarted && depth === 0) {
                funcEnd = j + 1;
                break;
              }
            }

            const funcBody = lines.slice(funcStart, funcEnd).join('\n');
            // Check for direct API calls OR hook-provided mutation functions
            const hasApiCall =
              /apiFetch|await\s+fetch|api\.\w+|\.mutate\s*\(|Api\.\w+/.test(funcBody) ||
              // Hook mutation functions (from useProductMutations, useCRMMutations, etc.)
              /\b(?:updateProduct|createProduct|deleteProduct|updateArea|createArea|deleteArea|updateModule|createModule|deleteModule|createLesson|updateLesson|deleteLesson|createPlan|updatePlan|deletePlan|createBump|updateBump|deleteBump|createUpsell|updateUpsell|deleteUpsell|createCoupon|updateCoupon|deleteCoupon|updateConfig|resetConfig|createContact|upsertContact|addTag|removeTag|createPipeline|createDeal|moveDeal|updateDeal|deleteDeal|updateProfile|updateFiscal|updateBank|changePassword|uploadDocument|uploadAvatar|inviteCollaborator|approveAffiliate|revokeAffiliate)\s*\(/.test(
                funcBody,
              );

            if (!hasApiCall) {
              facades.push({
                file: relFile,
                line: i + 1,
                type: 'fake_save',
                severity: 'high',
                description: 'setTimeout resets state without API call — fake save feedback',
                evidence: trimmed.slice(0, 120),
              });
            }
          }

          // === CRITICAL: Math.random() as data ===
          if (/Math\.random\(\)/.test(trimmed)) {
            // Per-CONTEXT discrimination (not per-file)
            if (isAnimationContext(lines, i)) {
              continue;
            }
            if (isIdContext(lines, i)) {
              continue;
            }
            // ID generation: Math.round(Math.random() * 1e9), Math.random().toString(36)
            if (/\*\s*1e\d|\*\s*1000000|\.toString\s*\(\s*36\s*\)/.test(trimmed)) {
              continue;
            }
            // Retry jitter: Math.random() * delay or Math.random() * baseDelay
            if (/\*\s*(?:baseDelay|delay|timeout|interval|retryDelay|backoff)/i.test(trimmed)) {
              continue;
            }

            // Check if result is displayed to user (assigned to state/variable that renders)
            const isDataContext =
              /set\w+\s*\(/.test(trimmed) || // setState(Math.random())
              /const\s+\w+\s*=/.test(trimmed) || // const val = Math.random()
              /toFixed|toLocaleString|\.toFixed/.test(trimmed) || // Formatting for display
              /\+\+|--|\+=|-=/.test(trimmed); // Incrementing a counter

            if (isDataContext) {
              facades.push({
                file: relFile,
                line: i + 1,
                type: 'random_data',
                severity: 'high',
                description: 'Math.random() used as data value, not animation',
                evidence: trimmed.slice(0, 120),
              });
            }
          }

          // === CRITICAL: Hardcoded data arrays in useState ===
          if (/useState\s*\(\s*\[/.test(trimmed)) {
            // Check if it's a hardcoded array of objects with string values (looks like real data)
            const block = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
            if (
              /\{\s*(?:q|label|name|title|text)\s*:\s*['"`]/.test(block) &&
              /\}\s*,\s*\{/.test(block)
            ) {
              facades.push({
                file: relFile,
                line: i + 1,
                type: 'hardcoded_data',
                severity: 'high',
                description:
                  'useState initialized with hardcoded data array that should come from backend',
                evidence: trimmed.slice(0, 120),
              });
            }
          }

          // === WARNING: TODO/FIXME stubs referencing API/backend ===
          if (/\/\/\s*(?:TODO|FIXME|HACK|STUB)\b/i.test(trimmed)) {
            if (/api|connect|implement|integrat|backend|endpoint|fetch|prisma/i.test(trimmed)) {
              facades.push({
                file: relFile,
                line: i + 1,
                type: 'todo_stub',
                severity: 'medium',
                description: 'TODO/FIXME referencing missing API/backend integration',
                evidence: trimmed.slice(0, 120),
              });
            }
          }

          // === WARNING: Noop onClick/onSubmit handlers ===
          if (/(?:onClick|onSubmit)\s*=\s*\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/.test(trimmed)) {
            facades.push({
              file: relFile,
              line: i + 1,
              type: 'noop_handler',
              severity: 'medium',
              description: 'Empty handler — element exists but does nothing',
              evidence: trimmed.slice(0, 120),
            });
          }

          // === WARNING: console.log as only handler body ===
          if (/(?:onClick|onSubmit)\s*=\s*\{\s*\(\)\s*=>\s*console\.\w+/.test(trimmed)) {
            facades.push({
              file: relFile,
              line: i + 1,
              type: 'noop_handler',
              severity: 'medium',
              description: 'Handler only logs to console — no real action',
              evidence: trimmed.slice(0, 120),
            });
          }

          // === LOW: Silent catch blocks ===
          if (/catch\s*\(\s*\w*\s*\)\s*\{\s*\}/.test(trimmed)) {
            facades.push({
              file: relFile,
              line: i + 1,
              type: 'silent_catch',
              severity: 'low',
              description: 'Empty catch block — errors silenced',
              evidence: trimmed.slice(0, 120),
            });
          }

          // === CRITICAL: FALLBACK_RESPONSES pattern (hardcoded chat responses) ===
          if (/FALLBACK_RESPONSES|fallbackResponses|FALLBACK_MESSAGES/i.test(trimmed)) {
            if (!isAnimationContext(lines, i)) {
              facades.push({
                file: relFile,
                line: i + 1,
                type: 'hardcoded_data',
                severity: 'high',
                description:
                  'Hardcoded fallback responses used instead of real AI/backend responses',
                evidence: trimmed.slice(0, 120),
              });
            }
          }

          // === CRITICAL: setInterval incrementing displayed values ===
          if (/setInterval\s*\(/.test(trimmed)) {
            if (isAnimationContext(lines, i)) {
              continue;
            }
            const block = lines.slice(i, Math.min(i + 5, lines.length)).join('\n');
            if (
              /set\w+\s*\(\s*(?:prev|p|v)\s*=>\s*(?:prev|p|v)\s*[\+\-]/.test(block) ||
              /Math\.random/.test(block)
            ) {
              facades.push({
                file: relFile,
                line: i + 1,
                type: 'random_data',
                severity: 'high',
                description: 'setInterval incrementing displayed values with fake data',
                evidence: trimmed.slice(0, 120),
              });
            }
          }

          // === WARNING: return [] or return {} in service methods ===
          if (relFile.includes('backend') && /\.service\.ts$/.test(file)) {
            if (
              /^\s*return\s+\[\s*\]\s*;?\s*$/.test(trimmed) ||
              /^\s*return\s+\{\s*\}\s*;?\s*$/.test(trimmed)
            ) {
              // Check if this is inside a catch block, fallback, or utility function
              const context10 = lines.slice(Math.max(0, i - 10), i).join('\n');
              // Skip: catch blocks, fallback patterns, utility normalizers, default returns
              if (
                !/catch|default|fallback|if\s*\(!|normalize|sanitize|safeParse|JSON\.parse/.test(
                  context10,
                )
              ) {
                facades.push({
                  file: relFile,
                  line: i + 1,
                  type: 'hardcoded_data',
                  severity: 'medium',
                  description: 'Service method returns empty array/object instead of real data',
                  evidence: trimmed.slice(0, 120),
                });
              }
            }
          }
        }
      } catch (e) {
        process.stderr.write(
          `  [warn] Could not scan facades in ${file}: ${(e as Error).message}\n`,
        );
      }
    }
  }

  return facades;
}
