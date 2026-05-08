import type { BrainEventName } from './brain-event-taxonomy';

export function mapBrainActionToDomainEvent(action: string): BrainEventName | null {
  switch (action) {
    case 'create_product':
      return 'product.created';
    case 'create_payment_link':
      return 'checkout.generated';
    case 'send_message':
    case 'send_audio':
    case 'send_document':
    case 'send_media':
    case 'send_voice_note':
      return 'message.sent';
    case 'qualify_lead':
      return 'lead.qualified';
    case 'add_tag':
    case 'update_lead_status':
      return 'contact.segmented';
    default:
      return null;
  }
}

export function didBrainActionSucceed(action: unknown): boolean {
  if (!action || typeof action !== 'object') {
    return false;
  }
  const result = (action as Record<string, unknown>).result;
  if (!result || typeof result !== 'object') {
    return true;
  }
  const record = result as Record<string, unknown>;
  if (record.success === false || typeof record.error === 'string') {
    return false;
  }
  return true;
}

export function readBrainActionName(action: unknown): string | null {
  if (!action || typeof action !== 'object') {
    return null;
  }
  const raw = (action as Record<string, unknown>).tool;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}
