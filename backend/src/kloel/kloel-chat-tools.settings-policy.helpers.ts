import { StructuredLogger } from '../logging/structured-logger';
import { safeStr } from '../common/string';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';
const NON_SLUG_CHAR_RE = /[^a-z0-9_:-]+/g;
export interface ToolToggleAutopilotArgs {
  enabled: boolean;
}

export interface ToolSetBrandVoiceArgs {
  tone: string;
  personality?: string;
}

export interface ToolSetSalesPolicyArgs {
  aggressiveness?: string;
  tone?: string;
  instructions?: string;
  appliesTo?: string;
}

export interface ToolRememberUserInfoArgs {
  key: string;
  value: string;
}
const logger = StructuredLogger.from('KloelChatToolsSettingsPolicy');
export async function runToggleAutopilot(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolToggleAutopilotArgs,
): Promise<ToolResult> {
  const settingsSnapshot = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  const currentSettings = (settingsSnapshot?.providerSettings as Record<string, unknown>) || {};
  logger.log('Autopilot decision', {
    context: 'KloelChatTools.toolToggleAutopilot',
    decision: args.enabled ? 'enable' : 'disable',
    billingSuspended: currentSettings.billingSuspended === true,
  });
  if (args.enabled && currentSettings.billingSuspended === true) {
    return {
      success: false,
      enabled: false,
      error: 'Autopilot suspenso: regularize cobrança para ativar.',
    };
  }
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const newSettings = {
      ...settings,
      autopilot: {
        ...((settings.autopilot as Record<string, unknown>) || {}),
        enabled: args.enabled,
      },
      autopilotEnabled: args.enabled,
    };
    await tx.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: newSettings },
    });
    return {
      success: true,
      enabled: args.enabled,
      message: args.enabled ? 'Autopilot ativado.' : 'Autopilot desativado.',
    };
  });
}
export async function runSetBrandVoice(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolSetBrandVoiceArgs,
): Promise<ToolResult> {
  await prisma.kloelMemory.upsert({
    where: { workspaceId_key: { workspaceId, key: 'brandVoice' } },
    update: {
      value: { style: args.tone, personality: args.personality || '' },
      category: 'preferences',
      type: 'persona',
      content: `Tom: ${args.tone}. ${args.personality || ''}`.trim(),
      metadata: { tone: args.tone, personality: args.personality || '' },
    },
    create: {
      workspaceId,
      key: 'brandVoice',
      value: { style: args.tone, personality: args.personality || '' },
      category: 'preferences',
      type: 'persona',
      content: `Tom: ${args.tone}. ${args.personality || ''}`.trim(),
      metadata: { tone: args.tone, personality: args.personality || '' },
    },
  });
  return { success: true, message: `Tom de voz definido como "${args.tone}"` };
}
export async function runSetSalesPolicy(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolSetSalesPolicyArgs,
  userId?: string,
): Promise<ToolResult> {
  const aggressiveness = safeStr(args.aggressiveness, 'balanced').trim().slice(0, 40);
  const tone = safeStr(args.tone, '').trim().slice(0, 80);
  const instructions = safeStr(args.instructions, '').trim().slice(0, 1000);
  const appliesTo = safeStr(args.appliesTo, 'all').trim().slice(0, 120);
  if (!aggressiveness && !tone && !instructions) {
    return { success: false, error: 'missing_sales_policy_payload' };
  }
  const policy = {
    aggressiveness: aggressiveness || 'balanced',
    tone: tone || null,
    instructions: instructions || null,
    appliesTo: appliesTo || 'all',
    updatedAt: new Date().toISOString(),
    updatedByUserId: userId || null,
  } satisfies Prisma.InputJsonObject;
  await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const autopilot = (settings.autopilot as Record<string, unknown>) || {};
    await tx.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...settings,
          autopilot: {
            ...autopilot,
            salesPolicy: policy,
          },
        },
      },
    });
  });
  return {
    success: true,
    policy,
    message: `Politica comercial atualizada: agressividade ${policy.aggressiveness}.`,
  };
}
export async function runRememberUserInfo(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolRememberUserInfoArgs,
  userId?: string,
): Promise<ToolResult> {
  const normalizedKey = String(args?.key || '')
    .trim()
    .toLowerCase()
    .replace(NON_SLUG_CHAR_RE, '_')
    .slice(0, 80);
  const value = String(args?.value || '').trim();
  if (!normalizedKey || !value) {
    return { success: false, error: 'missing_user_memory_payload' };
  }
  const profileKey = `user_profile:${userId || 'workspace_owner'}`;
  const existing = await prisma.kloelMemory.findUnique({
    where: { workspaceId_key: { workspaceId, key: profileKey } },
  });
  const currentValue =
    existing?.value && typeof existing.value === 'object'
      ? (existing.value as Record<string, Prisma.JsonValue>)
      : {};
  const nextValue: Record<string, Prisma.JsonValue> = {
    ...currentValue,
    [normalizedKey]: value,
    updatedAt: new Date().toISOString(),
    userId: userId || null,
  };
  const contentLines = Object.entries(nextValue)
    .filter(([k]) => !['updatedAt', 'userId'].includes(k))
    .map(([k, v]) => k + ': ' + safeStr(v))
    .join('\n');
  await prisma.kloelMemory.upsert({
    where: { workspaceId_key: { workspaceId, key: profileKey } },
    update: {
      value: nextValue,
      category: 'user_preferences',
      type: 'user_profile',
      content: contentLines,
      metadata: {
        ...((existing?.metadata as Record<string, unknown>) || {}),
        userId: userId || null,
        source: 'remember_user_info',
      },
    },
    create: {
      workspaceId,
      key: profileKey,
      value: nextValue,
      category: 'user_preferences',
      type: 'user_profile',
      content: contentLines,
      metadata: { userId: userId || null, source: 'remember_user_info' },
    },
  });
  return { success: true, message: `Memória "${normalizedKey}" salva.` };
}
