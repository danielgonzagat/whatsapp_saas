import { fail, Gate, GateEvidence, GateMode, GateVerdict, pass } from './pulse-gates.types';

/**
 * UTP-PULSE-001 — `no-roleplay` gate.
 *
 * Implements PCI.4 §3.1: payload to the LLM must not contain role-play
 * instruction that contaminates Kloel's identity configuration.
 *
 * DISTINCTION (per PCI.4 §3.1 + expansion mandate):
 *   - Prose inside `currentInput` (user-provided raw message) is OK.
 *     Users may attempt to role-play with the AI — that is their right.
 *   - Role-play patterns inside `identityProjection` or `lineage`
 *     (Kloel's self-configuration) are BLOCKED. Kloel must not be
 *     configured with a fake persona, role, or behavioral instruction.
 *
 * Patterns detected:
 *   - "você é X" / "you are X" persona declarations
 *   - "seu trabalho é" / "sua tarefa é" / "your job is" / "your task is"
 *   - "play the role of" / "finja ser" / "pretend to be"
 *   - "seu papel" / "your role"
 *   - "aja como" / "act as"
 *   - Persona literal declarations (Kloel é, Kloel is)
 *
 * Hard-fail at Onda 2 (promoted via GATE_DEFAULT_MODE in gate-mode-controller).
 */
const MEASURED_BY = 'no-roleplay.gate' as const;

/**
 * Role-play detection patterns.
 *
 * Each pattern targets a specific family of role-play instruction.
 * Patterns are case-insensitive and anchored to word boundaries
 * to avoid false positives on incidental substring matches.
 */
const ROLEPLAY_PATTERNS: ReadonlyArray<{
  readonly id: string;
  readonly re: RegExp;
}> = [
  // ── "você é X" / "você é um(a) X" persona declarations ───────────
  { id: 'pt-voce-e', re: /\bvoc[êe]\s+[\u00E9e](?=[\s.,;:!?'"»]|$)/i },
  { id: 'pt-voce-e-um', re: /\bvoc[êe]\s+[\u00E9e]\s+(um|uma|o|a)\s+\w/i },

  // ── "you are X" persona declarations ─────────────────────────────
  { id: 'en-you-are-a', re: /\byou\s+are\s+(an?|the)\s+\w/i },

  // ── "seu trabalho é" / "your job is" ────────────────────────────
  { id: 'pt-seu-trabalho', re: /\bseu\s+(trabalho|emprego|dever|prop[oô]sito)\s+[\u00E9e](?=[\s.,;:!?'"»]|$)/i },
  { id: 'en-your-job', re: /\byour\s+(job|task|duty|purpose|mission|objective)\s+is\b/i },

  // ── "sua tarefa é" ──────────────────────────────────────────────
  { id: 'pt-sua-tarefa', re: /\bsua\s+tarefa\s+[\u00E9e](?=[\s.,;:!?'"»]|$)/i },
  { id: 'pt-sua-funcao', re: /\bsua\s+fun[çc][ãa]o\s+[\u00E9e](?=[\s.,;:!?'"»]|$)/i },

  // ── "play the role of" ──────────────────────────────────────────
  { id: 'en-play-role', re: /\bplay\s+the\s+role\s+of\b/i },

  // ── "finja ser" / "finge ser" ───────────────────────────────────
  { id: 'pt-finja-ser', re: /\bfin[gj][ae]\s+(ser|que|de)\b/i },

  // ── "pretend to be" / "pretend you are" ─────────────────────────
  { id: 'en-pretend', re: /\bpretend\s+(to\s+be|you\s+are)\b/i },

  // ── "act as" / "aja como" ──────────────────────────────────────
  { id: 'en-act-as', re: /\bact\s+as\s+(an?|the|a|if)\b/i },
  { id: 'pt-aja-como', re: /\baja\s+como\b/i },

  // ── "seu papel" / "your role" ──────────────────────────────────
  { id: 'pt-seu-papel', re: /\bseu\s+papel\b/i },
  { id: 'en-your-role', re: /\byour\s+role\b/i },

  // ── Persona declarations for Kloel itself ───────────────────────
  { id: 'persona-kloel-e', re: /\bKloel\s+(é|is|age|atua|comporta|deve ser|should be|acts as)(?=[\s.,;:!?'"»]|$)/i },

  // ── "You are now X" system role injection ───────────────────────
  { id: 'en-you-are-now', re: /\byou are now\s+(an?|the|acting)\b/i },

  // ── "from now on you are" ──────────────────────────────────────
  { id: 'en-from-now-on', re: /\bfrom now on you are\b/i },

  // ── Portuguese role injection ──────────────────────────────────
  { id: 'pt-a-partir-de-agora', re: /\ba partir de agora voc[êe]\s+[\u00E9e](?=[\s.,;:!?'"»]|$)/i },
  { id: 'pt-doravante', re: /\bdoravante voc[êe]\s+[\u00E9e](?=[\s.,;:!?'"»]|$)/i },

  // ── "you are no longer" role removal ───────────────────────────
  { id: 'en-you-are-no-longer', re: /\byou are no longer\b/i },
];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Walk every string leaf in the payload and test against role-play
 * patterns. The `currentInput` subtree is EXCLUDED from scanning
 * because user prose is allowed to contain role-play language.
 *
 * One report per offending string (first match wins per string).
 */
function roleplayScan(
  payload: unknown,
  pathPrefix = '$',
  out: GateEvidence[] = [],
): GateEvidence[] {
  if (typeof payload === 'string') {
    for (const pattern of ROLEPLAY_PATTERNS) {
      if (pattern.re.test(payload)) {
        out.push({
          path: pathPrefix,
          detail: `roleplay pattern detected (${pattern.id})`,
        });
        break;
      }
    }
    return out;
  }
  if (Array.isArray(payload)) {
    payload.forEach((item, idx) => {
      roleplayScan(item, `${pathPrefix}[${idx}]`, out);
    });
    return out;
  }
  if (isObject(payload)) {
    for (const [k, v] of Object.entries(payload)) {
      if (pathPrefix === '$' && k === 'currentInput') {
        continue;
      }
      roleplayScan(v, `${pathPrefix}.${k}`, out);
    }
  }
  return out;
}

export function makeNoRoleplayGate(mode: GateMode = 'hard_fail'): Gate<unknown> {
  return {
    name: 'no-roleplay',
    mode,
    check: (payload: unknown): GateVerdict => {
      const offending = roleplayScan(payload);

      if (offending.length === 0) {
        return pass('no-roleplay', mode, MEASURED_BY);
      }

      return fail(
        'no-roleplay',
        mode,
        MEASURED_BY,
        `${offending.length} roleplay pattern(s) detected outside currentInput`,
        offending,
      );
    },
  };
}
