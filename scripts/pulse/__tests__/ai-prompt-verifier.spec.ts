import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { checkAiPromptVerifier } from '../parsers/ai-prompt-verifier';
import type { PulseConfig } from '../types';

function makeConfig(rootDir: string): PulseConfig {
  return {
    rootDir,
    frontendDir: path.join(rootDir, 'frontend'),
    backendDir: path.join(rootDir, 'backend'),
    workerDir: path.join(rootDir, 'worker'),
    schemaPath: path.join(rootDir, 'prisma/schema.prisma'),
    globalPrefix: '',
  };
}

function writeBackendAgent(rootDir: string, source: string): void {
  const file = path.join(rootDir, 'backend/src/discovered-agent.ts');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
}

describe('AI prompt verifier', () => {
  it('derives prompt completeness from discovered context input usage', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ai-prompt-'));
    writeBackendAgent(
      rootDir,
      [
        'export async function reply(params: { workspaceId: string; message: string }) {',
        '  const [workspace, products, conversationHistory] = await Promise.all([',
        '    loadWorkspace(params.workspaceId),',
        '    loadProducts(params.workspaceId),',
        '    loadHistory(params.workspaceId),',
        '  ]);',
        '  const aiConfigs = await loadConfigs(products);',
        '  const systemPrompt = buildSystemPrompt(workspace, products, aiConfigs);',
        '  const messages = [',
        '    { role: "system", content: systemPrompt },',
        '    ...conversationHistory,',
        '    { role: "user", content: params.message },',
        '  ];',
        '  return OpenAI.chatCompletion({ messages, model: "test" });',
        '}',
      ].join('\n'),
    );

    expect(checkAiPromptVerifier(makeConfig(rootDir))).toEqual([]);
  });

  it('reports a discovered context input when prompt payload omits it', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ai-prompt-missing-'));
    writeBackendAgent(
      rootDir,
      [
        'export async function reply(params: { workspaceId: string; message: string }) {',
        '  const cognitiveState = await loadCognitiveState(params.workspaceId);',
        '  const systemPrompt = "Answer briefly";',
        '  const messages = [{ role: "user", content: params.message }];',
        '  return OpenAI.chatCompletion({ messages, systemPrompt, model: "test" });',
        '}',
      ].join('\n'),
    );

    expect(checkAiPromptVerifier(makeConfig(rootDir))).toEqual([
      expect.objectContaining({
        type: 'AI_PROMPT_INCOMPLETE',
        description: 'AI prompt assembly drops discovered cognition context',
        detail: expect.stringContaining('cognitiveState'),
      }),
    ]);
  });
});
