"use client"

import { useState } from "react"
import { Plus, Trash2, Link, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { kloelSettingsClass, SettingsInset, SettingsStatusPill } from "./contract"

export interface CheckoutPlan {
  id: string
  name: string
  type: "single" | "monthly" | "annual"
  price: string
  provider: string
  checkoutLink: string
  isDefault: boolean
}

interface ProductCheckoutPlansProps {
  plans: CheckoutPlan[]
  onPlansChange: (plans: CheckoutPlan[]) => void
}

export function ProductCheckoutPlans({ plans, onPlansChange }: ProductCheckoutPlansProps) {
  const [showAddPlan, setShowAddPlan] = useState(false)
  const [newPlan, setNewPlan] = useState<Omit<CheckoutPlan, "id">>({
    name: "",
    type: "single",
    price: "",
    provider: "",
    checkoutLink: "",
    isDefault: false,
  })

  const providers = [
    { value: "hotmart", label: "Hotmart" },
    { value: "kiwify", label: "Kiwify" },
    { value: "braip", label: "Braip" },
    { value: "mercadopago", label: "Mercado Pago" },
    { value: "pagarme", label: "Pagar.me" },
    { value: "stripe", label: "Stripe" },
    { value: "other", label: "Outro" },
  ]

  const planTypes = [
    { value: "single", label: "Pagamento único" },
    { value: "monthly", label: "Assinatura mensal" },
    { value: "annual", label: "Assinatura anual" },
  ]

  const handleAddPlan = () => {
    if (newPlan.name && newPlan.checkoutLink) {
      const plan: CheckoutPlan = {
        ...newPlan,
        id: Date.now().toString(),
        isDefault: plans.length === 0 || newPlan.isDefault,
      }

      // If this plan is default, unset others
      let updatedPlans = plans
      if (plan.isDefault) {
        updatedPlans = plans.map((p) => ({ ...p, isDefault: false }))
      }

      onPlansChange([...updatedPlans, plan])
      setNewPlan({
        name: "",
        type: "single",
        price: "",
        provider: "",
        checkoutLink: "",
        isDefault: false,
      })
      setShowAddPlan(false)
    }
  }

  const handleRemovePlan = (id: string) => {
    onPlansChange(plans.filter((p) => p.id !== id))
  }

  const handleSetDefault = (id: string) => {
    onPlansChange(plans.map((p) => ({ ...p, isDefault: p.id === id })))
  }

  return (
    <div className="mt-4 border-t border-[#19191C] pt-4">
      <div className="mb-3 flex items-center gap-2">
        <Link className="h-4 w-4 text-[#6E6E73]" />
        <h6 className="text-sm font-medium text-[#E0DDD8]">Planos & links de checkout</h6>
      </div>

      {plans.length > 0 && (
        <div className="mb-3 space-y-2">
          {plans.map((plan) => (
            <SettingsInset
              key={plan.id}
              className="flex items-center justify-between p-3"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#E0DDD8]">{plan.name}</span>
                  {plan.isDefault && (
                    <SettingsStatusPill tone="success">Padrão</SettingsStatusPill>
                  )}
                </div>
                <p className="text-xs text-[#6E6E73]">
                  {planTypes.find((t) => t.value === plan.type)?.label} · {plan.price} ·{" "}
                  {providers.find((p) => p.value === plan.provider)?.label}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!plan.isDefault && (
                  <button
                    onClick={() => handleSetDefault(plan.id)}
                    className="rounded-md p-2 text-[#6E6E73] hover:bg-[#19191C] hover:text-[#7FE2BC]"
                    title="Definir como padrão"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => handleRemovePlan(plan.id)}
                  className="rounded-md p-2 text-[#6E6E73] hover:bg-[#19191C] hover:text-[#E05252]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </SettingsInset>
          ))}
        </div>
      )}

      {showAddPlan ? (
        <div className="rounded-md border border-[#19191C] bg-[#0A0A0C] p-4">
          <h6 className="mb-3 text-sm font-medium text-[#E0DDD8]">Novo plano de checkout</h6>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className={kloelSettingsClass.label}>Nome do plano</Label>
              <Input
                placeholder="Ex: Plano Completo, Mensalidade, Anual com desconto"
                value={newPlan.name}
                onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                className={kloelSettingsClass.input}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className={kloelSettingsClass.label}>Tipo de plano</Label>
                <Select
                  value={newPlan.type}
                  onValueChange={(v: string) => setNewPlan({ ...newPlan, type: v as CheckoutPlan["type"] })}
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
                <Label className={kloelSettingsClass.label}>Preço exibido</Label>
                <Input
                  placeholder="R$ 497,00"
                  value={newPlan.price}
                  onChange={(e) => setNewPlan({ ...newPlan, price: e.target.value })}
                  className={kloelSettingsClass.input}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className={kloelSettingsClass.label}>Provedor de checkout</Label>
              <Select value={newPlan.provider} onValueChange={(v: string) => setNewPlan({ ...newPlan, provider: v })}>
                <SelectTrigger className={kloelSettingsClass.selectTrigger}>
                  <SelectValue placeholder="Selecione o provedor" />
                </SelectTrigger>
                <SelectContent className={kloelSettingsClass.selectContent}>
                  {providers.map((provider) => (
                    <SelectItem key={provider.value} value={provider.value}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className={kloelSettingsClass.label}>Link de checkout</Label>
              <Input
                placeholder="https://..."
                value={newPlan.checkoutLink}
                onChange={(e) => setNewPlan({ ...newPlan, checkoutLink: e.target.value })}
                className={kloelSettingsClass.input}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="defaultPlan"
                aria-label="Definir como plano padrão para este produto"
                checked={newPlan.isDefault}
                onChange={(e) => setNewPlan({ ...newPlan, isDefault: e.target.checked })}
                className="h-4 w-4 rounded border-[#222226] bg-[#111113]"
              />
              <label htmlFor="defaultPlan" className="text-sm text-[#E0DDD8]">
                Plano padrão para este produto
              </label>
            </div>

            <p className="text-xs text-[#6E6E73]">
              O Kloel usará esse link quando estiver fechando vendas deste produto no WhatsApp. O sistema não cria links
              automaticamente, ele usa o link que você informar aqui.
            </p>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddPlan(false)} className={`flex-1 ${kloelSettingsClass.outlineButton}`}>
                Cancelar
              </Button>
              <Button onClick={handleAddPlan} className={`flex-1 ${kloelSettingsClass.primaryButton}`}>
                Salvar plano
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={() => setShowAddPlan(true)}
          className="w-full rounded-md border-dashed border-[#222226] bg-transparent text-sm text-[#6E6E73] hover:bg-[#19191C] hover:text-[#E0DDD8]"
        >
          <Plus className="mr-2 h-4 w-4" />
          Adicionar novo plano de checkout
        </Button>
      )}
    </div>
  )
}
