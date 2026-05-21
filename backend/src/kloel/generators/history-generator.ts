import { generateConversations } from './conversation-generator';
import { generateLeads } from './lead-generator';
import { generateProducts } from './product-generator';

export function generateHistory(seed: string | number, days: number) {
  const leads = generateLeads(`${seed}:leads:${days}`, Math.max(1, days * 8));
  const products = generateProducts(`${seed}:products`, 6);
  const conversations = generateConversations(`${seed}:conversations:${days}`, leads);
  return { conversations, days, leads, products };
}
