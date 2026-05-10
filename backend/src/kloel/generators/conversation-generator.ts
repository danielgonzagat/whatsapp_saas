import type { GeneratedLead } from './lead-generator';
import { createSeededRandom } from './random';

const INTENTS = ['duvida', 'preco', 'compra', 'confianca', 'abandono'] as const;

export interface GeneratedConversationTurn {
  intent: string;
  minuteOffset: number;
  text: string;
}

export interface GeneratedConversation {
  leadId: string;
  turns: GeneratedConversationTurn[];
}

export function generateConversations(
  seed: string | number,
  leads: GeneratedLead[],
): GeneratedConversation[] {
  const random = createSeededRandom(seed);
  return leads.map((lead) => ({
    leadId: lead.id,
    turns: Array.from({ length: random.int(1, 5) }, (_, index) => {
      const intent = random.pick(INTENTS);
      return {
        intent,
        minuteOffset: index * random.int(2, 20),
        text: `lead=${lead.profile};intent=${intent};channel=${lead.channel}`,
      };
    }),
  }));
}
