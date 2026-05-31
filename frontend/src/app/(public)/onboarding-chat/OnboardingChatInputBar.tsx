'use client';

import { Send } from 'lucide-react';
import type { RefObject } from 'react';

import { KloelMushroomVisual } from '@/components/kloel/KloelBrand';
import { colors, motion as dtMotion, typography } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';

interface OnboardingChatInputBarProps {
  input: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

/**
 * Composer affordance for the conversational onboarding chat: text input,
 * send button, hint copy. Re-exports the same behavior the legacy inline
 * markup had — focus ring, disabled states, mushroom-spinner while loading.
 */
export function OnboardingChatInputBar({
  input,
  loading,
  onChange,
  onSubmit,
  onKeyDown,
  inputRef,
}: OnboardingChatInputBarProps) {
  const canSend = !loading && input.trim().length > 0;
  return (
    <div
      style={{
        borderTop: `1px solid ${colors.border.void}`,
        padding: '16px',
      }}
    >
      <div style={{ maxWidth: '1024px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={kloelT(`Digite sua mensagem...`)}
            disabled={loading}
            style={{
              flex: 1,
              fontFamily: typography.fontFamily.sans,
              fontSize: typography.fontSize.body[0],
              background: colors.background.surface,
              border: `1px solid ${colors.border.space}`,
              borderRadius: 12,
              padding: '12px 16px',
              color: colors.text.silver,
              outline: 'none',
              transition: `box-shadow ${dtMotion.duration.fast} ${dtMotion.easing.default}`,
              opacity: loading ? 0.5 : 1,
            }}
            onFocus={(e) => {
              e.target.style.boxShadow = `0 0 0 2px ${colors.ember.primary}`;
            }}
            onBlur={(e) => {
              e.target.style.boxShadow = 'none';
            }}
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSend}
            style={{
              fontFamily: typography.fontFamily.sans,
              fontSize: typography.fontSize.body[0],
              fontWeight: typography.fontWeight.medium,
              background: colors.ember.primary,
              color: colors.text.silver,
              border: 'none',
              borderRadius: 12,
              padding: '12px 24px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: `opacity ${dtMotion.duration.fast} ${dtMotion.easing.default}`,
              opacity: canSend ? 1 : 0.5,
            }}
            onMouseEnter={(e) => {
              if (canSend) {
                (e.target as HTMLButtonElement).style.opacity = '0.9';
              }
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.opacity = canSend ? '1' : '0.5';
            }}
          >
            {loading ? (
              <KloelMushroomVisual
                size={22}
                title="Enviando"
                traceColor={colors.text.silver}
                fit="icon"
              />
            ) : (
              <Send style={{ width: 20, height: 20 }} aria-hidden="true" />
            )}
          </button>
        </div>
        <p
          style={{
            fontFamily: typography.fontFamily.sans,
            fontSize: typography.fontSize.bodySmall[0],
            color: colors.text.muted,
            marginTop: 8,
            marginBottom: 0,
            textAlign: 'center',
          }}
        >
          {kloelT(
            `Converse naturalmente com a Kloel. Ela vai configurar sua conta automaticamente.`,
          )}
        </p>
      </div>
    </div>
  );
}
