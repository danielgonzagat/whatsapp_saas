"use client"

import { useState } from "react"
import { Plus, Trash2, Link, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
    <div className="mt-4 border-t border-gray-200 pt-4">
      <div className="mb-3 flex items-center gap-2">
        <Link className="h-4 w-4 text-gray-500" />
        <h6 className="text-sm font-medium text-gray-700">Planos & links de checkout</h6>
      </div>

      {plans.length > 0 && (
        <div className="mb-3 space-y-2">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="flex items-center justify-between rounded-lg bg-white p-3 border border-gray-100"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{plan.name}</span>
                  {plan.isDefault && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Padrão
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {planTypes.find((t) => t.value === plan.type)?.label} · {plan.price} ·{" "}
                  {providers.find((p) => p.value === plan.provider)?.label}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!plan.isDefault && (
                  <button
                    onClick={() => handleSetDefault(plan.id)}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-green-600"
                    title="Definir como padrão"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => handleRemovePlan(plan.id)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddPlan ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h6 className="mb-3 text-sm font-medium text-gray-900">Novo plano de checkout</h6>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs text-gray-500">Nome do plano</Label>
              <Input
                placeholder="Ex: Plano Completo, Mensalidade, Anual com desconto"
                value={newPlan.name}
                onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                className="rounded-xl border-gray-200 bg-gray-50"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">Tipo de plano</Label>
                <Select
                  value={newPlan.type}
                  onValueChange={(v: string) => setNewPlan({ ...newPlan, type: v as CheckoutPlan["type"] })}
                >
                  <SelectTrigger className="rounded-xl border-gray-200 bg-gray-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {planTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-gray-500">Preço exibido</Label>
                <Input
                  placeholder="R$ 497,00"
                  value={newPlan.price}
                  onChange={(e) => setNewPlan({ ...newPlan, price: e.target.value })}
                  className="rounded-xl border-gray-200 bg-gray-50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-gray-500">Provedor de checkout</Label>
              <Select value={newPlan.provider} onValueChange={(v: string) => setNewPlan({ ...newPlan, provider: v })}>
                <SelectTrigger className="rounded-xl border-gray-200 bg-gray-50">
                  <SelectValue placeholder="Selecione o provedor" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.value} value={provider.value}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-gray-500">Link de checkout</Label>
              <Input
                placeholder="https://..."
                value={newPlan.checkoutLink}
                onChange={(e) => setNewPlan({ ...newPlan, checkoutLink: e.target.value })}
                className="rounded-xl border-gray-200 bg-gray-50"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="defaultPlan"
                checked={newPlan.isDefault}
                onChange={(e) => setNewPlan({ ...newPlan, isDefault: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="defaultPlan" className="text-sm text-gray-700">
                Plano padrão para este produto
              </label>
            </div>

            <p className="text-xs text-gray-500">
              O Kloel usará esse link quando estiver fechando vendas deste produto no WhatsApp. O sistema não cria links
              automaticamente, ele usa o link que você informar aqui.
            </p>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddPlan(false)} className="flex-1 rounded-xl">
                Cancelar
              </Button>
              <Button onClick={handleAddPlan} className="flex-1 rounded-xl bg-gray-900 text-white hover:bg-gray-800">
                Salvar plano
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={() => setShowAddPlan(true)}
          className="w-full rounded-xl border-dashed border-gray-300 bg-transparent text-sm"
        >
          <Plus className="mr-2 h-4 w-4" />
          Adicionar novo plano de checkout
        </Button>
      )}
    </div>
  )
}
