import type { PrismaService } from '../prisma/prisma.service';
import type { MindPerceptionService } from './mind-perception.service';
import type { MemoryProjector } from './commem/memory.projector';
import type { MindPerceptEvent } from './mind.types';
import type { SpineEventRef } from './mind/mind.types';
import type {
  AbiAttention,
  AbiBelief,
  AbiConsolidatedRef,
  AbiEpisodicRef,
  AbiPredictions,
  AbiPulseTruth,
  AbiSalientEvent,
  AbiValence,
  AbiValenceSection,
  AbiWorkingMemoryItem,
} from './abi/abi-schema';
import {
  computeDissolutionGaps,
  type DissolutionGap,
} from './brain-capability-executor.substrate.helpers';

export interface CognitiveSubstrate {
  recentSalientEvents: AbiSalientEvent[];
  workingMemory: AbiWorkingMemoryItem[];
  episodicRefs: AbiEpisodicRef[];
  consolidatedRefs: AbiConsolidatedRef[];
  dissolution: DissolutionGap[];
  beliefs: AbiBelief[];
  predictions: AbiPredictions;
  pulseTruth: AbiPulseTruth;
  valence: AbiValenceSection;
  attention: AbiAttention;
}

export interface SubstrateDeps {
  prisma: PrismaService;
  mindPerception: MindPerceptionService;
  memoryProjector: MemoryProjector;
}

export async function buildCognitiveSubstrate(
  deps: SubstrateDeps,
  workspaceId: string,
): Promise<CognitiveSubstrate> {
  const { prisma, mindPerception, memoryProjector } = deps;
  const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const events = await mindPerception.since(workspaceId, new Date(sinceMs));

  const valenceOf = (kind: string): AbiValence => {
    if (/\b(error|failed|fail|abandon|chargeback|refund)\b/i.test(kind)) {
      return 'negative';
    }
    if (/\b(sale|order|paid|converted|executed|success)\b/i.test(kind)) {
      return 'positive';
    }
    return 'neutral';
  };
  const eventId = (e: MindPerceptEvent, i: number): string =>
    `evt_${new Date(e.occurredAt).getTime().toString(36)}_${i.toString(36)}`;

  const ordered = [...events].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  // Carry the REAL salient content (message text persisted in the
  // event meta) into the substrate — not just the event name — so
  // cross-session FACTUAL recall is genuinely substrate-driven
  // (Kloel can recall what was said in prior sessions from its own
  // cognitive state, not the legacy context injector).
  const salientContent = (e: MindPerceptEvent): string => {
    const p = (e.payload ?? undefined) as Record<string, unknown> | undefined;
    const meta =
      p && typeof p.meta === 'object' && p.meta ? (p.meta as Record<string, unknown>) : undefined;
    // ROOT-CAUSE FIX (proven from prod spine data): NEVER surface
    // Kloel's own replyPreview as a recallable fact. Doing so created
    // a self-reinforcing ECHO ATTRACTOR — a value Kloel once recalled
    // got persisted in its own reply, inflated its frequency, became
    // the dominant "belief", and was recalled forever, drowning fresh
    // user facts. Only what the USER actually stated
    // (userPreview / inbound contentPreview) is ground truth.
    const txt =
      (meta && typeof meta.userPreview === 'string' && meta.userPreview) ||
      (p && typeof p.contentPreview === 'string' && p.contentPreview) ||
      '';
    return txt ? `${e.kind}: ${String(txt).slice(0, 280)}` : `${e.kind} — ${e.subject}`;
  };
  const recentSalientEvents: AbiSalientEvent[] = ordered.slice(0, 30).map((e, i) => ({
    eventId: eventId(e, i),
    eventName: e.kind,
    occurredAt: e.occurredAt.toISOString(),
    summary: salientContent(e),
    valence: valenceOf(e.kind),
  }));

  const spineEvents: SpineEventRef[] = events.map((e, i) => ({
    eventId: eventId(e, i),
    eventName: e.kind,
    workspaceId,
    occurredAt: e.occurredAt.toISOString(),
    truthMode: 'observed',
    valence: valenceOf(e.kind),
    payload: e.payload,
  }));
  const projections = memoryProjector.projectAll({
    events: spineEvents,
    workspaceId,
    dimensions: ['working', 'episodic', 'consolidated'],
  });
  const byDim = (dim: string) => projections.find((p) => p.dimension === dim);

  const workingMemory: AbiWorkingMemoryItem[] = (byDim('working')?.items ?? [])
    .slice(0, 50)
    .map((it) => ({
      itemId: it.id,
      kind: 'fact' as const,
      content: `${it.sourceEventName} (${it.tags.join(',') || 'event'})`,
      addedAt: it.occurredAt,
    }));
  const episodicRefs: AbiEpisodicRef[] = (byDim('episodic')?.items ?? [])
    .slice(0, 50)
    .map((it) => ({
      episodeId: it.id,
      summary: it.sourceEventName,
      occurredAt: it.occurredAt,
    }));
  const consolidatedRefs: AbiConsolidatedRef[] = (byDim('consolidated')?.items ?? [])
    .slice(0, 50)
    .map((it) => ({
      skillId: it.id,
      summary: it.sourceEventName,
      consolidatedAt: it.occurredAt,
    }));

  const dissolution = computeDissolutionGaps(events.map((e) => e.kind));

  // Belief induction (frequency + valence, Beta(1,1) posterior mean).
  // 100% derived from real workspace events. Epistemically honest: thin
  // evidence ⇒ confidence stays near 0.5 (no overclaim); a kind needs
  // ≥3 occurrences to crystallize a belief. truthMode='inferred'.
  const byKind = new Map<string, { n: number; pos: number; last: Date }>();
  for (const e of events) {
    const k = e.kind;
    const cur = byKind.get(k) ?? { n: 0, pos: 0, last: e.occurredAt };
    cur.n += 1;
    if (valenceOf(k) === 'positive') {
      cur.pos += 1;
    }
    if (e.occurredAt > cur.last) {
      cur.last = e.occurredAt;
    }
    byKind.set(k, cur);
  }
  const beliefs: AbiBelief[] = [...byKind.entries()]
    .filter(([, s]) => s.n >= 3)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 20)
    .map(([kind, s]) => ({
      beliefId: `blf_${kind.replace(/[^a-z0-9]/gi, '_').slice(0, 40)}`,
      subject: kind.split(/[._]/)[0] || kind,
      proposition: `evento "${kind}" recorre no workspace (n=${s.n}, janela 7d)`,
      confidence: (s.pos + 1) / (s.n + 2),
      evidenceCount: s.n,
      lastUpdated: s.last.toISOString(),
      truthMode: 'inferred' as const,
    }));

  // Consolidation (pillar #1): a belief reinforced ≥10× over the
  // window IS consolidated long-term knowledge — the working→episodic
  // →consolidated promotion by repetition/strength Kloel asked for.
  // Honest: empty when no belief is strong enough (gap persists, no
  // fabrication). Merged with the projector's consolidated dimension.
  const consolidatedFromBeliefs: AbiConsolidatedRef[] = beliefs
    .filter((b) => b.evidenceCount >= 10)
    .map((b) => ({
      skillId: `cns_${b.beliefId}`,
      summary: `conhecimento consolidado por reforço: ${b.proposition}`,
      consolidatedAt: b.lastUpdated,
    }));

  // Prediction generation (base-rate). Honest: only when total ≥ 5
  // (else empty — no fabrication on thin data). recentSurprises stays
  // [] because true surprise detection requires PERSISTED prior
  // predictions to compare against (a later cycle / pillar #1).
  const total = events.length;
  const topKind = [...byKind.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  const predictions: AbiPredictions =
    total >= 5 && topKind
      ? {
          active: [
            {
              predictionId: `prd_next_${Date.now().toString(36)}`,
              about: 'próximo evento cognitivo do workspace',
              expectedOutcome: `mais provável: "${topKind[0]}"`,
              confidence: topKind[1].n / total,
              horizonHours: 24,
            },
          ],
          recentSurprises: [],
        }
      : { active: [], recentSurprises: [] };

  // Epistemic certification GROUNDED in real spine evidence (gap #2).
  // capabilityHealthScore = real success ratio of operational events;
  // verdict only leaves INSUFFICIENT_EVIDENCE with ≥20 real events
  // (honest — no fabrication on thin evidence). gates/overclaimRisk
  // stay [] / 0 because no real gate engine exists yet (honest).
  const evidenceCount = events.length;
  const failures = events.filter((e) => valenceOf(e.kind) === 'negative').length;
  const successRate = evidenceCount > 0 ? (evidenceCount - failures) / evidenceCount : 0;
  const measuredAtIso = new Date().toISOString();
  const cert =
    evidenceCount < 20
      ? { verdict: 'INSUFFICIENT_EVIDENCE' as const, score: 0, measuredAt: measuredAtIso }
      : {
          verdict: successRate >= 0.8 ? ('SIM' as const) : ('NAO' as const),
          score: Number(successRate.toFixed(4)),
          measuredAt: measuredAtIso,
        };
  // Gap #6 fix: noOverclaimStatus + overclaimRisk DERIVED from the
  // verdict — the previous hardcoded PASS with score 0 was a logical
  // impossibility (false-safe). No evidence ⇒ WARN + max risk; NAO ⇒
  // FAIL; only SIM ⇒ PASS.
  const noOverclaim: 'PASS' | 'WARN' | 'FAIL' =
    cert.verdict === 'SIM' ? 'PASS' : cert.verdict === 'NAO' ? 'FAIL' : 'WARN';
  const overclaimRisk =
    cert.verdict === 'INSUFFICIENT_EVIDENCE' ? 1 : Number((1 - successRate).toFixed(4));
  const pulseTruth: AbiPulseTruth = {
    noOverclaimStatus: noOverclaim,
    capabilityHealthScore: Number(successRate.toFixed(4)),
    gates: [],
    certificationVerdict: cert,
    overclaimRisk,
  };

  // Real valence (gap #6): recentTrace + aggregatedMood from the live
  // spine events (valenceOf classifies each kind). No longer a mute
  // static neutral:1 — the mood now reflects actual workspace events.
  const recentForValence = ordered.slice(0, 20);
  const valenceTrace = recentForValence.map((e, i) => ({
    eventId: eventId(e, i),
    valence: valenceOf(e.kind),
    weight: 1,
    occurredAt: e.occurredAt.toISOString(),
  }));
  const moodCount = { positive: 0, negative: 0, neutral: 0, ambiguous: 0 };
  for (const e of events) {
    moodCount[valenceOf(e.kind)] += 1;
  }
  const moodTotal = events.length || 1;
  const valence: AbiValenceSection = {
    recentTrace: valenceTrace,
    aggregatedMood: {
      positive: Number((moodCount.positive / moodTotal).toFixed(4)),
      negative: Number((moodCount.negative / moodTotal).toFixed(4)),
      neutral: events.length === 0 ? 1 : Number((moodCount.neutral / moodTotal).toFixed(4)),
      ambiguous: Number((moodCount.ambiguous / moodTotal).toFixed(4)),
      windowHours: 168,
    },
  };

  // Attention (gap: attention.candidates was []): rank recent events
  // by recency × valence magnitude so Kloel can prioritize what to
  // focus on (hottest conversation/lead first). 100% real, additive.
  const nowMs = Date.now();
  const valWeight = (v: AbiValence): number =>
    v === 'positive' ? 1 : v === 'negative' ? 0.9 : v === 'ambiguous' ? 0.6 : 0.3;
  const attnRanked = ordered.slice(0, 40).map((e) => {
    const ageH = Math.max(0, (nowMs - e.occurredAt.getTime()) / 3_600_000);
    const recency = 1 / (1 + ageH / 24);
    return {
      targetType: e.kind.split(/[._]/)[0] || 'event',
      targetId: e.subject || e.kind,
      weight: Number((recency * valWeight(valenceOf(e.kind))).toFixed(4)),
    };
  });
  attnRanked.sort((a, b) => b.weight - a.weight);
  const attnCandidates = attnRanked.slice(0, 15);
  const attention: AbiAttention = {
    candidates: attnCandidates,
    ...(attnCandidates[0]
      ? {
          focal: {
            targetType: attnCandidates[0].targetType,
            targetId: attnCandidates[0].targetId,
            reason: 'highest recency×valence salience',
            sinceMs: nowMs,
          },
        }
      : {}),
  };

  // Gap #9: ingest the real workspace catalog into BELIEFS (source +
  // confidence + date), so product facts are part of the organism —
  // not just external context. truthMode 'observed' (catalog is fact).
  let catalogBeliefs: AbiBelief[] = [];
  try {
    const products = await prisma.product.findMany({
      where: { workspaceId, active: true },
      select: { id: true, name: true, price: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    });
    catalogBeliefs = products.map((p) => ({
      beliefId: `blf_catalog_${p.id.slice(0, 16)}`,
      subject: 'catalog',
      proposition: `produto "${p.name}" ativo no workspace (preço R$ ${p.price})`,
      confidence: 1,
      evidenceCount: 1,
      lastUpdated: p.updatedAt.toISOString(),
      truthMode: 'observed' as const,
    }));
  } catch {
    catalogBeliefs = [];
  }

  return {
    recentSalientEvents,
    workingMemory,
    episodicRefs,
    consolidatedRefs: [...consolidatedRefs, ...consolidatedFromBeliefs].slice(0, 50),
    dissolution,
    beliefs: [...catalogBeliefs, ...beliefs].slice(0, 40),
    predictions,
    pulseTruth,
    valence,
    attention,
  };
}
