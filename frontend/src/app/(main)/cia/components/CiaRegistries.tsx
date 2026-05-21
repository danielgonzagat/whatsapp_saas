'use client';

import { kloelT } from '@/lib/i18n/t';
import { Badge, Surface } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { Bot, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type {
  CiaCapabilityRegistry,
  CiaConversationActionRegistry,
} from '@/lib/api';

interface CiaRegistriesProps {
  capabilityRegistry: CiaCapabilityRegistry | null;
  conversationActionRegistry: CiaConversationActionRegistry | null;
}

export function CiaRegistries({
  capabilityRegistry,
  conversationActionRegistry,
}: CiaRegistriesProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Surface className="p-5">
      <button
        className="flex items-center justify-between w-full text-left"
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        <div className="flex items-center gap-2">
          <Bot size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
          <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
            {kloelT('Registros de Capacidades')}
          </p>
          {capabilityRegistry && (
            <Badge variant="info">{capabilityRegistry.items.length} capacidades</Badge>
          )}
          {conversationActionRegistry && (
            <Badge variant="info">
              {conversationActionRegistry.items.length} {kloelT('acoes')}
            </Badge>
          )}
        </div>
        {expanded ? (
          <ChevronDown size={16} style={{ color: colors.text.muted }} aria-hidden="true" />
        ) : (
          <ChevronRight size={16} style={{ color: colors.text.muted }} aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {capabilityRegistry && (
            <div>
              <p
                className="text-xs uppercase tracking-widest mb-3"
                style={{ color: colors.text.muted }}
              >
                {kloelT('Capacidades de Conta \u2014 v')}
                {capabilityRegistry.version}
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {capabilityRegistry.items.map((cap, idx) => (
                  <div
                    key={cap.id || idx}
                    className="rounded p-3"
                    style={{
                      backgroundColor: colors.background.surface1,
                      border: `1px solid ${colors.stroke}`,
                    }}
                  >
                    <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                      {cap.name || cap.id}
                    </p>
                    {cap.description && (
                      <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                        {cap.description}
                      </p>
                    )}
                    {cap.category && (
                      <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                        {cap.category}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {conversationActionRegistry && (
            <div>
              <p
                className="text-xs uppercase tracking-widest mb-3"
                style={{ color: colors.text.muted }}
              >
                {kloelT('Acoes de Conversa \u2014 v')}
                {conversationActionRegistry.version}
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {conversationActionRegistry.items.map((action, idx) => (
                  <div
                    key={action.id || idx}
                    className="rounded p-3"
                    style={{
                      backgroundColor: colors.background.surface1,
                      border: `1px solid ${colors.stroke}`,
                    }}
                  >
                    <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                      {action.name || action.id}
                    </p>
                    {action.description && (
                      <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                        {action.description}
                      </p>
                    )}
                    {action.category && (
                      <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                        {action.category}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!capabilityRegistry && !conversationActionRegistry && (
            <p className="text-sm" style={{ color: colors.text.secondary }}>
              {kloelT('Registros nao disponiveis.')}
            </p>
          )}
        </div>
      )}
    </Surface>
  );
}
