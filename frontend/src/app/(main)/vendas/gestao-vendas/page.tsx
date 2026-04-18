'use client';

export const dynamic = 'force-dynamic';

import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { useCRMMutations, useContacts } from '@/hooks/useCRM';
import { colors, typography } from '@/lib/design-tokens';
import { useState } from 'react';

export default function GestaoVendasPage() {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [page, setPage] = useState('1');

  const { contacts, total, hasMore, isLoading, mutate } = useContacts({
    page,
    limit: '20',
    search: search || undefined,
    tag: tagFilter || undefined,
  });

  const { addTag, removeTag } = useCRMMutations();
  const [tagInput, setTagInput] = useState('');
  const [activeContact, setActiveContact] = useState<string | null>(null);

  const handleAddTag = async (phone: string) => {
    if (!tagInput.trim()) return;
    try {
      await addTag(phone, tagInput.trim());
      setTagInput('');
      setActiveContact(null);
      mutate();
    } catch (e) {
      console.error('Failed to add tag', e);
    }
  };

  const handleRemoveTag = async (phone: string, tag: string) => {
    try {
      await removeTag(phone, tag);
      mutate();
    } catch (e) {
      console.error('Failed to remove tag', e);
    }
  };

  return (
    <div
      style={{
        padding: 32,
        position: 'relative',
        minHeight: '100vh',
        background: colors.background.void,
      }}
    >
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1000 }}>
        <PageTitle title="Gestao de Vendas" sub={`${total} contatos no CRM`} />

        {/* Search and Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              aria-label="Buscar por nome, telefone ou email"
              type="text"
              placeholder="Buscar por nome, telefone ou email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage('1');
              }}
              style={{
                width: '100%',
                padding: '12px 16px 12px 40px',
                background: colors.background.nebula,
                border: `1px solid ${colors.border.space}`,
                borderRadius: 6,
                color: colors.text.starlight,
                fontFamily: typography.fontFamily.sans,
                fontSize: 14,
                outline: 'none',
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 16,
                opacity: 0.4,
              }}
            >
              &#128269;
            </span>
          </div>
          <input
            aria-label="Filtrar por tag"
            type="text"
            placeholder="Filtrar por tag..."
            value={tagFilter}
            onChange={(e) => {
              setTagFilter(e.target.value);
              setPage('1');
            }}
            style={{
              width: 200,
              padding: '12px 16px',
              background: colors.background.nebula,
              border: `1px solid ${colors.border.space}`,
              borderRadius: 6,
              color: colors.text.starlight,
              fontFamily: typography.fontFamily.sans,
              fontSize: 14,
              outline: 'none',
            }}
          />
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <div
              style={{
                width: 20,
                height: 20,
                border: '2px solid transparent',
                borderTopColor: '#E85D30',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
          </div>
        ) : (contacts || []).length === 0 ? (
          <Card>
            <div
              style={{
                textAlign: 'center',
                padding: 32,
                color: colors.text.dust,
                fontFamily: typography.fontFamily.sans,
                fontSize: 14,
              }}
            >
              {search || tagFilter
                ? 'Nenhum contato encontrado para essa busca.'
                : 'Nenhum contato no CRM. Conecte o WhatsApp para comecar a captar leads automaticamente.'}
            </div>
          </Card>
        ) : (
          <>
            {/* Contacts Table */}
            <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border.void}` }}>
                    {['Nome', 'Telefone', 'Email', 'Tags', 'Acoes'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '12px 16px',
                          fontFamily: typography.fontFamily.display,
                          fontSize: 11,
                          fontWeight: 600,
                          color: colors.text.dust,
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.08em',
                          textAlign: 'left',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(contacts || []).map((raw: unknown, i: number) => {
                    const c = (raw ?? {}) as {
                      phone?: string;
                      id?: string;
                      _id?: string;
                      name?: string;
                      email?: string;
                      tags?: string[];
                    };
                    const phone = c.phone || c.id || c._id || '';
                    return (
                      <tr
                        key={phone || i}
                        style={{ borderBottom: `1px solid ${colors.border.void}` }}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                background: colors.background.nebula,
                                border: `1px solid ${colors.border.space}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontFamily: typography.fontFamily.display,
                                fontSize: 13,
                                fontWeight: 600,
                                color: colors.accent.webb,
                                flexShrink: 0,
                              }}
                            >
                              {(c.name || c.phone || '?')[0].toUpperCase()}
                            </div>
                            <span
                              style={{
                                fontFamily: typography.fontFamily.sans,
                                fontSize: 13,
                                color: colors.text.starlight,
                              }}
                            >
                              {c.name || 'Sem nome'}
                            </span>
                          </div>
                        </td>
                        <td
                          style={{
                            padding: '12px 16px',
                            fontFamily: typography.fontFamily.mono || typography.fontFamily.sans,
                            fontSize: 13,
                            color: colors.text.moonlight,
                          }}
                        >
                          {c.phone || '--'}
                        </td>
                        <td
                          style={{
                            padding: '12px 16px',
                            fontFamily: typography.fontFamily.sans,
                            fontSize: 13,
                            color: colors.text.moonlight,
                          }}
                        >
                          {c.email || '--'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 4,
                              alignItems: 'center',
                            }}
                          >
                            {(c.tags || []).map((tag: string) => (
                              <span
                                key={tag}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  fontFamily: typography.fontFamily.display,
                                  color: colors.accent.gold,
                                  background: 'rgba(224, 221, 216, 0.1)',
                                }}
                              >
                                {tag}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTag(phone, tag)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: colors.accent.gold,
                                    cursor: 'pointer',
                                    fontSize: 10,
                                    padding: 0,
                                    lineHeight: 1,
                                    opacity: 0.7,
                                  }}
                                >
                                  &times;
                                </button>
                              </span>
                            ))}
                            {activeContact === phone ? (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input
                                  aria-label="Nova tag"
                                  type="text"
                                  value={tagInput}
                                  onChange={(e) => setTagInput(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag(phone)}
                                  placeholder="tag"
                                  style={{
                                    width: 80,
                                    padding: '2px 6px',
                                    fontSize: 11,
                                    background: colors.background.nebula,
                                    border: `1px solid ${colors.border.space}`,
                                    borderRadius: 4,
                                    color: colors.text.starlight,
                                    fontFamily: typography.fontFamily.sans,
                                    outline: 'none',
                                  }}
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAddTag(phone)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: colors.accent.webb,
                                    cursor: 'pointer',
                                    fontSize: 14,
                                    padding: 0,
                                  }}
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveContact(phone);
                                  setTagInput('');
                                }}
                                style={{
                                  background: 'none',
                                  border: `1px dashed ${colors.border.space}`,
                                  borderRadius: 4,
                                  color: colors.text.dust,
                                  cursor: 'pointer',
                                  fontSize: 10,
                                  padding: '2px 6px',
                                  fontFamily: typography.fontFamily.sans,
                                }}
                              >
                                + tag
                              </button>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            type="button"
                            onClick={() => window.open(`https://wa.me/${phone}`, '_blank')}
                            style={{
                              padding: '4px 10px',
                              background: 'rgba(232, 93, 48, 0.08)',
                              border: `1px solid ${colors.border.space}`,
                              borderRadius: 6,
                              color: colors.accent.webb,
                              fontFamily: typography.fontFamily.display,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Abrir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button
                type="button"
                disabled={page === '1'}
                onClick={() => setPage(String(Math.max(1, Number(page) - 1)))}
                style={{
                  padding: '8px 16px',
                  background: colors.background.nebula,
                  border: `1px solid ${colors.border.space}`,
                  borderRadius: 6,
                  color: page === '1' ? colors.text.dust : colors.text.starlight,
                  fontFamily: typography.fontFamily.sans,
                  fontSize: 13,
                  cursor: page === '1' ? 'not-allowed' : 'pointer',
                }}
              >
                Anterior
              </button>
              <span
                style={{
                  padding: '8px 16px',
                  fontFamily: typography.fontFamily.display,
                  fontSize: 13,
                  color: colors.text.moonlight,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                Pagina {page}
              </span>
              <button
                type="button"
                disabled={!hasMore}
                onClick={() => setPage(String(Number(page) + 1))}
                style={{
                  padding: '8px 16px',
                  background: colors.background.nebula,
                  border: `1px solid ${colors.border.space}`,
                  borderRadius: 6,
                  color: !hasMore ? colors.text.dust : colors.text.starlight,
                  fontFamily: typography.fontFamily.sans,
                  fontSize: 13,
                  cursor: !hasMore ? 'not-allowed' : 'pointer',
                }}
              >
                Proxima
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
