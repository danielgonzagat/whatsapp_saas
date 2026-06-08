'use client';

import { Code2, FileText, PanelRight } from 'lucide-react';

import { kloelT } from '@/lib/i18n/t';
import {
  CHAT_INLINE_PADDING,
  CHAT_MAX_WIDTH,
  DIVIDER,
  E,
  F,
  MUTED,
  SURFACE,
  TEXT,
} from '../KloelDashboard.subcomponents';
import type { Artifact } from './artifact-types';

/**
 * A compact strip that surfaces the conversation's real artifacts as chips.
 * Clicking a chip opens that artifact in the `ArtifactsPanel`. The strip
 * renders nothing when the conversation produced no artifacts (honest empty
 * state — it is a pure projection of the derived artifact list).
 */
export function ArtifactsBar({
  artifacts,
  onOpenArtifact,
}: {
  readonly artifacts: readonly Artifact[];
  readonly onOpenArtifact: (artifactId: string) => void;
}) {
  if (artifacts.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: CHAT_MAX_WIDTH,
        margin: '0 auto',
        padding: `8px ${CHAT_INLINE_PADDING} 0`,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: MUTED,
            fontFamily: F,
          }}
        >
          <PanelRight size={13} strokeWidth={1.9} aria-hidden="true" />
          {kloelT(`Artefatos`)}
        </span>
        {artifacts.map((artifact) => {
          const Icon =
            artifact.kind === 'code' || artifact.kind === 'react' ? Code2 : FileText;
          return (
            <button
              key={artifact.id}
              type="button"
              onClick={() => onOpenArtifact(artifact.id)}
              title={artifact.title}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                maxWidth: 220,
                border: `1px solid ${DIVIDER}`,
                background: SURFACE,
                borderRadius: 8,
                padding: '6px 10px',
                cursor: 'pointer',
                fontFamily: F,
              }}
            >
              <Icon size={13} strokeWidth={1.9} aria-hidden="true" color={E} />
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: TEXT,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {artifact.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
