import { MindCaseMemoryService } from './mind-case-memory.service';

export async function resolveCaseMemoryAction(
  cases: MindCaseMemoryService,
  input: {
    caseType: string;
    features: Record<string, unknown>;
    minSimilarCases: number;
    minSimilarityTotal: number;
    options: readonly string[];
    text: string;
    workspaceId: string;
  },
): Promise<string | null> {
  const similar = await cases.similar({
    workspaceId: input.workspaceId,
    caseType: input.caseType,
    text: input.text,
    features: input.features,
    limit: 30,
  });

  if (similar.length < input.minSimilarCases) {
    return null;
  }

  const actionScores = new Map<
    string,
    { similaritySum: number; outcomeSum: number; count: number }
  >();

  for (const row of similar) {
    if (!input.options.includes(row.action)) {
      continue;
    }

    const entry = actionScores.get(row.action) ?? {
      similaritySum: 0,
      outcomeSum: 0,
      count: 0,
    };

    entry.similaritySum += row.similarity;
    if (typeof row.outcome === 'number') {
      entry.outcomeSum += row.outcome;
    }
    entry.count += 1;
    actionScores.set(row.action, entry);
  }

  if (actionScores.size === 0) {
    return null;
  }

  let bestAction: string | null = null;
  let bestScore = -Infinity;

  for (const [action, entry] of actionScores) {
    const outcomeRate = entry.count > 0 ? entry.outcomeSum / entry.count : 0;
    const score = entry.similaritySum * 0.3 + outcomeRate * 0.7;
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }

  const totalSimilarity = similar.reduce((sum, row) => sum + row.similarity, 0);
  if (totalSimilarity < input.minSimilarityTotal) {
    return null;
  }

  return bestAction;
}
