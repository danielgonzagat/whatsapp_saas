'use client';

import { kloelT } from '@/lib/i18n/t';
import type { FaqItem } from './brain-settings-section.helpers';
import { AccordionSection } from './accordion-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { HelpCircle, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface FaqSectionProps {
  value?: FaqItem[];
  saving?: boolean;
  disabled?: boolean;
  onSave?: (payload: FaqItem[]) => void | Promise<void>;
}

export function FaqSection({
  value,
  saving = false,
  disabled = false,
  onSave,
}: FaqSectionProps) {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [showAddFaq, setShowAddFaq] = useState(false);
  const [newFaq, setNewFaq] = useState({ question: '', answer: '' });

  useEffect(() => {
    if (!value) {
      return;
    }
    setFaqs(value);
  }, [value]);

  const handleAddFaq = () => {
    if (newFaq.question && newFaq.answer) {
      setFaqs([...faqs, { id: Date.now().toString(), ...newFaq }]);
      setNewFaq({ question: '', answer: '' });
      setShowAddFaq(false);
    }
  };

  return (
    <AccordionSection icon={HelpCircle} title={kloelT(`FAQ - Perguntas frequentes`)}>
      <div className="space-y-4">
        {faqs.length > 0 && (
          <div className="space-y-2">
            {faqs.map((faq) => (
              <div key={faq.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="mb-2 flex items-start justify-between">
                  <p className="font-medium text-gray-900">{faq.question}</p>
                  <button
                    type="button"
                    onClick={() => setFaqs(faqs.filter((f) => f.id !== faq.id))}
                  >
                    <Trash2
                      className="h-4 w-4 text-gray-400 hover:text-red-500"
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <p className="text-sm text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        )}

        {showAddFaq ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="space-y-3">
              <Input
                placeholder={kloelT(`Pergunta`)}
                value={newFaq.question}
                onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                className="rounded-xl border-gray-200"
              />
              <Textarea
                placeholder={kloelT(`Resposta`)}
                value={newFaq.answer}
                onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                className="min-h-[60px] rounded-xl border-gray-200"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowAddFaq(false)}
                  className="flex-1 rounded-xl"
                >
                  {kloelT(`Cancelar`)}
                </Button>
                <Button
                  onClick={handleAddFaq}
                  className="flex-1 rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]"
                >
                  {kloelT(`Salvar`)}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => setShowAddFaq(true)}
            className="w-full rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]"
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> {kloelT(`Adicionar pergunta`)}
          </Button>
        )}
        <Button
          onClick={() => onSave?.(faqs)}
          disabled={disabled || saving}
          className="w-full rounded-xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
        >
          {kloelT(`Salvar FAQ`)}
        </Button>
      </div>
    </AccordionSection>
  );
}
