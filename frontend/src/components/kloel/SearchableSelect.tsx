'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  group?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Selecione...',
  searchPlaceholder = 'Buscar...',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const selectedLabel = options.find((o) => o.value === value)?.label;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '10px 14px',
          background: '#111113',
          border: `1px solid ${open ? '#E85D30' : '#222226'}`,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          transition: 'border-color 150ms ease',
          color: selectedLabel ? '#E0DDD8' : '#3A3A3F',
          fontSize: 13,
          fontFamily: "'Sora', sans-serif",
        }}
      >
        <span>{selectedLabel || placeholder}</span>
        <ChevronDown
          size={14}
          style={{
            color: '#3A3A3F',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 150ms ease',
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: '#111113',
            border: '1px solid #222226',
            borderRadius: 6,
            boxShadow: 'none',
            zIndex: 50,
            maxHeight: 240,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid #19191C',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Search size={13} style={{ color: '#3A3A3F', flexShrink: 0 }} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: '#E0DDD8',
                fontSize: 12,
                fontFamily: "'Sora', sans-serif",
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 192 }}>
            {filtered.length === 0 && (
              <div
                style={{
                  padding: '12px 14px',
                  fontSize: 12,
                  color: '#3A3A3F',
                  textAlign: 'center',
                }}
              >
                Nenhum resultado
              </div>
            )}
            {filtered.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                  setSearch('');
                }}
                style={{
                  width: '100%',
                  padding: '8px 14px',
                  background: opt.value === value ? 'rgba(232, 93, 48, 0.06)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: opt.value === value ? '#E0DDD8' : '#6E6E73',
                  fontSize: 12,
                  fontFamily: "'Sora', sans-serif",
                  transition: 'background 100ms ease',
                }}
                onMouseEnter={(e) => {
                  if (opt.value !== value) e.currentTarget.style.background = '#19191C';
                }}
                onMouseLeave={(e) => {
                  if (opt.value !== value) e.currentTarget.style.background = 'transparent';
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
