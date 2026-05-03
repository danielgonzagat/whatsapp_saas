import type { PulseDiscoveredCommand } from './types';
import { classifyCommand } from './discovery';

export function dockerCommands(sourcePath: string, text: string): PulseDiscoveredCommand[] {
  const commands: PulseDiscoveredCommand[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const runMatch = /^RUN\s+(.+)$/i.exec(trimmed);
    const cmdMatch = /^CMD\s+(.+)$/i.exec(trimmed);
    const commandText = runMatch?.[1] ?? cmdMatch?.[1];
    if (!commandText) {
      return;
    }
    const classification = classifyCommand(null, commandText);
    if (classification.purpose === 'other' && !/\bnpm\b|\bnpx\b/.test(commandText)) {
      return;
    }
    commands.push({
      id: `docker:${sourcePath}:${index + 1}`,
      purpose: classification.purpose,
      command: commandText,
      sourcePath,
      sourceKind: 'dockerfile',
      confidence: classification.confidence,
      signals: ['dockerfile', ...classification.signals],
    });
  });
  return commands;
}

export function workflowRunBlocks(text: string): string[] {
  const commands: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const inlineMatch = /^(\s*)run:\s*(.+)$/.exec(line);
    if (inlineMatch?.[2] && !['|', '>'].includes(inlineMatch[2].trim())) {
      commands.push(inlineMatch[2].trim());
      continue;
    }
    const blockMatch = /^(\s*)run:\s*[|>]?\s*$/.exec(line);
    if (!blockMatch) {
      continue;
    }
    const baseIndent = blockMatch[1].length;
    const blockLines: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor] ?? '';
      if (candidate.trim() && candidate.search(/\S/) <= baseIndent) {
        break;
      }
      if (candidate.trim()) {
        blockLines.push(candidate.trim());
      }
      index = cursor;
    }
    if (blockLines.length > 0) {
      commands.push(blockLines.join(' && '));
    }
  }
  return commands;
}

export function workflowCommands(sourcePath: string, text: string): PulseDiscoveredCommand[] {
  return workflowRunBlocks(text).map((command, index) => {
    const classification = classifyCommand(null, command);
    return {
      id: `workflow:${sourcePath}:${index + 1}`,
      purpose: classification.purpose,
      command,
      sourcePath,
      sourceKind: 'github-workflow' as const,
      confidence: classification.confidence,
      signals: ['github-workflow', ...classification.signals],
    };
  });
}
