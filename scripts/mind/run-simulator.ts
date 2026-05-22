import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateAdversarialScenarios } from '../../backend/src/kloel/generators/adversarial-generator';
import { generateConversations } from '../../backend/src/kloel/generators/conversation-generator';
import { generateHistory } from '../../backend/src/kloel/generators/history-generator';
import { generateLeads } from '../../backend/src/kloel/generators/lead-generator';
import { generateProducts } from '../../backend/src/kloel/generators/product-generator';
import { MindQualityService } from '../../backend/src/kloel/mind-quality.service';
import { MindReplayService } from '../../backend/src/kloel/mind-replay.service';
import { MindSimulatorService } from '../../backend/src/kloel/mind-simulator.service';
import { MindSyntheticGeneratorService } from '../../backend/src/kloel/mind-synthetic-generator.service';

const seed = process.env.MIND_SIMULATOR_SEED || 'kloel-ci-266';
const workspaceId = process.env.MIND_SIMULATOR_WORKSPACE_ID || 'ci-synthetic-workspace';
const outputPath = resolve(
  process.cwd(),
  process.env.MIND_SIMULATOR_REPORT || 'simulator-report.md',
);

const leads = generateLeads(seed, 1000);
const conversationLeads = generateLeads(`${seed}:conversation-leads`, 5000);
const conversations = generateConversations(`${seed}:conversations`, conversationLeads);
const products = generateProducts(`${seed}:products`, 40);
const history = generateHistory(`${seed}:history`, 7);
const adversarial = generateAdversarialScenarios(`${seed}:adversarial`);

const simulator = new MindSimulatorService(
  new MindReplayService(),
  new MindQualityService(),
  new MindSyntheticGeneratorService(),
);
const report = simulator.simulateSyntheticWorkspace(workspaceId, 266);
const markdown = [
  simulator.reportToMarkdown(report),
  '',
  '## Synthetic Inputs',
  '',
  `- Seed: \`${seed}\``,
  `- Leads generated: ${leads.length}`,
  `- Conversations generated: ${conversations.length}`,
  `- Products generated: ${products.length}`,
  `- History days: ${history.days}`,
  `- Adversarial scenarios: ${adversarial.length}`,
  '',
  '## Adversarial Scenario Kinds',
  '',
  ...adversarial.map((scenario) => `- ${scenario.kind}`),
  '',
].join('\n');

writeFileSync(outputPath, markdown, 'utf8');
console.log(`MIND simulator report written to ${outputPath}`);
console.log(
  JSON.stringify({
    adversarialScenarios: adversarial.length,
    conversations: conversations.length,
    products: products.length,
    qualityFailed: report.summary.qualityFailed,
    seed,
    verdict: report.summary.overallVerdict,
    workspaceId,
  }),
);
