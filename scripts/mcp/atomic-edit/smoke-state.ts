import * as crypto from 'node:crypto';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

export const state = { passed: 0, failed: 0 };

export function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    state.passed++;
    process.stdout.write(`  PASS  ${name}\n`);
  } else {
    state.failed++;
    process.stdout.write(`  FAIL  ${name} ${detail}\n`);
  }
}

export const sha = (value: string | Buffer): string =>
  crypto.createHash('sha256').update(value).digest('hex');

export function jsonBody(response: { content: { text: string }[] }): any {
  for (let index = response.content.length - 1; index >= 0; index--) {
    const text = response.content[index]?.text;
    if (!text) continue;
    try {
      return JSON.parse(text);
    } catch {
      // Hot-reload wrappers can add human text before or after the JSON block.
    }
  }
  throw new SyntaxError(
    `No JSON content block in tool response: ${response.content.map((part) => part.text).join('\n').slice(0, 500)}`,
  );
}

/** Shared context passed between Part B sub-tests. */
export interface PartBCtx {
  client: Client;
  fixtureAbs: string;
  fixtureRel: string;
  repoRoot: string;
}
