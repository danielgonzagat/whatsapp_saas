import { detectActionIntent as detectLegacyActionIntent } from './guest-chat.action-intent.helpers';
import { extractProductName } from './guest-chat.product-args.helpers';

export { formatToolResult } from './guest-chat.format-tool-result.helpers';

type ActionIntent = { tool: string; args: Record<string, unknown> };

function detectBroadcastIntent(message: string): ActionIntent | null {
  if (!/cria(?:r|ndo)?\s+(?:uma\s+)?(?:campanha|broadcast|disparo)/i.test(message)) {
    return null;
  }

  const campaignNameMatch = message.match(
    /(?:campanha|broadcast|disparo)\s+([A-Za-zÀ-ÿ0-9\s\-.,!?%$@]{2,80}?)(?:\s+(?:mensagem|msg|texto)\b|$)/i,
  );
  const campaignName = campaignNameMatch?.[1]?.trim() || extractProductName(message) || 'Campanha';
  const messageMatch = message.match(
    /(?:mensagem|msg|texto)\s*:?\s*['"]?([A-Za-zÀ-ÿ0-9\s\-.,!?%$@]{5,200}?)(?:\s*(?:,|\.|R\$|$))/i,
  );

  return {
    tool: 'create_broadcast',
    args: {
      name: campaignName,
      message: messageMatch?.[1]?.trim() || 'Campanha promocional',
      productName: campaignName,
    },
  };
}

function detectWarrantyIntent(message: string): ActionIntent | null {
  if (!/garantia|warranty/i.test(message)) {
    return null;
  }

  const warrantyMatch = message.match(/(\d+)\s*(?:dias?|days?)/i);
  const warrantyDays = warrantyMatch ? parseInt(warrantyMatch[1], 10) : undefined;

  return {
    tool: 'configure_warranty',
    args: { productName: extractProductName(message), warrantyDays },
  };
}

export function detectActionIntent(message: string): ActionIntent | null {
  return (
    detectBroadcastIntent(message) ??
    detectWarrantyIntent(message) ??
    detectLegacyActionIntent(message)
  );
}
