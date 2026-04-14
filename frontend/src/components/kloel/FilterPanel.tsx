'use client';

import { ChevronDown, Search } from 'lucide-react';
import { useState } from 'react';

interface FilterConfig {
  key: string;
  label: string;
  type: 'select' | 'search';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface FilterPanelProps {
  filters: FilterConfig[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export function FilterPanel({ filters, values, onChange }: FilterPanelProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        marginBottom: 20,
      }}
    >
      {filters.map((filter) => {
        if (filter.type === 'search') {
          return (
            <div
              key={filter.key}
              style={{
                flex: 1,
                minWidth: 200,
                background: 'var(--app-bg-card)',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Search size={14} style={{ color: 'var(--app-text-tertiary)', flexShrink: 0 }} />
              <input
                placeholder={filter.placeholder || `Buscar...`}
                value={values[filter.key] || ''}
                onChange={(e) => onChange(filter.key, e.target.value)}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--app-text-primary)',
                  fontSize: 13,
                  fontFamily: "'Sora', sans-serif",
                }}
              />
            </div>
          );
        }

        return (
          <div key={filter.key} style={{ position: 'relative' }}>
            <select
              value={values[filter.key] || ''}
              onChange={(e) => onChange(filter.key, e.target.value)}
              style={{
                appearance: 'none',
                background: 'var(--app-bg-card)',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                color: 'var(--app-text-secondary)',
                fontSize: 12,
                padding: '8px 32px 8px 14px',
                fontFamily: "'Sora', sans-serif",
                outline: 'none',
                cursor: 'pointer',
                minWidth: 120,
              }}
            >
              <option value="">{filter.label}</option>
              {filter.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--app-text-tertiary)',
                pointerEvents: 'none',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
