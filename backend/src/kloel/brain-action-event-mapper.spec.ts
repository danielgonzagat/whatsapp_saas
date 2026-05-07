import {
  didBrainActionSucceed,
  mapBrainActionToDomainEvent,
  readBrainActionName,
} from './brain-action-event-mapper';

describe('brain action event mapper', () => {
  it('maps tool names to domain events', () => {
    expect(mapBrainActionToDomainEvent('create_product')).toBe('product.created');
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
