import { generateAdversarialScenarios } from './adversarial-generator';
import { generateConversations } from './conversation-generator';
import { generateHistory } from './history-generator';
import { generateLeads } from './lead-generator';
import { generateProducts } from './product-generator';

describe('commercial generators', () => {
  it('are reproducible for the same seed', () => {
    expect(generateLeads('seed-1', 5)).toEqual(generateLeads('seed-1', 5));
    expect(generateProducts('seed-1', 5)).toEqual(generateProducts('seed-1', 5));
    expect(generateHistory('seed-1', 3)).toEqual(generateHistory('seed-1', 3));
    expect(generateAdversarialScenarios('seed-1')).toEqual(generateAdversarialScenarios('seed-1'));
  });

  it('generates plausible conversations for generated leads', () => {
    const leads = generateLeads('conversation-seed', 3);
    const conversations = generateConversations('conversation-seed', leads);

    expect(conversations).toHaveLength(3);
    expect(conversations[0]?.turns.length).toBeGreaterThan(0);
    expect(conversations[0]?.turns[0]?.text).toContain(`lead=${leads[0]?.profile}`);
  });
});
