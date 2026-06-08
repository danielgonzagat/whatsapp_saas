'use client';

import { useCallback, useMemo, useState } from 'react';

import {
  detectDeliverableAnswerFiles,
  getAssistantReasoning,
  hasProfessionalAnswerFile,
  type AssistantReasoningFile,
} from '@/lib/kloel-message-ui';
import type { DashboardMessage } from '../KloelDashboard.message';
import { artifactFromReasoningFile, type Artifact } from './artifact-types';

/**
 * Collect the real artifacts produced across an assistant conversation.
 *
 * Sources (both real, never fabricated):
 *  1. `reasoning.files` — the real `file` stream events persisted into each
 *     assistant message's metadata (`AssistantReasoningFile[]`).
 *  2. `detectDeliverableAnswerFiles(text)` — the substantial fenced document/
 *     code blocks already surfaced as download cards in the timeline.
 *
 * Each source file is mapped to an `Artifact` only when it carries recoverable
 * inline text or a remote URL (see `artifactFromReasoningFile`). Artifacts are
 * deduped by id (conversation + name), so the same deliverable referenced by
 * both sources collapses to one entry.
 */

/** Local user edits, keyed by artifact id, layered over the derived content. */
type ArtifactEditMap = Readonly<Record<string, string>>;

export interface ArtifactsStore {
  /** All real artifacts in the conversation, newest message last. */
  readonly artifacts: readonly Artifact[];
  /** The currently open artifact (or null when the panel is closed). */
  readonly activeArtifact: Artifact | null;
  /** Whether the side/overlay panel is open. */
  readonly isPanelOpen: boolean;
  /** Open the panel on a specific artifact id. */
  readonly openArtifact: (artifactId: string) => void;
  /** Close the panel (keeps any in-session edits). */
  readonly closePanel: () => void;
  /** Apply an in-session edit to a text artifact. */
  readonly updateArtifactContent: (artifactId: string, nextContent: string) => void;
}

function fileContentDedupeKey(file: AssistantReasoningFile): string | null {
  const content = typeof file.content === 'string' ? file.content.trim() : '';
  if (!content) {
    return null;
  }
  return `content:${file.kind || ''}:${content.length}:${content.slice(0, 512)}`;
}

function fileDedupeKeys(file: AssistantReasoningFile): readonly string[] {
  const keys = [`name:${file.name}`];
  if (typeof file.artifactId === 'string' && file.artifactId.trim()) {
    keys.push(`id:${file.artifactId.trim()}`);
  }
  const contentKey = fileContentDedupeKey(file);
  if (contentKey) {
    keys.push(contentKey);
  }
  return keys;
}

const GENERIC_DERIVED_ARTIFACT_NAME_RE = /^documento-\d+\.([a-z0-9]+)$/i;

function fileExtension(file: AssistantReasoningFile): string | null {
  const match = file.name.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() || null;
}

function isGenericDerivedArtifactDuplicate(
  file: AssistantReasoningFile,
  existingExtensions: ReadonlySet<string>,
  hasExistingProfessionalDocument: boolean,
): boolean {
  const extension = fileExtension(file);
  return Boolean(
    extension &&
      GENERIC_DERIVED_ARTIFACT_NAME_RE.test(file.name) &&
      (existingExtensions.has(extension) ||
        (hasExistingProfessionalDocument && extension === 'md')),
  );
}

function collectFilesFromMessage(
  message: DashboardMessage,
): readonly AssistantReasoningFile[] {
  if (message.role !== 'assistant') {
    return [];
  }
  const reasoning = getAssistantReasoning(message.metadata);
  const derived = detectDeliverableAnswerFiles(message.text);
  const merged: AssistantReasoningFile[] = [...reasoning.files];
  const existingKeys = new Set(reasoning.files.flatMap(fileDedupeKeys));
  const existingExtensions = new Set(
    reasoning.files
      .map((file) => fileExtension(file))
      .filter((extension): extension is string => extension !== null),
  );
  const hasExistingProfessionalDocument = hasProfessionalAnswerFile(reasoning.files);
  for (const file of derived) {
    const keys = fileDedupeKeys(file);
    if (
      hasExistingProfessionalDocument ||
      isGenericDerivedArtifactDuplicate(
        file,
        existingExtensions,
        hasExistingProfessionalDocument,
      ) ||
      keys.some((key) => existingKeys.has(key))
    ) {
      continue;
    }
    merged.push(file);
    keys.forEach((key) => existingKeys.add(key));
    const extension = fileExtension(file);
    if (extension) {
      existingExtensions.add(extension);
    }
  }
  return merged;
}

/** Derive the deduped, ordered artifact list for the given messages. */
export function deriveArtifacts(
  messages: readonly DashboardMessage[],
  conversationId: string,
): Artifact[] {
  const artifacts: Artifact[] = [];
  const seen = new Set<string>();
  let order = 0;
  for (const message of messages) {
    const files = collectFilesFromMessage(message);
    for (const file of files) {
      const artifact = artifactFromReasoningFile(file, conversationId, order, order);
      order += 1;
      if (!artifact || seen.has(artifact.id)) {
        continue;
      }
      seen.add(artifact.id);
      artifacts.push(artifact);
    }
  }
  return artifacts;
}

/** Apply a local edit map over a derived artifact, marking it edited. */
function withLocalEdit(artifact: Artifact, edits: ArtifactEditMap): Artifact {
  const edited = edits[artifact.id];
  if (edited === undefined || edited === artifact.content) {
    return artifact;
  }
  return { ...artifact, content: edited };
}

/**
 * Chat-side artifacts store. Derives artifacts from the live message list and
 * tracks which artifact is open plus any in-session text edits. The store holds
 * no fabricated state — `artifacts` is a pure function of the real messages.
 */
export function useArtifacts(
  messages: readonly DashboardMessage[],
  conversationId: string | null,
): ArtifactsStore {
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [edits, setEdits] = useState<ArtifactEditMap>({});

  const artifacts = useMemo(() => {
    const derived = deriveArtifacts(messages, conversationId || '');
    return derived.map((artifact) => withLocalEdit(artifact, edits));
  }, [messages, conversationId, edits]);

  const activeArtifact = useMemo(() => {
    if (!activeArtifactId) {
      return null;
    }
    return artifacts.find((artifact) => artifact.id === activeArtifactId) ?? null;
  }, [artifacts, activeArtifactId]);

  const openArtifact = useCallback((artifactId: string) => {
    setActiveArtifactId(artifactId);
  }, []);

  const closePanel = useCallback(() => {
    setActiveArtifactId(null);
  }, []);

  const updateArtifactContent = useCallback((artifactId: string, nextContent: string) => {
    setEdits((current) => ({ ...current, [artifactId]: nextContent }));
  }, []);

  return {
    artifacts,
    activeArtifact,
    isPanelOpen: activeArtifact !== null,
    openArtifact,
    closePanel,
    updateArtifactContent,
  };
}
