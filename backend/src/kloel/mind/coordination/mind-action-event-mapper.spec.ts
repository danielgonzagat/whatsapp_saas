import {
  didBrainActionSucceed,
  mapBrainActionToDomainEvent,
  readBrainActionName,
} from './mind-action-event-mapper';

describe('brain action event mapper', () => {
  it('maps tool names to domain events', () => {
    expect(mapBrainActionToDomainEvent('create_product')).toBe('product.created');
    expect(mapBrainActionToDomainEvent('update_product')).toBe('product.updated');
    expect(mapBrainActionToDomainEvent('products.update')).toBe('product.updated');
    expect(mapBrainActionToDomainEvent('products.upload_image')).toBe('product.updated');
    expect(mapBrainActionToDomainEvent('delete_product')).toBe('product.deleted');
    expect(mapBrainActionToDomainEvent('publish_product')).toBe('product.published');
    expect(mapBrainActionToDomainEvent('products.review_and_publish')).toBe('product.published');
    expect(mapBrainActionToDomainEvent('create_plan')).toBe('plan.created');
    expect(mapBrainActionToDomainEvent('plans.create')).toBe('plan.created');
    expect(mapBrainActionToDomainEvent('update_plan')).toBe('plan.updated');
    expect(mapBrainActionToDomainEvent('plans.update')).toBe('plan.updated');
    expect(mapBrainActionToDomainEvent('create_checkout')).toBe('checkout.created');
    expect(mapBrainActionToDomainEvent('checkouts.create')).toBe('checkout.created');
    expect(mapBrainActionToDomainEvent('update_checkout')).toBe('checkout.updated');
    expect(mapBrainActionToDomainEvent('checkouts.update')).toBe('checkout.updated');
    expect(mapBrainActionToDomainEvent('create_coupon')).toBe('coupon.created');
    expect(mapBrainActionToDomainEvent('coupons.create')).toBe('coupon.created');
    expect(mapBrainActionToDomainEvent('update_coupon')).toBe('coupon.updated');
    expect(mapBrainActionToDomainEvent('delete_coupon')).toBe('coupon.deleted');
    expect(mapBrainActionToDomainEvent('coupons.delete')).toBe('coupon.deleted');
    expect(mapBrainActionToDomainEvent('send_message')).toBe('message.sent');
    expect(mapBrainActionToDomainEvent('qualify_lead')).toBe('lead.qualified');
  });

  it('detects failed action results', () => {
    expect(didBrainActionSucceed({ tool: 'send_message', result: { success: false } })).toBe(false);
    expect(didBrainActionSucceed({ tool: 'send_message', result: { error: 'failed' } })).toBe(
      false,
    );
    expect(didBrainActionSucceed({ tool: 'send_message', result: { success: true } })).toBe(true);
  });

  it('reads action names defensively', () => {
    expect(readBrainActionName({ tool: 'create_product' })).toBe('create_product');
    expect(readBrainActionName({ tool: '' })).toBeNull();
    expect(readBrainActionName(null)).toBeNull();
  });
});
