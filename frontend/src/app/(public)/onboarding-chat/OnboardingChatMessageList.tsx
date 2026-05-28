'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Bot, CheckCircle2, User } from 'lucide-react';
import type { RefObject } from 'react';

import { KloelMushroomVisual } from '@/components/kloel/KloelBrand';
import { colors, motion as dtMotion, typography } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';

import {
  formatMessageTimestamp,
  type OnboardingMessage,
} from './onboarding-chat.helpers';

interface OnboardingChatMessageListProps {
  messages: OnboardingMessage[];
  loading: boolean;
  completed: boolean;
  onGoToDashboard: () => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
}

/**
 * Renders the scrollable conversation surface: animated message bubbles,
 * the "kloel está pensando..." loading affordance and the completion CTA.
 *
 * Stateless — every variable is supplied by `useOnboardingChat` via props.
 */
export function OnboardingChatMessageList({
  messages,
  loading,
  completed,
  onGoToDashboard,
  messagesEndRef,
}: OnboardingChatMessageListProps) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
      <div
        style={{
          maxWidth: '1024px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <AnimatePresence mode="popLayout">
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                display: 'flex',
                gap: 12,
                flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background:
                    message.role === 'assistant'
                      ? colors.ember.primary
                      : colors.background.elevated,
                }}
              >
                {message.role === 'assistant' ? (
                  <Bot
                    style={{ width: 20, height: 20, color: colors.text.inverted }}
                    aria-hidden="true"
                  />
                ) : (
                  <User
                    style={{ width: 20, height: 20, color: colors.text.silver }}
                    aria-hidden="true"
                  />
                )}
              </div>

              <div
                style={{
                  maxWidth: '80%',
                  borderRadius: 12,
                  padding: '12px 16px',
                  background:
                    message.role === 'assistant'
                      ? colors.background.surface
                      : colors.ember.primary,
                  border:
                    message.role === 'assistant' ? `1px solid ${colors.border.space}` : 'none',
                }}
              >
                <p
                  style={{
                    fontFamily: typography.fontFamily.sans,
                    fontSize: typography.fontSize.body[0],
                    color: colors.text.silver,
                    lineHeight: typography.fontSize.body[1].lineHeight,
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                  }}
                >
                  {message.content}
                </p>
                <p
                  style={{
                    fontFamily: typography.fontFamily.mono,
                    fontSize: typography.fontSize.caption[0],
                    opacity: 0.5,
                    marginTop: 4,
                    marginBottom: 0,
                    color: colors.text.silver,
                  }}
                >
                  {formatMessageTimestamp(message.timestamp)}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: 'flex' }}
          >
            <div
              style={{
                background: colors.background.surface,
                borderRadius: 12,
                padding: '16px',
                border: `1px solid ${colors.border.space}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <KloelMushroomVisual
                  size={28}
                  traceColor={colors.text.silver}
                  animated
                  spores="animated"
                />
                <span
                  style={{
                    fontFamily: typography.fontFamily.sans,
                    fontSize: typography.fontSize.body[0],
                    color: colors.text.silver,
                  }}
                >
                  {kloelT(`kloel está pensando...`)}
                </span>
              </div>
              <p
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.bodySmall[0],
                  color: colors.text.muted,
                  marginTop: 8,
                  marginBottom: 0,
                }}
              >
                {kloelT(`A IA esta configurando sua conta automaticamente`)}
              </p>
            </div>
          </motion.div>
        )}

        {completed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              background: colors.ember.bg,
              border: `1px solid ${colors.ember.glow10}`,
              borderRadius: 12,
              padding: 24,
              textAlign: 'center',
            }}
          >
            <CheckCircle2
              style={{
                width: 48,
                height: 48,
                color: colors.ember.primary,
                margin: '0 auto 16px',
              }}
              aria-hidden="true"
            />
            <h2
              style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: typography.fontSize.h3[0],
                fontWeight: typography.fontSize.h3[1].fontWeight,
                color: colors.text.silver,
                marginBottom: 8,
                marginTop: 0,
              }}
            >
              {kloelT(`Configuracao Concluida!`)}
            </h2>
            <p
              style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: typography.fontSize.body[0],
                color: colors.text.muted,
                lineHeight: typography.fontSize.body[1].lineHeight,
                marginBottom: 24,
                marginTop: 0,
              }}
            >
              {kloelT(
                `Sua conta está pronta. Agora você pode conectar seu WhatsApp e começar a vender!`,
              )}
            </p>
            <button
              type="button"
              onClick={onGoToDashboard}
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
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                transition: `opacity ${dtMotion.duration.fast} ${dtMotion.easing.default}`,
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.opacity = '0.9';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.opacity = '1';
              }}
            >
              {kloelT(`Ir para o Dashboard`)}
              <ArrowRight style={{ width: 20, height: 20 }} aria-hidden="true" />
            </button>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
