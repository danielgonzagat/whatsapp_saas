// Wave 67 Phase 1 split — see docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
import { extractProductName } from './guest-chat.action-intent.product-args.helpers';

export function extractUrlArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  args.productName = extractProductName(msg);
  const labelMatch = msg.match(
    /(?:descri[cç][aã]o|label|nome)\s*:?\s*['"]?([A-Za-zÀ-ÿ0-9\s\-.]{2,40}?)(?:\s*(?:,|\.|url|https?|$))/i,
  );
  if (labelMatch?.[1]) {
    args.label = labelMatch[1].trim();
  }
  const urlMatch = msg.match(/(https?:\/\/\S+)/i);
  if (urlMatch?.[1]) {
    args.url = urlMatch[1];
  }
  if (/privad[oa]/.test(msg)) {
    args.isPrivate = true;
  }
  if (/aprender|aprendizado/.test(msg)) {
    args.learnEnabled = true;
  }
  if (/integrar|chat.*kloel/.test(msg)) {
    args.chatEnabled = true;
  }
  return args;
}
