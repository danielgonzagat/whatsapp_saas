import { validateAbiPayload } from '../abi/abi-validator';
import { fail, Gate, GateEvidence, GateMode, GateVerdict, pass } from './pulse-gates.types';
import { isObject } from '../../common/types';

/**
 * UTP-PULSE-007 — `prompt-leakage` gate.
 *
 * Implements PCI.4 §3.8: any string in any field of the payload to the LLM
 * is scanned for behavioral instruction patterns.
 *
 * Functionally identical scope to `no-roleplay` but exists as a discrete
 * gate by PCI.4 — both run at the LLM-emission checkpoint.
 *
 * The gate delegates to `validateAbiPayload` for the canonical pattern set
 * (PCI.4 §3.8 patterns) and supplements with additional patterns for tone
 * instructions, format dictates, system role injection, and broader persona
 * definitions not yet in the central ABI validator.
 *
 * Hard-fail at Onda 2 (promoted via GATE_DEFAULT_MODE in gate-mode-controller).
 */
const MEASURED_BY = 'prompt-leakage.gate' as const;

/**
 * Supplementary patterns covering tone instructions, format dictates,
 * system role injection, and broader persona/trait injection that go
 * beyond the canonical set in `abi-validator.ts`.
 *
 * PCI.4 §3.8 explicitly declares the pattern list as "expansível".
 */
const SUPPLEMENTARY_PATTERNS: ReadonlyArray<{
  readonly id: string;
  readonly re: RegExp;
}> = [
  // ── Tone / style instructions ──────────────────────────────────────
  {
    id: 'tone-adjective',
    re: /\b(use|adopt|keep|maintain|assume)\s+a\s+(friendly|professional|formal|casual|persuasive|empathetic|enthusiastic|polite|warm|authoritative|conversational|neutral|playful|serious|urgent)\s+(tone|style|voice)\b/i,
  },
  {
    id: 'tone-adjective-pt',
    re: /\btom\s+(amigável|profissional|formal|casual|persuasivo|empático|entusiasta|educado|neutro)\b/i,
  },
  {
    id: 'tone-be-adj',
    re: /\b(be|seja)\s+(friendly|professional|formal|casual|persuasive|profissional|amigável|formal)\b/i,
  },
  {
    id: 'tone-sound',
    re: /\b(sound|pareça)\s+(friendly|professional|formal|casual|persuasive|amigável|profissional)\b/i,
  },
  {
    id: 'tone-dont-be',
    re: /\b(don'?t|do not|n[ãa]o)\s+be\s+(mean|rude|aggressive|robot|sarcastic|grosseiro|r[íi]spido)\b/i,
  },

  // ── System role injection ──────────────────────────────────────────
  {
    id: 'sys-role-you-are-now',
    re: /\byou are now\s+(an?|the|acting as)\b/i,
  },
  {
    id: 'sys-role-no-longer',
    re: /\byou are no longer\b/i,
  },
  {
    id: 'sys-role-from-now',
    re: /\bfrom now on you are\b/i,
  },
  {
    id: 'sys-role-bot-identity',
    re: /\byou are (an?|the) (AI|assistant|chatbot|language model|bot|LLM|large language model)\b/i,
  },
  {
    id: 'sys-role-pt-agora',
    re: /\b(a partir de agora|doravante|de agora em diante)\s+você\s+(é|será|deve ser)\b/i,
  },

  // ── Broader persona / trait injection ──────────────────────────────
  {
    id: 'persona-expert',
    re: /\b(you are|você é|tu és)\s+(an?|um|uma|o|a)\s+(expert|especialista|professional|vendedor|seller|agente|agent|assistente|assistant|consultor|consultant|mentor|coach|analista|analyst|engenheiro|engineer|criador|creator|copywriter|designer|programador|programmer)\b/i,
  },
  {
    id: 'persona-trait-adjective',
    re: /\b(you are|você é|tu és)\s+(very|extremely|highly|muito|bastante|extremamente)\s+(helpful|knowledgeable|intelligent|skilled|experienced|útil|inteligente|experiente|capacitado)\b/i,
  },
  {
    id: 'persona-pt-voce-age',
    re: /\bvocê\s+(age|atua|comporta-se|se comporta)\s+como\b/i,
  },
  {
    id: 'persona-en-you-behave',
    re: /\byou\s+(behave|act|operate|function)\s+as\b/i,
  },

  // ── Format dictates outside respond/responda ────────────────────────
  {
    id: 'format-output-as',
    re: /\b(output|return|produce|generate|write|emit|render)\s+(in|as|using)\s+(json|markdown|yaml|xml|csv|html)\b/i,
  },
  {
    id: 'format-pt-output-as',
    re: /\b(produza|retorne|gere|escreva|emita|renderize)\s+(em|como)\s+(json|markdown|yaml|xml|csv|html|formato)\b/i,
  },
  {
    id: 'format-structured',
    re: /\b(structured|formatted|well-formatted)\s+(json|markdown|output|response|reply)\b/i,
  },
  {
    id: 'format-must-be',
    re: /\b(response|reply|answer|output)\s+must\s+be\s+(in|formatted as|written in)\b/i,
  },

  // ── Standalone always/never ─────────────────────────────────────────
  {
    id: 'always-you-must',
    re: /\byou\s+(must|should|shall|will|can|have to|need to|ought to)\s+always\b/i,
  },
  {
    id: 'never-you-must',
    re: /\byou\s+(must|should|shall|will|can)\s+never\b/i,
  },
  {
    id: 'always-pt-deve',
    re: /\b(você|tu)\s+(deve|deveria|precisa|tem que|há de)\s+sempre\b/i,
  },
  {
    id: 'never-pt-deve',
    re: /\b(você|tu)\s+(deve|deveria|precisa|tem que)\s+nunca\b/i,
  },

  // ── Standalone "NÃO faça" patterns ─────────────────────────────────
  {
    id: 'pt-nao-faca',
    re: /\b(n[ãa]o|jamais)\s+(fa[çc]a|fale|use|escreva|responda|diga|mencione)\b/i,
  },
  {
    id: 'en-do-not-do',
    re: /\b(do not|don'?t|never)\s+(say|write|mention|use|respond|reply)\b/i,
  },

  // ── Few-shot / multi-turn injection ─────────────────────────────────
  {
    id: 'few-shot-example',
    re: /\b(Example|Exemplo)\s*\d*\s*:\s*\n/i,
  },
  {
    id: 'few-shot-input-output',
    re: /\b(Input|Entrada)\s*:\s*(Output|Sa[íi]da)\s*:/i,
  },

  // ── "Do not ever" / irrevocable commands ────────────────────────────
  {
    id: 'dont-ever',
    re: /\b(don'?t|do not)\s+ever\b/i,
  },
  {
    id: 'under-no-circumstance',
    re: /\bunder\s+no\s+circumstanc/i,
  },
  {
    id: 'pt-sob-nenhuma',
    re: /\bsob\s+nenhuma\s+(circunst[âa]ncia|hip[óo]tese)\b/i,
  },
];

/**
 * Walk every string leaf in the payload and test against supplementary
 * patterns. One report per offending string (first match wins per string).
 */
function supplementaryScan(
  payload: unknown,
  pathPrefix = '$',
  out: GateEvidence[] = [],
): GateEvidence[] {
  if (typeof payload === 'string') {
    for (const pattern of SUPPLEMENTARY_PATTERNS) {
      if (pattern.re.test(payload)) {
        out.push({
          path: pathPrefix,
          detail: `prompt leakage detected (supplementary pattern ${pattern.id})`,
        });
        break;
      }
    }
    return out;
  }
  if (Array.isArray(payload)) {
    payload.forEach((item, idx) => {
      supplementaryScan(item, `${pathPrefix}[${idx}]`, out);
    });
    return out;
  }
  if (isObject(payload)) {
    for (const [k, v] of Object.entries(payload)) {
      supplementaryScan(v, `${pathPrefix}.${k}`, out);
    }
  }
  return out;
}

export function makePromptLeakageGate(mode: GateMode = 'hard_fail'): Gate<unknown> {
  return {
    name: 'prompt-leakage',
    mode,
    check: (payload: unknown): GateVerdict => {
      const abiVerdict = validateAbiPayload(payload);
      const abiOffending = abiVerdict.issues.filter((i) => i.code === 'PROMPT_LEAKAGE');

      const supplementaryOffending = supplementaryScan(payload);

      if (abiOffending.length === 0 && supplementaryOffending.length === 0) {
        return pass('prompt-leakage', mode, MEASURED_BY);
      }

      const abiEvidence: GateEvidence[] = abiOffending.map((i) => ({
        path: i.path,
        detail: i.message,
      }));

      const allEvidence = [...abiEvidence, ...supplementaryOffending];
      const count = allEvidence.length;

      return fail(
        'prompt-leakage',
        mode,
        MEASURED_BY,
        `${count} prompt-leakage pattern(s) detected (${abiOffending.length} from ABI validator + ${supplementaryOffending.length} supplementary)`,
        allEvidence,
      );
    },
  };
}
