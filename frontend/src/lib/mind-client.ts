'use client';

import { api } from './api/core';

export interface MindBelief {
  id?: string;
  workspaceId: string;
  subject: string;
  predicate: string;
  context: Record<string, unknown>;
  mean: number;
  variance: number;
  samples: number;
  alpha: number;
  beta: number;
}

export interface MindTick {
  workspaceId: string;
  perceived: number;
  predicted: number;
  resolved: number;
  surpriseTotal: number;
  beliefsUpdated: number;
  decisionsMade: number;
  durationMs: number;
}

export interface MindLift {
  baselineMean: number;
  lift: number;
  mindMean: number;
  n: number;
  pZScore: number;
}

export interface MindNarrateOutput {
  briefing: string;
}

function mindUrl(
  workspaceId: string,
  path: string,
  query?: Record<string, string | undefined>,
): string {
  const base = `/mind/${encodeURIComponent(workspaceId)}${path}`;
  if (!query) return base;
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) search.set(k, v);
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function getBeliefs(
  workspaceId: string,
  predicate: string,
  subject?: string,
): Promise<MindBelief[]> {
  const result = await api.get<MindBelief[]>(
    mindUrl(workspaceId, '/beliefs', { predicate, subject }),
  );
  return result.data;
}

export async function getLift(
  workspaceId: string,
  decisionType: string,
  sinceDays = 14,
): Promise<MindLift> {
  const result = await api.get<MindLift>(
    mindUrl(workspaceId, `/lift/${encodeURIComponent(decisionType)}`, {
      sinceDays: String(sinceDays),
    }),
  );
  return result.data;
}

export async function postTick(workspaceId: string): Promise<MindTick> {
  const result = await api.post<MindTick>(mindUrl(workspaceId, '/tick'));
  return result.data;
}

export async function getNarrate(workspaceId: string): Promise<MindNarrateOutput> {
  const result = await api.get<MindNarrateOutput>(mindUrl(workspaceId, '/narrate'));
  return result.data;
}

export interface MindChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface MindChatRequest {
  messages: MindChatMessage[];
  context?: Record<string, unknown>;
}

export interface MindChatResponse {
  message: MindChatMessage;
  confidence: number;
  beliefsUsed: string[];
  ticketId: string;
}

export async function postChat(
  workspaceId: string,
  body: MindChatRequest,
): Promise<MindChatResponse> {
  const result = await api.post<MindChatResponse>(mindUrl(workspaceId, '/chat'), body);
  return result.data;
}
