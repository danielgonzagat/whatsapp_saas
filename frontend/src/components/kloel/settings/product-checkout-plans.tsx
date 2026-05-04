'use client';

import { kloelT } from '@/lib/i18n/t';
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
import { Check, Link, Plus, Trash2 } from 'lucide-react';
import { useState, useId } from 'react';
import { SettingsInset, SettingsStatusPill, kloelSettingsClass } from './contract';
import { colors } from '@/lib/design-tokens';

/** Checkout plan shape. */
export interface CheckoutPlan {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Type property. */
  type: 'single' | 'monthly' | 'annual';
  /** Price property. */
  price: string;
  /** Is default property. */
  isDefault: boolean;
}

interface ProductCheckoutPlansProps {
  plans: CheckoutPlan[];
  onPlansChange: (plans: CheckoutPlan[]) => void;
}

/** Product checkout plans. */
export function ProductCheckoutPlans({ plans, onPlansChange }: ProductCheckoutPlansProps) {
  const fid = useId();
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [newPlan, setNewPlan] = useState<Omit<CheckoutPlan, 'id'>>({
    name: '',
    type: 'single',
    price: '',
    isDefault: false,
  });

  const planTypes = [
    { value: 'single', label: 'Pagamento único' },
    { value: 'monthly', label: 'Assinatura mensal' },
    { value: 'annual', label: 'Assinatura anual' },
  ];

  const handleAddPlan = () => {
    if (newPlan.name && newPlan.price) {
      const plan: CheckoutPlan = {
        ...newPlan,
        id: Date.now().toString(),
        isDefault: plans.length === 0 || newPlan.isDefault,
      };

      // If this plan is default, unset others
      let updatedPlans = plans;
      if (plan.isDefault) {
        updatedPlans = plans.map((p) => ({ ...p, isDefault: false }));
      }

      onPlansChange([...updatedPlans, plan]);
      setNewPlan({
        name: '',
        type: 'single',
        price: '',
        isDefault: false,
      });
      setShowAddPlan(false);
    }
  };

  const handleRemovePlan = (id: string) => {
    onPlansChange(plans.filter((p) => p.id !== id));
  };

  const handleSetDefault = (id: string) => {
    onPlansChange(plans.map((p) => ({ ...p, isDefault: p.id === id })));
  };

  return (
    <div className="mt-4 border-t border-[colors.background.elevated] pt-4">
      <div className="mb-3 flex items-center gap-2">
        <Link className="h-4 w-4 text-[colors.text.muted]" aria-hidden="true" />
        <h6 className="text-sm font-medium text-[colors.text.silver]">
          {kloelT(`Planos do checkout interno`)}
        </h6>
      </div>

      {plans.length > 0 && (
        <div className="mb-3 space-y-2">
          {plans.map((plan) => (
            <SettingsInset key={plan.id} className="flex items-center justify-between p-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[colors.text.silver]">{plan.name}</span>
                  {plan.isDefault && (
                    <SettingsStatusPill tone="success">{kloelT(`Padrão`)}</SettingsStatusPill>
                  )}
                </div>
                <p className="text-xs text-[colors.text.muted]">
                  {planTypes.find((t) => t.value === plan.type)?.label} · {plan.price}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!plan.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(plan.id)}
                    className="rounded-md p-2 text-[colors.text.muted] hover:bg-[colors.background.elevated] hover:text-[#7FE2BC]"
                    title={kloelT(`Definir como padrão`)}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleRemovePlan(plan.id)}
                  className="rounded-md p-2 text-[colors.text.muted] hover:bg-[colors.background.elevated] hover:text-[#E05252]"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </SettingsInset>
          ))}
        </div>
      )}

      {showAddPlan ? (
        <div className="rounded-md border border-[colors.background.elevated] bg-[colors.background.void] p-4">
          <h6 className="mb-3 text-sm font-medium text-[colors.text.silver]">
            {kloelT(`Novo plano do checkout`)}
          </h6>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className={kloelSettingsClass.label}>{kloelT(`Nome do plano`)}</Label>
              <Input
                placeholder={kloelT(`Ex: Plano Completo, Mensalidade, Anual com desconto`)}
                value={newPlan.name}
                onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                className={kloelSettingsClass.input}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className={kloelSettingsClass.label}>{kloelT(`Tipo de plano`)}</Label>
                <Select
                  value={newPlan.type}
                  onValueChange={(v: string) =>
                    setNewPlan({ ...newPlan, type: v as CheckoutPlan['type'] })
                  }
                >
                  <SelectTrigger className={kloelSettingsClass.selectTrigger}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={kloelSettingsClass.selectContent}>
                    {planTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className={kloelSettingsClass.label}>{kloelT(`Preço exibido`)}</Label>
                <Input
                  placeholder={kloelT(`R$ 497,00`)}
                  value={newPlan.price}
                  onChange={(e) => setNewPlan({ ...newPlan, price: e.target.value })}
                  className={kloelSettingsClass.input}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`${fid}-defaultPlan`}
                aria-label="Definir como plano padrão para este produto"
                checked={newPlan.isDefault}
                onChange={(e) => setNewPlan({ ...newPlan, isDefault: e.target.checked })}
                className="h-4 w-4 rounded border-[colors.border.space] bg-[colors.background.surface]"
              />
              <label htmlFor={`${fid}-defaultPlan`} className="text-sm text-[colors.text.silver]">
                {kloelT(`Plano padrão para este produto`)}
              </label>
            </div>

            <p className="text-xs text-[colors.text.muted]">
              {kloelT(`O checkout e o link público são criados automaticamente pelo próprio Kloel. Aqui você
              organiza apenas a lógica comercial do plano.`)}
            </p>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowAddPlan(false)}
                className={`flex-1 ${kloelSettingsClass.outlineButton}`}
              >
                {kloelT(`Cancelar`)}
              </Button>
              <Button
                onClick={handleAddPlan}
                className={`flex-1 ${kloelSettingsClass.primaryButton}`}
              >
                {kloelT(`Salvar plano`)}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={() => setShowAddPlan(true)}
          className="w-full rounded-md border-dashed border-[colors.border.space] bg-transparent text-sm text-[colors.text.muted] hover:bg-[colors.background.elevated] hover:text-[colors.text.silver]"
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />

          {kloelT(`Adicionar novo plano interno`)}
        </Button>
      )}
    </div>
  );
}
