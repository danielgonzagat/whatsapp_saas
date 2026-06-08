import type { MemoryContextForModel, RetrievedMemory } from './memory-graph.types';

export const EMPTY_MEMORY_CONTEXT: MemoryContextForModel = {
  userProfileStatic: [],
  userProfileDynamic: [],
  relevantMemories: [],
  preferences: [],
  constraints: [],
  text: '',
};

export function buildMemoryContextFromRetrieved(
  relevant: RetrievedMemory[],
): MemoryContextForModel {
  if (relevant.length === 0) {
    return EMPTY_MEMORY_CONTEXT;
  }

  const userProfileStatic: string[] = [];
  const userProfileDynamic: string[] = [];
  const relevantMemories: string[] = [];
  const preferences: string[] = [];
  const constraints: string[] = [];

  for (const mem of relevant) {
    const line = mem.summary?.trim() ? mem.summary.trim() : mem.content;
    switch (mem.type) {
      case 'fact':
      case 'entity':
        userProfileStatic.push(line);
        break;
      case 'project':
      case 'goal':
      case 'decision':
        userProfileDynamic.push(line);
        break;
      case 'preference':
        preferences.push(line);
        break;
      case 'contradiction':
        constraints.push(line);
        break;
      default:
        relevantMemories.push(line);
        break;
    }
  }

  const sections: string[] = [];
  const pushSection = (title: string, items: readonly string[]): void => {
    if (items.length > 0) {
      sections.push(`${title}:\n${items.map((i) => `- ${i}`).join('\n')}`);
    }
  };
  pushSection('PERFIL DO USUÁRIO (estável)', userProfileStatic);
  pushSection('ESTADO ATUAL DO USUÁRIO (projetos/objetivos/decisões)', userProfileDynamic);
  pushSection('PREFERÊNCIAS DO USUÁRIO', preferences);
  pushSection('RESTRIÇÕES', constraints);
  pushSection('MEMÓRIAS RELEVANTES PARA ESTA CONVERSA', relevantMemories);

  const text = sections.length
    ? `MEMÓRIA DO USUÁRIO (aprendida em conversas anteriores):\n\n${sections.join('\n\n')}`
    : '';

  return {
    userProfileStatic,
    userProfileDynamic,
    relevantMemories,
    preferences,
    constraints,
    text,
  };
}
