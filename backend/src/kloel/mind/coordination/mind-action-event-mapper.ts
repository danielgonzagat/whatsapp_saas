import type { BrainEventName } from './mind-event-taxonomy';

const ACTION_TO_EVENT = new Map<string, BrainEventName>([
  ['create_product', 'product.created'],
  ['update_product', 'product.updated'],
  ['products.update', 'product.updated'],
  ['products.upload_image', 'product.updated'],
  ['publish_product', 'product.published'],
  ['delete_product', 'product.deleted'],
  ['products.review_and_publish', 'product.published'],
  ['create_plan', 'plan.created'],
  ['plans.create', 'plan.created'],
  ['update_plan', 'plan.updated'],
  ['plans.update', 'plan.updated'],
  ['create_checkout', 'checkout.created'],
  ['checkouts.create', 'checkout.created'],
  ['update_checkout', 'checkout.updated'],
  ['checkouts.update', 'checkout.updated'],
  ['create_coupon', 'coupon.created'],
  ['coupons.create', 'coupon.created'],
  ['update_coupon', 'coupon.updated'],
  ['delete_coupon', 'coupon.deleted'],
  ['coupons.delete', 'coupon.deleted'],
  ['create_payment_link', 'checkout.generated'],
  ['send_message', 'message.sent'],
  ['send_audio', 'message.sent'],
  ['send_document', 'message.sent'],
  ['send_media', 'message.sent'],
  ['send_voice_note', 'message.sent'],
  ['qualify_lead', 'lead.qualified'],
  ['add_tag', 'contact.segmented'],
  ['update_lead_status', 'contact.segmented'],
]);

export function mapBrainActionToDomainEvent(action: string): BrainEventName | null {
  return ACTION_TO_EVENT.get(action) ?? null;
}

export function didBrainActionSucceed(action: unknown): boolean {
  if (!action || typeof action !== 'object') {
    return false;
  }
  const result = (action as Record<string, unknown>).result;
  return isSuccessfulBrainResult(result);
}

export function readBrainActionName(action: unknown): string | null {
  if (!action || typeof action !== 'object') {
    return null;
  }
  const raw = (action as Record<string, unknown>).tool;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function isSuccessfulBrainResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') {
    return true;
  }
  const record = result as Record<string, unknown>;
  return record.success !== false && typeof record.error !== 'string';
}
