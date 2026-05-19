import { allowedFormatsFor, type FormatId, type ToneId } from '../channel-repertoire.config';

export function filterArsenalFormats(
  channel: string,
  arsenal: Array<{ type?: string }> | undefined,
): {
  formatCandidates: FormatId[];
  decisions: Record<string, unknown>;
} {
  const allowedFormats = allowedFormatsFor(channel);
  const arsenalFormatTypes = new Set(
    (arsenal ?? []).map((asset) => String(asset.type || '').toLowerCase()),
  );
  const arsenalAwareFormats: FormatId[] = [];
  const arsenalExcludedFormats: string[] = [];
  for (const fmt of allowedFormats) {
    const fmtStr = String(fmt);
    if (arsenalFormatTypes.has(fmtStr)) {
      arsenalAwareFormats.push(fmt);
    } else {
      arsenalExcludedFormats.push(fmtStr);
    }
  }
  const formatCandidates = arsenalAwareFormats.length > 0 ? arsenalAwareFormats : allowedFormats;
  const decisions: Record<string, unknown> = {};
  if (arsenalExcludedFormats.length > 0) {
    decisions.arsenal_format_filter = {
      channel_allowed: allowedFormats,
      arsenal_present: [...arsenalFormatTypes],
      excluded: arsenalExcludedFormats,
      reason: 'arsenal-empty-for-format',
      effective: arsenalAwareFormats,
    };
  }
  return { formatCandidates, decisions };
}

export function intersectToneRepertoire(
  channel: string,
  brainTone: { tone: string; confidence: number; fallback: boolean },
  allowedTones: ToneId[],
): {
  tone: { tone: string; confidence: number; fallback: boolean };
  decisions: Record<string, unknown>;
} {
  const decisions: Record<string, unknown> = {};
  const toneLower = String(brainTone.tone || '').toLowerCase();
  const toneInRepertoire = allowedTones.some((t) => t === toneLower);
  if (!toneInRepertoire) {
    const fallbackTone = allowedTones[0] ?? 'consultivo';
    decisions.tone_repertoire_override = {
      brain: brainTone.tone,
      channel,
      replaced_with: fallbackTone,
      reason: 'channel-repertoire-intersection',
    };
    return {
      tone: { tone: fallbackTone, confidence: brainTone.confidence, fallback: true },
      decisions,
    };
  }
  return { tone: brainTone, decisions };
}
