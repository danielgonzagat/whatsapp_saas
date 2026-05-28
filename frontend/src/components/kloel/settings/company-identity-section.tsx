'use client';

import { kloelT } from '@/lib/i18n/t';
import type { CompanyProfile } from './brain-settings-section.helpers';
import { AccordionSection } from './accordion-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Building2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { buildDuplicateAwareKey } from './duplicate-aware-key.helper';

interface CompanyIdentitySectionProps {
  value?: CompanyProfile;
  saving?: boolean;
  disabled?: boolean;
  onSave?: (payload: CompanyProfile) => void | Promise<void>;
}

export function CompanyIdentitySection({
  value,
  saving = false,
  disabled = false,
  onSave,
}: CompanyIdentitySectionProps) {
  const [company, setCompany] = useState<CompanyProfile>({
    name: '',
    sector: '',
    description: '',
    mission: '',
    differentials: [''],
  });

  useEffect(() => {
    if (!value) {
      return;
    }
    queueMicrotask(() => {
      setCompany({
        name: value.name || '',
        sector: value.sector || '',
        description: value.description || '',
        mission: value.mission || '',
        differentials: value.differentials.length > 0 ? value.differentials : [''],
      });
    });
  }, [value]);

  return (
    <AccordionSection icon={Building2} title={kloelT(`Identidade da empresa`)} defaultOpen>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm text-gray-700">{kloelT(`Nome da empresa`)}</Label>
          <Input
            placeholder={kloelT(`Ex: Minha Loja Digital`)}
            value={company.name}
            onChange={(e) => setCompany({ ...company, name: e.target.value })}
            className="rounded-xl border-gray-200"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm text-gray-700">{kloelT(`Setor de atuacao`)}</Label>
          <Select
            value={company.sector}
            onValueChange={(v: string) => setCompany({ ...company, sector: v })}
          >
            <SelectTrigger className="rounded-xl border-gray-200">
              <SelectValue placeholder={kloelT(`Selecione o setor`)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ecommerce">{kloelT(`E-commerce`)}</SelectItem>
              <SelectItem value="infoproduct">{kloelT(`Infoprodutos`)}</SelectItem>
              <SelectItem value="services">{kloelT(`Servicos`)}</SelectItem>
              <SelectItem value="saas">{kloelT(`SaaS`)}</SelectItem>
              <SelectItem value="retail">{kloelT(`Varejo`)}</SelectItem>
              <SelectItem value="other">{kloelT(`Outro`)}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-sm text-gray-700">{kloelT(`Descricao do negocio`)}</Label>
          <Textarea
            placeholder={kloelT(`Descreva brevemente o que sua empresa faz...`)}
            value={company.description}
            onChange={(e) => setCompany({ ...company, description: e.target.value })}
            className="min-h-[80px] rounded-xl border-gray-200"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm text-gray-700">{kloelT(`Missao / Proposta de valor`)}</Label>
          <Textarea
            placeholder={kloelT(`Qual o proposito da sua empresa?`)}
            value={company.mission}
            onChange={(e) => setCompany({ ...company, mission: e.target.value })}
            className="min-h-[60px] rounded-xl border-gray-200"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm text-gray-700">{kloelT(`Diferenciais competitivos`)}</Label>
          {company.differentials.map((diff, i) => {
            const key = buildDuplicateAwareKey('differential', company.differentials, i);
            return (
              <div key={key} className="flex gap-2">
                <Input
                  placeholder={`Diferencial ${i + 1}`}
                  value={diff}
                  onChange={(e) => {
                    const newDiffs = [...company.differentials];
                    newDiffs[i] = e.target.value;
                    setCompany({ ...company, differentials: newDiffs });
                  }}
                  className="rounded-xl border-gray-200"
                />
                {i > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const newDiffs = company.differentials.filter((_, idx) => idx !== i);
                      setCompany({ ...company, differentials: newDiffs });
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  </Button>
                )}
              </div>
            );
          })}
          <Button
            variant="ghost"
            onClick={() =>
              setCompany({ ...company, differentials: [...company.differentials, ''] })
            }
            className="text-sm text-gray-600"
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> {kloelT(`Adicionar diferencial`)}
          </Button>
        </div>
        <Button
          onClick={() => onSave?.(company)}
          disabled={disabled || saving}
          className="w-full rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]"
        >
          {kloelT(`Salvar identidade`)}
        </Button>
      </div>
    </AccordionSection>
  );
}
