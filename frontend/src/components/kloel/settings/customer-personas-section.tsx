'use client';

import { kloelT } from '@/lib/i18n/t';
import { AccordionSection } from './accordion-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface CustomerPersonasSectionProps {
  value?: string[];
  saving?: boolean;
  disabled?: boolean;
  onSave?: (payload: string[]) => void | Promise<void>;
}

export function CustomerPersonasSection({
  value,
  saving = false,
  disabled = false,
  onSave,
}: CustomerPersonasSectionProps) {
  const [personas, setPersonas] = useState<string[]>([]);
  const [newPersona, setNewPersona] = useState('');

  useEffect(() => {
    if (!value) {
      return;
    }
    queueMicrotask(() => setPersonas(value));
  }, [value]);

  const handleAddPersona = () => {
    if (newPersona && !personas.includes(newPersona)) {
      setPersonas([...personas, newPersona]);
      setNewPersona('');
    }
  };

  return (
    <AccordionSection icon={Users} title={kloelT(`Clientes e publico-alvo`)}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm text-gray-700">{kloelT(`Personas de cliente`)}</Label>
          <div className="flex flex-wrap gap-2">
            {personas.map((persona, i) => (
              <span
                key={persona}
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
              >
                {persona}
                <button
                  type="button"
                  onClick={() => setPersonas(personas.filter((_, idx) => idx !== i))}
                >
                  <X className="h-3 w-3 text-gray-500 hover:text-gray-700" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder={kloelT(`Nova persona...`)}
              value={newPersona}
              onChange={(e) => setNewPersona(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddPersona()}
              className="rounded-xl border-gray-200"
            />
            <Button
              onClick={handleAddPersona}
              variant="outline"
              className="rounded-xl bg-transparent"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <Button
          onClick={() => onSave?.(personas)}
          disabled={disabled || saving}
          className="w-full rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]"
        >
          {kloelT(`Salvar personas`)}
        </Button>
      </div>
    </AccordionSection>
  );
}
