'use client';

import { MediaPreviewBox } from '@/components/kloel/MediaPreviewBox';
import { usePersistentImagePreview } from '@/hooks/usePersistentImagePreview';
import { readFileAsDataUrl, uploadGenericMedia } from '@/lib/media-upload';
import { Check, Copy, X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

// ============================================
// CHIP INPUT (Tags with max, Enter to add)
// ============================================

export function ChipInput({
  value = [],
  onChange,
  max = 5,
  placeholder = 'Adicionar...',
  label,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
  placeholder?: string;
  label?: string;
}) {
  const [input, setInput] = useState('');
  const autoId = useId();
  const inputId = `${autoId}-chip`;

  const handleAdd = () => {
    const t = input.trim();
    if (t && value.length < max && !value.includes(t)) {
      onChange([...value, t]);
      setInput('');
    }
  };

  return (
    <div>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600"
        >
          {label}
        </label>
      )}
      <div className="flex gap-2">
        <input
          id={inputId}
          aria-label={label || placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          placeholder={value.length >= max ? `Máximo ${max}` : placeholder}
          disabled={value.length >= max}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-gray-50"
        />
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {value.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="ml-0.5 hover:text-teal-900"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// CURRENCY INPUT (R$ mask)
// ============================================

export function CurrencyInput({
  value,
  onChange,
  label,
  placeholder = '0,00',
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const autoId = useId();
  const inputId = `${autoId}-currency`;

  return (
    <div>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">
          R$
        </span>
        <input
          id={inputId}
          aria-label={label || 'Valor em reais'}
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>
    </div>
  );
}

// ============================================
// RADIO GROUP
// ============================================

export function RadioGroup({
  value,
  onChange,
  options,
  label,
  direction = 'vertical',
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; description?: string }[];
  label?: string;
  direction?: 'vertical' | 'horizontal';
}) {
  const autoId = useId();
  const groupName = `${autoId}-radio`;

  return (
    <fieldset>
      {label && (
        <legend className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-600">
          {label}
        </legend>
      )}
      <div className={direction === 'horizontal' ? 'flex flex-wrap gap-3' : 'space-y-2'}>
        {options.map((opt) => (
          <label key={opt.value} className="flex cursor-pointer items-start gap-2.5">
            <input
              type="radio"
              name={groupName}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="mt-0.5 accent-teal-600"
            />
            <div>
              <span className="text-sm font-medium text-gray-800">{opt.label}</span>
              {opt.description && <p className="text-xs text-gray-500">{opt.description}</p>}
            </div>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ============================================
// IMAGE UPLOAD (Drag & Drop)
// ============================================

export function ImageUpload({
  value,
  onChange,
  label,
  hint,
  folder,
  previewStorageKey,
}: {
  value?: string | null;
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
  folder?: string;
  previewStorageKey?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const { previewUrl, clearPreview, setPreviewUrl } = usePersistentImagePreview({
    storageKey: previewStorageKey,
  });

  const handleFile = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    setPreviewUrl(dataUrl);
    setUploading(true);

    try {
      const uploadedUrl = await uploadGenericMedia(file, { folder });
      if (uploadedUrl) {
        onChange(uploadedUrl);
      }
    } catch (e) {
      console.error('Upload failed:', e);
    } finally {
      setUploading(false);
    }
  };

  return (
    <MediaPreviewBox
      label={label}
      hint={hint}
      previewUrl={previewUrl}
      fallbackUrl={value}
      uploading={uploading}
      onSelectFile={(file) => {
        void handleFile(file);
      }}
      onClear={() => {
        clearPreview();
        onChange('');
      }}
      layout={{ minHeight: 120 }}
      emptyTitle="Arraste ou clique"
      emptySubtitle={undefined}
    />
  );
}

// ============================================
// CODE SNIPPET (readonly + copy)
// ============================================

export function CodeSnippet({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    },
    [],
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    if (copiedTimer.current) {
      clearTimeout(copiedTimer.current);
    }
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      {label && (
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600">
          {label}
        </span>
      )}
      <div className="relative rounded-lg border border-gray-200 bg-gray-50 p-4">
        <pre className="overflow-x-auto text-xs text-gray-700 font-mono whitespace-pre-wrap">
          {code}
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          className="absolute right-2 top-2 rounded-md bg-white border border-gray-200 p-1.5 text-gray-500 hover:text-gray-700"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

// ============================================
// DATA TABLE (simple)
// ============================================

export function DataTable<TRow extends { id?: string | number } = Record<string, unknown>>({
  columns,
  rows,
  emptyText = 'Nenhum registro',
}: {
  columns: {
    key: string;
    label: string;
    width?: string;
    render?: (val: unknown, row: TRow) => ReactNode;
  }[];
  rows: TRow[];
  emptyText?: string;
}) {
  if (!rows.length) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 py-12">
        <p className="text-sm text-gray-500">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600"
                style={{ width: col.width }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={row.id ?? i} className="hover:bg-gray-50">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-gray-800">
                  {col.render
                    ? col.render((row as Record<string, unknown>)[col.key], row)
                    : String((row as Record<string, unknown>)[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
