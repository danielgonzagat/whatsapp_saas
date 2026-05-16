'use client';

import { kloelT } from '@/lib/i18n/t';
import { AccordionSection } from './accordion-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

function buildDuplicateAwareKey(prefix: string, values: string[], position: number) {
  const currentValue = values[position] ?? '';
  const occurrence = values.slice(0, position).filter((value) => value === currentValue).length;
  return `${prefix}-${currentValue.slice(0, 24)}-${occurrence}`;
}

interface AttendanceRulesSectionProps {
  value?: string[];
  saving?: boolean;
  disabled?: boolean;
  onSave?: (payload: string[]) => void | Promise<void>;
}

export function AttendanceRulesSection({
  value,
  saving = false,
  disabled = false,
  onSave,
}: AttendanceRulesSectionProps) {
  const [rules, setRules] = useState<string[]>([]);
  const [newRule, setNewRule] = useState('');

  useEffect(() => {
    if (!value) {
      return;
    }
    queueMicrotask(() => setRules(value));
  }, [value]);

  const handleAddRule = () => {
    if (newRule) {
      setRules([...rules, newRule]);
      setNewRule('');
    }
  };

  return (
    <AccordionSection icon={ShieldCheck} title={kloelT(`Regras de atendimento`)}>
      <div className="space-y-4">
        {rules.length > 0 && (
          <div className="space-y-2">
            {rules.map((rule, i) => {
              const key = buildDuplicateAwareKey('rule', rules, i);
              return (
                <div key={key} className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-700">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-gray-700">{rule}</span>
                  <button
                    type="button"
                    onClick={() => setRules(rules.filter((_, idx) => idx !== i))}
                  >
                    <Trash2
                      className="h-4 w-4 text-gray-400 hover:text-red-500"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            placeholder={kloelT(`Nova regra...`)}
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddRule()}
            className="rounded-xl border-gray-200"
          />
          <Button onClick={handleAddRule} variant="outline" className="rounded-xl bg-transparent">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <Button
          onClick={() => onSave?.(rules)}
          disabled={disabled || saving}
          className="w-full rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]"
        >
          {kloelT(`Salvar regras`)}
        </Button>
      </div>
    </AccordionSection>
  );
}
