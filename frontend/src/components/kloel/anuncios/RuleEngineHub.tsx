'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';
import { secureRandomFloat } from '@/lib/secure-random';
import { useRef, useState, useEffect, useId } from 'react';
import useSWR from 'swr';
import { mutate } from 'swr';
import { NP, EMBER, G, SORA, MONO } from './AnunciosShared';
import type { AdRule } from './anuncios-types';

const FID = 'rule-engine-hub';

export function RuleEngineHub() {
  const fid = useId();
  const { data: rulesData, mutate: mutateRules } = useSWR<Record<string, unknown>[]>(
    '/ad-rules',
    swrFetcher,
    { keepPreviousData: true },
  );
  const rules: AdRule[] = (rulesData || []).map((r: Record<string, unknown>) => ({
    id: typeof r.id === 'string' ? r.id : `rule-${secureRandomFloat().toString(36).slice(2, 10)}`,
    condition: typeof r.condition === 'string' ? r.condition : 'condição não informada',
    action: typeof r.action === 'string' ? r.action : 'ação não informada',
    active: typeof r.active === 'boolean' ? r.active : true,
    fires: typeof r.fireCount === 'number' ? r.fireCount : 0,
  }));
  const [showForm, setShowForm] = useState(false);
  const [newCondition, setNewCondition] = useState('');
  const [newAction, setNewAction] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCondition, setEditCondition] = useState('');
  const [editAction, setEditAction] = useState('');
  const formRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    },
    [],
  );

  const activeCount = rules.filter((r) => r.active).length;
  const totalFires = rules.reduce((s, r) => s + r.fires, 0);

  const invalidateAdRules = () =>
    mutate((key: string) => typeof key === 'string' && key.startsWith('/ad-rules'));

  const toggleRule = async (id: string) => {
    await apiFetch(`/ad-rules/${id}/toggle`, { method: 'POST' });
    mutateRules();
    invalidateAdRules();
  };

  const deleteRule = async (id: string) => {
    await apiFetch(`/ad-rules/${id}`, { method: 'DELETE' });
    mutateRules();
    invalidateAdRules();
  };

  const startEdit = (r: AdRule) => {
    setEditingId(r.id);
    setEditCondition(r.condition);
    setEditAction(r.action);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditCondition('');
    setEditAction('');
  };

  const saveEdit = async (id: string) => {
    if (!editCondition.trim() || !editAction.trim()) return;
    await apiFetch(`/ad-rules/${id}`, {
      method: 'PUT',
      body: { condition: editCondition.trim(), action: editAction.trim() },
    });
    cancelEdit();
    mutateRules();
    invalidateAdRules();
  };

  const handleCreateRule = async () => {
    if (!newCondition.trim() || !newAction.trim()) return;
    await apiFetch('/ad-rules', {
      method: 'POST',
      body: {
        name: `Regra ${Date.now()}`,
        condition: newCondition.trim(),
        action: newAction.trim(),
      },
    });
    setNewCondition('');
    setNewAction('');
    setShowForm(false);
    mutateRules();
    invalidateAdRules();
  };

  const openForm = () => {
    setShowForm(true);
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(
      () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      100,
    );
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--app-bg-secondary)',
    border: '1px solid colors.text.dim',
    borderRadius: 6,
    color: 'var(--app-text-primary)',
    fontSize: 13,
    fontFamily: MONO,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 20,
        animation: 'fadeIn .3s ease',
      }}
    >
      <div style={{ textAlign: 'center' as const, padding: '16px 0 8px' }}>
        <div
          style={{
            fontSize: 11,
            fontFamily: MONO,
            color: 'var(--app-text-secondary)',
            letterSpacing: 2,
            marginBottom: 8,
          }}
        >
          {kloelT(`REGRAS ATIVAS`)}
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            fontFamily: MONO,
            color: rules.length > 0 ? EMBER : colors.text.dim,
            textShadow: rules.length > 0 ? `0 0 30px ${EMBER}44` : 'none',
            lineHeight: 1,
          }}
        >
          {activeCount}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          {
            label: 'EXECUCOES HOJE',
            value: String(totalFires),
            color: totalFires > 0 ? EMBER : colors.text.dim,
          },
          {
            label: 'TOTAL REGRAS',
            value: String(rules.length),
            color: rules.length > 0 ? G : colors.text.dim,
          },
          {
            label: 'INATIVAS',
            value: String(rules.length - activeCount),
            color: 'var(--app-text-primary)',
          },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 14,
              textAlign: 'center' as const,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: MONO,
                color: 'var(--app-text-secondary)',
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              {s.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: MONO, color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontFamily: MONO,
            color: 'var(--app-text-secondary)',
            letterSpacing: 1,
            marginBottom: 12,
          }}
        >
          {kloelT(`REGRAS — FIBRAS NEURAIS`)}
        </div>
        {rules.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
            {rules.map((r) => (
              <div
                key={r.id}
                style={{
                  background: 'var(--app-bg-secondary)',
                  borderRadius: 6,
                  borderLeft: `3px solid ${r.active ? EMBER : colors.text.dim}`,
                  opacity: r.active ? 1 : 0.5,
                  transition: 'opacity 150ms ease',
                  overflow: 'hidden' as const,
                }}
              >
                {editingId === r.id ? (
                  <div style={{ padding: '12px 12px', display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                    <div>
                      <label
                        style={{
                          fontSize: 9,
                          fontFamily: MONO,
                          color: 'var(--app-text-secondary)',
                          letterSpacing: 1,
                          display: 'block',
                          marginBottom: 4,
                        }}
                        htmlFor={`${fid}-cond-1`}
                      >
                        {kloelT(`CONDICAO (IF)`)}
                      </label>
                      <input
                        aria-label="Condicao da regra (IF)"
                        type="text"
                        value={editCondition}
                        onChange={(e) => setEditCondition(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          background: 'var(--app-bg-card)',
                          border: '1px solid colors.text.dim',
                          borderRadius: 6,
                          color: 'var(--app-text-primary)',
                          fontSize: 12,
                          fontFamily: MONO,
                          outline: 'none',
                          boxSizing: 'border-box' as const,
                        }}
                        id={`${fid}-cond-1`}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          fontSize: 9,
                          fontFamily: MONO,
                          color: 'var(--app-text-secondary)',
                          letterSpacing: 1,
                          display: 'block',
                          marginBottom: 4,
                        }}
                        htmlFor={`${fid}-acao-1`}
                      >
                        {kloelT(`ACAO (THEN)`)}
                      </label>
                      <input
                        aria-label="Acao da regra (THEN)"
                        type="text"
                        value={editAction}
                        onChange={(e) => setEditAction(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(r.id);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          background: 'var(--app-bg-card)',
                          border: '1px solid colors.text.dim',
                          borderRadius: 6,
                          color: 'var(--app-text-primary)',
                          fontSize: 12,
                          fontFamily: MONO,
                          outline: 'none',
                          boxSizing: 'border-box' as const,
                        }}
                        id={`${fid}-acao-1`}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        style={{
                          background: 'none',
                          border: '1px solid colors.text.dim',
                          borderRadius: 6,
                          padding: '6px 12px',
                          color: 'var(--app-text-secondary)',
                          fontSize: 11,
                          fontFamily: SORA,
                          cursor: 'pointer',
                        }}
                      >
                        {kloelT(`Cancelar`)}
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(r.id)}
                        disabled={!editCondition.trim() || !editAction.trim()}
                        style={{
                          background: EMBER,
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 14px',
                          color: '#fff',
                          fontSize: 11,
                          fontFamily: SORA,
                          fontWeight: 600,
                          cursor: 'pointer',
                          opacity: editCondition.trim() && editAction.trim() ? 1 : 0.5,
                        }}
                      >
                        {kloelT(`Salvar`)}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontFamily: MONO,
                          color: 'var(--app-text-primary)',
                          marginBottom: 2,
                        }}
                      >
                        IF {r.condition}
                      </div>
                      <div style={{ fontSize: 11, fontFamily: MONO, color: EMBER }}>
                        {kloelT(`&rarr;`)} {r.action}
                      </div>
                    </div>
                    <NP color={r.active ? EMBER : colors.text.dim} intensity={r.active ? 1.2 : 0.3} width={80} height={20} />
                    <span
                      style={{
                        fontSize: 16,
                        fontFamily: MONO,
                        fontWeight: 700,
                        color: 'var(--app-text-primary)',
                        minWidth: 36,
                        textAlign: 'right' as const,
                      }}
                    >
                      {r.fires}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--app-text-secondary)',
                        cursor: 'pointer',
                        padding: 4,
                        display: 'flex',
                      }}
                      title={kloelT(`Editar regra`)}
                    >
                      <svg
                        width={12}
                        height={12}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d={kloelT(`M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1`)} />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleRule(r.id)}
                      style={{
                        width: 36,
                        height: 20,
                        borderRadius: 10,
                        border: 'none',
                        background: r.active ? EMBER : colors.text.dim,
                        cursor: 'pointer',
                        position: 'relative' as const,
                        transition: 'background 150ms ease',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute' as const,
                          top: 3,
                          left: r.active ? 19 : 3,
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: '#fff',
                          transition: 'left 150ms ease',
                        } as React.CSSProperties}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRule(r.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--app-text-secondary)',
                        cursor: 'pointer',
                        padding: 4,
                        fontSize: 14,
                        fontFamily: MONO,
                        transition: 'color 150ms ease',
                      }}
                      title={kloelT(`Remover regra`)}
                    >
                      {kloelT(`&times;`)}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              fontSize: 12,
              fontFamily: SORA,
              color: 'var(--app-text-tertiary)',
              textAlign: 'center' as const,
              padding: '24px 0',
            }}
          >
            {kloelT(`Nenhuma regra criada. Crie sua primeira regra de automacao abaixo.`)}
          </div>
        )}
      </div>

      {showForm && (
        <div
          ref={formRef}
          style={{
            background: 'var(--app-bg-card)',
            border: `1px solid ${EMBER}44`,
            borderRadius: 6,
            padding: 20,
            animation: 'fadeIn .3s ease',
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontFamily: SORA,
              color: 'var(--app-text-primary)',
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            {kloelT(`Nova Regra de Automacao`)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            <div>
              <label
                style={{
                  fontSize: 10,
                  fontFamily: MONO,
                  color: 'var(--app-text-secondary)',
                  letterSpacing: 1,
                  display: 'block',
                  marginBottom: 6,
                }}
                htmlFor={`${fid}-cond-2`}
              >
                {kloelT(`CONDICAO (IF)`)}
              </label>
              <input
                aria-label="Condicao da nova regra (IF)"
                type="text"
                value={newCondition}
                onChange={(e) => setNewCondition(e.target.value)}
                placeholder={kloelT(`Ex: ROAS < 1.0 por 48h`)}
                style={inputStyle}
                id={`${fid}-cond-2`}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: 10,
                  fontFamily: MONO,
                  color: 'var(--app-text-secondary)',
                  letterSpacing: 1,
                  display: 'block',
                  marginBottom: 6,
                }}
                htmlFor={`${fid}-acao-2`}
              >
                {kloelT(`ACAO (THEN)`)}
              </label>
              <input
                aria-label="Acao da nova regra (THEN)"
                type="text"
                value={newAction}
                onChange={(e) => setNewAction(e.target.value)}
                placeholder={kloelT(`Ex: Pausar campanha`)}
                style={inputStyle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateRule();
                }}
                id={`${fid}-acao-2`}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setNewCondition('');
                  setNewAction('');
                }}
                style={{
                  background: 'none',
                  border: '1px solid colors.text.dim',
                  borderRadius: 6,
                  padding: '8px 16px',
                  color: 'var(--app-text-secondary)',
                  fontSize: 12,
                  fontFamily: SORA,
                  cursor: 'pointer',
                }}
              >
                {kloelT(`Cancelar`)}
              </button>
              <button
                type="button"
                onClick={handleCreateRule}
                disabled={!newCondition.trim() || !newAction.trim()}
                style={{
                  background: EMBER,
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 20px',
                  color: '#fff',
                  fontSize: 12,
                  fontFamily: SORA,
                  fontWeight: 600,
                  cursor: newCondition.trim() && newAction.trim() ? 'pointer' : 'not-allowed',
                  opacity: newCondition.trim() && newAction.trim() ? 1 : 0.5,
                  transition: 'opacity 150ms ease',
                }}
              >
                {kloelT(`Criar Regra`)}
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={openForm}
        style={{
          background: 'transparent',
          border: `1px dashed ${showForm ? colors.text.dim : `${EMBER}66`}`,
          borderRadius: 6,
          padding: 16,
          color: showForm ? colors.text.dim : EMBER,
          fontSize: 13,
          fontFamily: SORA,
          cursor: showForm ? 'default' : 'pointer',
          transition: 'border-color 150ms ease, color 150ms ease',
          textAlign: 'center' as const,
          fontWeight: 600,
        }}
      >
        {kloelT(`+ Criar nova regra`)}
      </button>
    </div>
  );
}
